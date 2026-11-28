import Foundation
import Observation
import UIKit

// Transfer scheduling and execution live in MirrorEngine+Transfer.swift.

public enum MirrorNotice: Equatable, Sendable {
    case removedByPC(macName: String)
}

@MainActor
@Observable
public final class MirrorEngine {
    public private(set) var settings: MirrorSettings = MirrorSettings()
    public private(set) var macs: [PairedMac] = []
    public internal(set) var onlineMacIds: Set<String> = []
    public private(set) var catalogs: [String: [RemoteCatalogItem]] = [:]
    public internal(set) var localItems: [String: LocalItemRecord] = [:]
    public internal(set) var activeVideoIds: Set<String> = []
    public internal(set) var priorityQueue: [String] = []
    public private(set) var pausedInBackground: Bool = false
    public private(set) var lastNotice: MirrorNotice?
    public private(set) var isHydrated: Bool = false

    let api: MirrorAPIClientProtocol
    let files: MirrorFileStoring
    let tokens: TokenStoring
    var activeTasks: [String: Task<Void, Never>] = [:]
    var activeTransferMacs: [String: String] = [:]
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private var isPolling = false

    public init(
        api: MirrorAPIClientProtocol = HTTPMirrorAPIClient(),
        files: MirrorFileStoring = DiskMirrorFileStore(),
        tokens: TokenStoring = KeychainTokenStore()
    ) {
        self.api = api
        self.files = files
        self.tokens = tokens
    }

    public var library: [MirrorItemView] {
        MirrorSelectors.buildLibraryView(
            macs: macs,
            onlineMacIds: onlineMacIds,
            pausedInBackground: pausedInBackground,
            catalogs: catalogs,
            localItems: localItems,
            activeVideoIds: activeVideoIds,
            priorityQueue: priorityQueue
        )
    }

    public var syncStats: SyncStats {
        MirrorSelectors.computeSyncStats(library)
    }

    public var storageSummary: OfflineStorageSummary {
        MirrorSelectors.computeOfflineStorageSummary(localItems)
    }

    public func hydrate() async {
        guard !isHydrated else { return }
        let data = await files.loadState()
        settings = data.settings
        macs = data.macs
        localItems = data.localItems
        catalogs = data.catalogs
        isHydrated = true
    }

    public func persist() {
        let snapshot = PersistedMobileData(
            settings: settings,
            macs: macs,
            localItems: localItems,
            catalogs: catalogs
        )
        Task { await files.saveState(snapshot) }
    }

    public func clearNotice() {
        lastNotice = nil
    }

    public func updateAppearance(_ appearance: AppAppearance) {
        settings.appearance = appearance
        persist()
    }

    public func updateAccent(_ accent: AppAccent) {
        settings.accent = accent
        persist()
    }

    public func updateLanguage(_ language: AppLanguage) {
        settings.language = language
        persist()
    }

    public func updateBackgroundSync(_ enabled: Bool) {
        settings.backgroundSync = enabled
        persist()
    }

    public func macSyncCounts(for macId: String) -> (done: Int, total: Int) {
        MirrorSelectors.computeMacSyncCounts(macId: macId, catalogs: catalogs, localItems: localItems)
    }

    public func playableURL(for item: MirrorItemView) async -> URL? {
        guard let fileName = item.localFileName else { return nil }
        return await files.mediaURL(videoId: item.videoId, fileName: fileName)
    }

    public func thumbnailURL(for item: MirrorItemView) async -> URL? {
        guard let fileName = item.thumbnailFileName else { return nil }
        return await files.thumbnailURL(videoId: item.videoId, fileName: fileName)
    }

    public func loadCaptions(for videoId: String, mode: SentenceLengthMode) async -> LoadedLocalCaptions {
        guard let data = await files.readCaptions(videoId: videoId) else {
            return LoadedLocalCaptions()
        }
        return CaptionSegmentation.parseCaptionsPayload(data, mode: mode)
    }

