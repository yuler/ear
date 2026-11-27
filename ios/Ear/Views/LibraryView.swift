import SwiftUI

struct LibraryView: View {
    @Bindable var engine: MirrorEngine
    @Binding var incomingPairPayload: PairPayload?

    @State private var settingsPresented = false
    @State private var pairSheetMode: PairSheetMode?
    @State private var selectedVideoId: String?
    @State private var showRemovedSection = false
    @State private var toast: ToastMessage?
    @State private var toastTask: Task<Void, Never>?
    @State private var pendingDeleteTasks: [String: Task<Void, Never>] = [:]

    private var copy: AppCopy { AppCopy(engine.settings.language) }

    private var activeItems: [MirrorItemView] {
        engine.library.filter { $0.status != .removed }
    }

    private var removedItems: [MirrorItemView] {
        engine.library.filter { $0.status == .removed }
    }

    var body: some View {
        NavigationStack {
            Group {
                if engine.macs.isEmpty && activeItems.isEmpty {
                    unpairedEmptyView
                } else if activeItems.isEmpty && removedItems.isEmpty {
                    noVideosEmptyView
                } else {
                    libraryListView
                }
            }
            .navigationTitle(copy.appTitle)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        pairSheetMode = .scanner
                    } label: {
                        Image(systemName: "qrcode.viewfinder")
                    }
                    .accessibilityLabel(copy.scanToPair)

                    Button {
                        settingsPresented = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel(copy.settingsTitle)
                }
            }
            .navigationDestination(item: $selectedVideoId) { videoId in
                VideoDetailView(
                    videoId: videoId,
                    engine: engine,
                    onToast: { showToast($0) }
                )
            }
            .sheet(isPresented: $settingsPresented) {
                SettingsSheetView(
                    engine: engine,
                    onPairNew: {
                        settingsPresented = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            pairSheetMode = .scanner
                        }
                    }
                )
            }
            .sheet(item: $pairSheetMode) { mode in
                PairSheetView(
                    engine: engine,
                    initialMode: mode,
                    onPaired: { mac in
                        showToast(copy.toastPaired(mac.shortName))
                    }
                )
            }
            .overlay(alignment: .bottom) {
                if let toast {
                    toastBanner(toast)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: toast)
            .onChange(of: incomingPairPayload) { _, payload in
                guard let payload else { return }
                incomingPairPayload = nil
                settingsPresented = false
                pairSheetMode = .deepLink(payload)
            }
            .onChange(of: engine.lastNotice) { _, notice in
                guard case let .removedByPC(macName) = notice else { return }
                showToast(copy.toastRemovedByPC(macName))
                engine.clearNotice()
            }
        }
    }

    private var unpairedEmptyView: some View {
        ContentUnavailableView {
            Label(copy.connectTitle, systemImage: "headphones")
        } description: {
            Text(copy.connectBody)
        } actions: {
            VStack(spacing: 12) {
                Button {
                    pairSheetMode = .scanner
                } label: {
                    Label(copy.scanToPair, systemImage: "qrcode.viewfinder")
                        .frame(minWidth: 180)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button(copy.manualPairBtn) {
                    pairSheetMode = .manual
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var noVideosEmptyView: some View {
        List {
            statusBannerSection
            ContentUnavailableView {
                Label(copy.noVideosYet, systemImage: "film.stack")
            } description: {
                Text(copy.noVideosHint)
            }
            .listRowBackground(Color.clear)
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await engine.pollAllMacs()
        }
    }

    private var libraryListView: some View {
        List {
            if !engine.macs.isEmpty {
                statusBannerSection
            }

            Section {
                ForEach(activeItems) { item in
                    Button {
                        handleTap(item)
                    } label: {
                        LibraryItemRow(item: item, copy: copy)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            handleDelete(item)
                        } label: {
                            Label(copy.delete, systemImage: "trash")
                        }
                    }
                }
            }

            if !removedItems.isEmpty {
                Section {
                    DisclosureGroup(isExpanded: $showRemovedSection) {
                        ForEach(removedItems) { item in
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title)
                                        .font(.subheadline)
                                        .lineLimit(1)
                                    Text(formatBytes(item.sizeBytes))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button(copy.remirror) {
                                    engine.remirror(videoId: item.videoId)
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                        }
                    } label: {
                        Label("\(copy.onComputerOnlySection) (\(removedItems.count))", systemImage: "desktopcomputer")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await engine.pollAllMacs()
        }
    }

    private var statusBannerSection: some View {
        let stats = engine.syncStats
        let onlineNames = engine.macs.filter { engine.onlineMacIds.contains($0.id) }.map(\.shortName)
        return Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    if engine.pausedInBackground {
                        Image(systemName: "pause.circle.fill")
                            .foregroundStyle(.orange)
                        Text(copy.bannerPausedBg)
                            .font(.footnote.weight(.medium))
                    } else if onlineNames.isEmpty {
                        Image(systemName: "wifi.exclamationmark")
                            .foregroundStyle(.orange)
                        Text(copy.bannerOffline)
                            .font(.footnote.weight(.medium))
                    } else if !stats.complete {
                        ProgressView()
                            .controlSize(.small)
                        Text(copy.bannerSyncing(done: stats.ready, total: stats.reachableWanted, active: stats.syncing))
                            .font(.footnote.weight(.medium))
                    } else {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text(copy.bannerSynced(names: onlineNames, awayCount: stats.away))
                            .font(.footnote.weight(.medium))
                    }
                }
                if !stats.complete && !onlineNames.isEmpty && !engine.pausedInBackground {
                    ProgressView(value: stats.overallProgress)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func handleTap(_ item: MirrorItemView) {
        if item.status == .ready {
            selectedVideoId = item.videoId
            return
        }
        engine.prioritize(videoId: item.videoId)
        switch item.status {
        case .syncing:
            showToast(copy.toastSyncingTap(Int((item.progress * 100).rounded())))
        case .away:
            showToast(copy.toastAwayTap(item.sources.first?.shortName ?? item.fallbackSourceShortName ?? ""))
        default:
            showToast(copy.toastPrioritized(item.title))
        }
    }

    private func handleDelete(_ item: MirrorItemView) {
        pendingDeleteTasks[item.videoId]?.cancel()
        let previous = engine.deleteLocal(videoId: item.videoId)
        let videoId = item.videoId
        pendingDeleteTasks[videoId] = Task {
            try? await Task.sleep(for: .seconds(4.2))
            guard !Task.isCancelled else { return }
            pendingDeleteTasks.removeValue(forKey: videoId)
            await engine.commitDeleteFiles(videoId: videoId)
        }
        showToast(copy.toastDeleted(item.title), undo: {
            pendingDeleteTasks[videoId]?.cancel()
            pendingDeleteTasks.removeValue(forKey: videoId)
            engine.restoreLocal(videoId: videoId, previous: previous)
        })
    }

    private func showToast(_ text: String, undo: (() -> Void)? = nil) {
        toastTask?.cancel()
        let message = ToastMessage(text: text, undo: undo)
        toast = message
        toastTask = Task {
            try? await Task.sleep(for: .seconds(undo == nil ? 2.6 : 4.0))
            guard !Task.isCancelled else { return }
            if toast?.id == message.id { toast = nil }
        }
    }

    private func toastBanner(_ msg: ToastMessage) -> some View {
        HStack(spacing: 12) {
            Text(msg.text)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(2)
            Spacer(minLength: 8)
            if let undo = msg.undo {
                Button(copy.undo) {
                    toast = nil
                    undo()
                }
                .font(.footnote.weight(.bold))
                .buttonStyle(.borderless)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
    }
}

private struct ToastMessage: Equatable, Identifiable {
    let id = UUID()
    let text: String
    let undo: (() -> Void)?

    static func == (lhs: ToastMessage, rhs: ToastMessage) -> Bool {
        lhs.id == rhs.id
    }
}

private struct LibraryItemRow: View {
    let item: MirrorItemView
    let copy: AppCopy

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)

                HStack(spacing: 6) {
                    statusPill
                    if let sourceLabel {
                        Text(sourceLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Text(formatBytes(item.sizeBytes))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }

    private var thumbnail: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let url = URL(string: item.thumbnailUrl), !item.thumbnailUrl.isEmpty {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            placeholderArt
                        }
                    }
                } else {
                    placeholderArt
                }
            }
            .frame(width: 96, height: 54)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            if let durationMs = item.durationMs, durationMs > 0 {
                Text(CaptionSegmentation.formatTime(durationMs))
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 4))
                    .padding(4)
            }

            if item.status == .syncing {
                GeometryReader { geo in
                    VStack {
                        Spacer()
                        Rectangle()
                            .fill(Color.accentColor)
                            .frame(width: geo.size.width * max(0.05, item.progress), height: 3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .frame(width: 96, height: 54)
    }

    private var placeholderArt: some View {
        ZStack {
            Color(.secondarySystemFill)
            Image(systemName: item.isAudioOnly ? "music.note" : "play.rectangle.fill")
                .foregroundStyle(.secondary)
        }
    }

    private var sourceLabel: String? {
        let names = item.sources.map(\.shortName)
        if !names.isEmpty { return names.joined(separator: " · ") }
        return item.fallbackSourceShortName
    }

    @ViewBuilder
    private var statusPill: some View {
        switch item.status {
        case .ready:
            Label(copy.statusOfflineReady, systemImage: "checkmark.circle.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.green)
        case .syncing:
            Text(copy.statusSyncing(Int((item.progress * 100).rounded())))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .monospacedDigit()
        case .queued:
            Text(item.priority ? copy.statusPriority : copy.statusQueued)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(item.priority ? Color.accentColor : .secondary)
        case .away:
            Text(copy.statusAway(item.sources.first?.shortName ?? ""))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.orange)
        case .removed:
            EmptyView()
        }
    }
}

func formatBytes(_ bytes: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: max(0, bytes), countStyle: .file)
}