    public func loadStudyState(for videoId: String) async -> VideoStudyState {
        await files.loadStudyState(videoId: videoId)
    }

    public func saveStudyState(_ state: VideoStudyState, for videoId: String) {
        Task { await files.saveStudyState(videoId: videoId, state: state) }
    }

    @discardableResult
    public func pairWith(
        host: String,
        port: Int,
        code: String,
        deviceName: String = UIDevice.current.name
    ) async throws -> PairedMac {
        let existingDeviceId = macs.first?.deviceId
        let response = try await api.pair(
            host: host,
            port: port,
            code: code,
            deviceName: deviceName,
            deviceId: existingDeviceId
        )
        tokens.save(token: response.token, forServerId: response.serverId)
        let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
        let paired = PairedMac(
            id: response.serverId,
            name: response.serverName,
            shortName: response.shortName,
            transport: response.transport,
            host: host,
            port: port,
            deviceId: response.deviceId,
            pairedAt: nowMs,
            lastSyncedAt: nil
        )
        if let idx = macs.firstIndex(where: { $0.id == paired.id }) {
            macs[idx] = paired
        } else {
            macs.append(paired)
        }
        onlineMacIds.insert(paired.id)
        persist()
        await pollMac(paired)
        return paired
    }

    public func unpairMac(id: String) async {
        guard let mac = macs.first(where: { $0.id == id }) else { return }
        if let token = tokens.token(forServerId: id) {
            await api.unpair(mac: mac, token: token)
        }
        removeMacLocally(id: id, notifyRemovedByPC: false)
    }

    func removeMacLocally(id: String, notifyRemovedByPC: Bool) {
        let removedName = macs.first(where: { $0.id == id })?.shortName
        tokens.removeToken(forServerId: id)
        macs.removeAll { $0.id == id }
        onlineMacIds.remove(id)
        catalogs.removeValue(forKey: id)

        for (videoId, taskMacId) in activeTransferMacs where taskMacId == id {
            activeTasks[videoId]?.cancel()
            activeTasks.removeValue(forKey: videoId)
            activeTransferMacs.removeValue(forKey: videoId)
            activeVideoIds.remove(videoId)
        }

        // Discard partial files that no remaining paired Mac provides.
        let remainingIds = Set(catalogs.values.flatMap { $0.map(\.videoId) })
        for (vid, rec) in localItems where rec.state == .partial && !remainingIds.contains(vid) {
            localItems.removeValue(forKey: vid)
            Task { await files.removeVideoFiles(videoId: vid) }
        }

        if notifyRemovedByPC, let name = removedName {
            lastNotice = .removedByPC(macName: name)
        }
        persist()
        scheduleTransfers()
    }

    public func pollAllMacs() async {
        guard !isPolling, !macs.isEmpty else { return }
        if pausedInBackground { return }
        isPolling = true
        defer { isPolling = false }

        let currentMacs = macs
        for mac in currentMacs {
            await pollMac(mac)
        }
        scheduleTransfers()
    }

    private func pollMac(_ mac: PairedMac) async {
        guard let token = tokens.token(forServerId: mac.id) else {
            onlineMacIds.remove(mac.id)
            return
        }
        do {
            let catalog = try await api.fetchLibrary(mac: mac, token: token)
            onlineMacIds.insert(mac.id)
            catalogs[mac.id] = catalog.items
            if let idx = macs.firstIndex(where: { $0.id == mac.id }) {
                macs[idx].lastSyncedAt = Int64(Date().timeIntervalSince1970 * 1000)
                if !catalog.serverName.isEmpty { macs[idx].name = catalog.serverName }
                if !catalog.shortName.isEmpty { macs[idx].shortName = catalog.shortName }
            }
            let counts = macSyncCounts(for: mac.id)
            await api.reportStatus(
                mac: mac,
                token: token,
                syncedCount: counts.done,
                totalCount: counts.total,
                background: pausedInBackground
            )
            persist()
        } catch MirrorAPIError.unpaired {
            removeMacLocally(id: mac.id, notifyRemovedByPC: true)
        } catch {
            onlineMacIds.remove(mac.id)
        }
    }

    public func prioritize(videoId: String) {
        priorityQueue.removeAll { $0 == videoId }
        priorityQueue.insert(videoId, at: 0)
        // If all slots are busy with non-priority transfers, preempt one normal transfer.
        if activeVideoIds.count >= MirrorConstants.maxConcurrentTransfers,
           !activeVideoIds.contains(videoId),
           let victim = activeVideoIds.first(where: { !priorityQueue.contains($0) }) {
            activeTasks[victim]?.cancel()
            activeTasks.removeValue(forKey: victim)
            activeTransferMacs.removeValue(forKey: victim)
            activeVideoIds.remove(victim)
        }
        scheduleTransfers()
    }

    public func deleteLocal(videoId: String) -> LocalItemRecord? {
        activeTasks[videoId]?.cancel()
        activeTasks.removeValue(forKey: videoId)
        activeTransferMacs.removeValue(forKey: videoId)
        activeVideoIds.remove(videoId)
        priorityQueue.removeAll { $0 == videoId }

        let before = localItems[videoId]
        let existing = before ?? library.first(where: { $0.videoId == videoId }).map { item in
            LocalItemRecord(
                videoId: item.videoId,
                state: .removed,
                title: item.title,
                thumbnailUrl: item.thumbnailUrl,
                url: item.url,
                site: item.site,
                durationMs: item.durationMs,
                videoWidth: item.videoWidth,
                videoHeight: item.videoHeight,
                quality: item.quality,
                subtitleLabel: item.subtitleLabel,
                subtitleIsAuto: item.subtitleIsAuto,
                sizeBytes: item.sizeBytes,
                contentSha256: item.contentSha256,
                downloadedBytes: 0,
                mediaExt: item.mediaExt,
                mimeType: item.mimeType,
                hasCaptions: item.hasCaptions,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            )
        }
        if var updated = existing {
            updated.state = .removed
            updated.downloadedBytes = 0
            updated.localFileName = nil
            updated.captionsFileName = nil
            updated.thumbnailFileName = nil
            localItems[videoId] = updated
        }
        persist()
        return before
    }

    public func restoreLocal(videoId: String, previous: LocalItemRecord?) {
        if let previous {
            localItems[videoId] = previous
        } else {
            localItems.removeValue(forKey: videoId)
        }
        persist()
        scheduleTransfers()
    }

    public func commitDeleteFiles(videoId: String) async {
        guard localItems[videoId]?.state == .removed else { return }
        await files.removeVideoFiles(videoId: videoId)
    }

    public func remirror(videoId: String) {
        if localItems[videoId]?.state == .removed {
            localItems.removeValue(forKey: videoId)
            persist()
        }
        prioritize(videoId: videoId)
    }

    public func setAppLifecycle(isBackground: Bool) {
        if isBackground {
            if !settings.backgroundSync {
                pausedInBackground = true
                cancelAllTransfers()
            } else if !activeVideoIds.isEmpty {
                beginBackgroundGraceTask()
            }
        } else {
            pausedInBackground = false
            endBackgroundGraceTask()
            Task { await pollAllMacs() }
        }
    }

    private func beginBackgroundGraceTask() {
        guard backgroundTaskId == .invalid else { return }
        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "EarLANMirror") { [weak self] in
            Task { @MainActor in
                self?.pausedInBackground = true
                self?.cancelAllTransfers()
                self?.endBackgroundGraceTask()
            }
        }
    }

    func endBackgroundGraceTask() {
        guard backgroundTaskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskId)
        backgroundTaskId = .invalid
    }

    private func cancelAllTransfers() {
        for task in activeTasks.values { task.cancel() }
        activeTasks.removeAll()
        activeTransferMacs.removeAll()
        activeVideoIds.removeAll()
    }
}
