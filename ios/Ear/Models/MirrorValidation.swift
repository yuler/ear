import Foundation

public enum MirrorConstants {
    public static let defaultPort = 32783
    public static let maxRemoteMediaBytes: Int64 = 16 * 1024 * 1024 * 1024
    public static let maxCaptionsBytes = 4 * 1024 * 1024
    public static let maxThumbnailBytes = 2 * 1024 * 1024
    public static let rangeChunkBytes: Int64 = 2 * 1024 * 1024
    public static let maxConcurrentTransfers = 3
}

public enum PairUrlErrorReason: String, Equatable, Sendable {
    case notEarUrl = "not_ear_url"
    case unsupportedTransport = "unsupported_transport"
    case missingHost = "missing_host"
    case invalidHost = "invalid_host"
    case invalidPort = "invalid_port"
    case invalidCode = "invalid_code"
    case malformedQuery = "malformed_query"
}

public enum PairUrlDiagnosis: Equatable, Sendable {
    case valid(PairPayload)
    case invalid(PairUrlErrorReason)
}

public struct ContentRangeValue: Equatable, Sendable {
    public let start: Int64
    public let end: Int64
    public let total: Int64
}

public enum MirrorValidation {
    private static let allowedMediaExts: Set<String> = [
        "mp4", "m4v", "mov", "webm", "mkv", "m4a", "mp3", "opus", "ogg"
    ]

    private static let trustedThumbnailHosts: Set<String> = [
        "i.ytimg.com", "i1.ytimg.com", "i2.ytimg.com", "i3.ytimg.com", "i4.ytimg.com", "img.youtube.com"
    ]

    private static let forbiddenKeys: Set<String> = [
        "__proto__", "prototype", "constructor", "toString", "valueOf",
        "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "index"
    ]

    public static func isSafeVideoId(_ id: String) -> Bool {
        guard !id.isEmpty, id.count <= 64, !forbiddenKeys.contains(id) else { return false }
        return id.unicodeScalars.allSatisfy { scalar in
            (scalar >= "A" && scalar <= "Z") ||
            (scalar >= "a" && scalar <= "z") ||
            (scalar >= "0" && scalar <= "9") ||
            scalar == "_" || scalar == "-"
        }
    }

    public static func isSafeMediaExt(_ ext: String) -> Bool {
        allowedMediaExts.contains(ext.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    }

    public static func isSha256Hex(_ value: String) -> Bool {
        guard value.count == 64 else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            (scalar >= "0" && scalar <= "9") ||
            (scalar >= "a" && scalar <= "f") ||
            (scalar >= "A" && scalar <= "F")
        }
    }

    public static func sanitizeThumbnailUrl(_ raw: String?) -> String {
        guard let raw else { return "" }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 512 else { return "" }
        guard trimmed.lowercased().hasPrefix("https://") else { return "" }
        if trimmed.contains(where: { $0.isWhitespace || $0 == "@" || $0 == "\\" }) { return "" }
        guard let components = URLComponents(string: trimmed),
              let host = components.host?.lowercased(),
              trustedThumbnailHosts.contains(host),
              !components.path.isEmpty else {
            return ""
        }
        return trimmed
    }

    public static func isValidLanHost(_ host: String) -> Bool {
        let clean = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 253 else { return false }
        for scalar in clean.unicodeScalars {
            if scalar.value < 0x21 || scalar.value > 0x7E { return false }
            if "/?#@\\".unicodeScalars.contains(scalar) { return false }
        }
        return isValidIPv4(clean) || isValidBracketedIPv6(clean) || isValidHostname(clean)
    }

    private static func isValidIPv4(_ host: String) -> Bool {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return false }
        return parts.allSatisfy { part in
            guard !part.isEmpty, part.count <= 3, part.allSatisfy(\.isNumber) else { return false }
            if part.count > 1 && part.first == "0" { return false }
            guard let num = Int(part) else { return false }
            return num >= 0 && num <= 255
        }
    }

    private static func isValidBracketedIPv6(_ host: String) -> Bool {
        guard host.hasPrefix("["), host.hasSuffix("]") else { return false }
        let inner = host.dropFirst().dropLast()
        guard inner.count >= 2, inner.contains(":") else { return false }
        return inner.unicodeScalars.allSatisfy { scalar in
            (scalar >= "0" && scalar <= "9") ||
            (scalar >= "a" && scalar <= "f") ||
            (scalar >= "A" && scalar <= "F") ||
            scalar == ":" || scalar == "."
        }
    }

    private static func isValidHostname(_ host: String) -> Bool {
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard let last = labels.last, !last.allSatisfy(\.isNumber) else { return false }
        return labels.allSatisfy { label in
            guard !label.isEmpty, label.count <= 63 else { return false }
            guard let first = label.first, let end = label.last else { return false }
            guard first.isASCII && (first.isLetter || first.isNumber) else { return false }
            guard end.isASCII && (end.isLetter || end.isNumber) else { return false }
            return label.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
        }
    }

    public static func diagnosePairUrl(_ raw: String) -> PairUrlDiagnosis {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.lowercased().hasPrefix("ear://pair?") else {
            return .invalid(.notEarUrl)
        }
        guard let components = URLComponents(string: trimmed),
              let queryItems = components.queryItems else {
            return .invalid(.malformedQuery)
        }
        var params: [String: String] = [:]
        for item in queryItems {
            params[item.name] = item.value ?? ""
        }
        let rawTransport = (params["transport"] ?? "lan").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard rawTransport == "lan" || rawTransport == "relay" else {
            return .invalid(.unsupportedTransport)
        }
        let transport: TransportKind = rawTransport == "relay" ? .relay : .lan
        let host = (params["host"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if host.isEmpty { return .invalid(.missingHost) }
        if !isValidLanHost(host) { return .invalid(.invalidHost) }

        let portRaw = (params["port"] ?? "\(MirrorConstants.defaultPort)").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !portRaw.isEmpty, portRaw.count <= 5, portRaw.allSatisfy(\.isNumber),
              let port = Int(portRaw), port > 0, port <= 65535 else {
            return .invalid(.invalidPort)
        }

        let code = (params["code"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard code.count == 4, code.allSatisfy(\.isNumber) else {
            return .invalid(.invalidCode)
        }

        let name = params["name"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanName = name.flatMap { $0.isEmpty ? nil : String($0.prefix(128)) }
        return .valid(PairPayload(transport: transport, host: host, port: port, code: code, name: cleanName))
    }

    public static func parsePairUrl(_ raw: String) -> PairPayload? {
        if case let .valid(payload) = diagnosePairUrl(raw) {
            return payload
        }
        return nil
    }

    public static func parseHostAndPort(_ input: String) -> (host: String, port: Int)? {
        var clean = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        if clean.contains(where: { $0.isWhitespace || "?#\\@".contains($0) }) { return nil }
        if clean.lowercased().hasPrefix("http://") {
            clean = String(clean.dropFirst("http://".count))
        } else if clean.lowercased().hasPrefix("https://") {
            clean = String(clean.dropFirst("https://".count))
        }
        while clean.hasSuffix("/") { clean.removeLast() }
        guard !clean.isEmpty, !clean.contains("/") else { return nil }

        if clean.hasPrefix("[") {
            guard let closeIdx = clean.firstIndex(of: "]") else { return nil }
            let host = String(clean[...closeIdx])
            let rest = String(clean[clean.index(after: closeIdx)...])
            guard isValidLanHost(host) else { return nil }
            if rest.isEmpty { return (host, MirrorConstants.defaultPort) }
            guard rest.hasPrefix(":") else { return nil }
            let portStr = String(rest.dropFirst())
            guard portStr.count <= 5, portStr.allSatisfy(\.isNumber),
                  let port = Int(portStr), port > 0, port <= 65535 else { return nil }
            return (host, port)
        }

        if let firstColon = clean.firstIndex(of: ":"),
           firstColon == clean.lastIndex(of: ":") {
            let host = String(clean[..<firstColon]).trimmingCharacters(in: .whitespaces)
            let portStr = String(clean[clean.index(after: firstColon)...]).trimmingCharacters(in: .whitespaces)
            guard isValidLanHost(host), !portStr.isEmpty, portStr.count <= 5,
                  portStr.allSatisfy(\.isNumber), let port = Int(portStr),
                  port > 0, port <= 65535 else { return nil }
            return (host, port)
        }

        guard isValidLanHost(clean) else { return nil }
        return (clean, MirrorConstants.defaultPort)
    }

    public static func parseContentRangeHeader(_ header: String?) -> ContentRangeValue? {
        guard let raw = header?.trimmingCharacters(in: .whitespacesAndNewlines),
              raw.lowercased().hasPrefix("bytes ") else { return nil }
        let body = raw.dropFirst(6).trimmingCharacters(in: .whitespaces)
        let slashParts = body.split(separator: "/", omittingEmptySubsequences: false)
        guard slashParts.count == 2 else { return nil }
        let rangeParts = slashParts[0].split(separator: "-", omittingEmptySubsequences: false)
        guard rangeParts.count == 2,
              let start = Int64(rangeParts[0]),
              let end = Int64(rangeParts[1]),
              let total = Int64(slashParts[1]),
              start >= 0, end >= start, total > end else { return nil }
        return ContentRangeValue(start: start, end: end, total: total)
    }
}

public enum MirrorSelectors {
    public static func buildLibraryView(
        macs: [PairedMac],
        onlineMacIds: Set<String>,
        pausedInBackground: Bool,
        catalogs: [String: [RemoteCatalogItem]],
        localItems: [String: LocalItemRecord],
        activeVideoIds: Set<String>,
        priorityQueue: [String]
    ) -> [MirrorItemView] {
        var ids: [String] = []
        var seen: Set<String> = []

        for mac in macs {
            for item in catalogs[mac.id] ?? [] {
                if seen.insert(item.videoId).inserted {
                    ids.append(item.videoId)
                }
            }
        }
        for (vid, rec) in localItems where rec.state == .ready {
            if seen.insert(vid).inserted {
                ids.append(vid)
            }
        }

        let prioSet = Set(priorityQueue)
        var views: [MirrorItemView] = []
        views.reserveCapacity(ids.count)

        for videoId in ids {
            let rec = localItems[videoId]
            let remote = macs.lazy.compactMap { m in
                (catalogs[m.id] ?? []).first(where: { $0.videoId == videoId })
            }.first

            let sources: [MirrorSourceRef] = macs.compactMap { mac in
                guard (catalogs[mac.id] ?? []).contains(where: { $0.videoId == videoId }) else { return nil }
                return MirrorSourceRef(
                    id: mac.id,
                    name: mac.name,
                    shortName: mac.shortName,
                    online: onlineMacIds.contains(mac.id) && !pausedInBackground
                )
            }
            let anyOnline = sources.contains(where: \.online)

            let status: MirrorItemStatus
            if rec?.state == .removed {
                status = .removed
            } else if rec?.state == .ready {
                status = .ready
            } else if activeVideoIds.contains(videoId) {
                status = .syncing
            } else {
                status = anyOnline ? .queued : .away
            }

            let sizeBytes = remote?.sizeBytes ?? rec?.sizeBytes ?? 0
            let downloadedBytes = status == .ready ? sizeBytes : min(sizeBytes, rec?.downloadedBytes ?? 0)
            let progress: Double
            if status == .ready {
                progress = 1
            } else if sizeBytes > 0 {
                progress = min(0.99, Double(downloadedBytes) / Double(sizeBytes))
            } else {
                progress = 0
            }

            views.append(MirrorItemView(
                videoId: videoId,
                title: remote?.title ?? rec?.title ?? videoId,
                thumbnailUrl: remote?.thumbnailUrl ?? rec?.thumbnailUrl ?? "",
                url: remote?.url ?? rec?.url,
                site: remote?.site ?? rec?.site,
                durationMs: remote?.durationMs ?? rec?.durationMs,
                videoWidth: remote?.videoWidth ?? rec?.videoWidth,
                videoHeight: remote?.videoHeight ?? rec?.videoHeight,
                quality: remote?.quality ?? rec?.quality,
                subtitleLabel: remote?.subtitleLabel ?? rec?.subtitleLabel,
                subtitleIsAuto: remote?.subtitleIsAuto ?? rec?.subtitleIsAuto,
                sizeBytes: sizeBytes,
                contentSha256: rec?.contentSha256 ?? remote?.contentSha256,
                downloadedBytes: downloadedBytes,
                progress: progress,
                status: status,
                priority: prioSet.contains(videoId),
                hasCaptions: remote?.hasCaptions ?? rec?.hasCaptions ?? false,
                mediaExt: remote?.mediaExt ?? rec?.mediaExt ?? "mp4",
                mimeType: rec?.mimeType ?? remote?.mimeType ?? "video/mp4",
                localFileName: rec?.localFileName,
                captionsFileName: rec?.captionsFileName,
                thumbnailFileName: rec?.thumbnailFileName,
                sources: sources,
                fallbackSourceShortName: rec?.sourceShortName ?? sources.first?.shortName,
                createdAt: remote?.createdAt ?? rec?.createdAt,
                updatedAt: remote?.updatedAt ?? rec?.updatedAt ?? 0
            ))
        }

        return views.sorted { $0.updatedAt > $1.updatedAt }
    }

    public static func computeSyncStats(_ items: [MirrorItemView]) -> SyncStats {
        var ready = 0, syncing = 0, queued = 0, away = 0, removed = 0
        for item in items {
            switch item.status {
            case .ready: ready += 1
            case .syncing: syncing += 1
            case .queued: queued += 1
            case .away: away += 1
            case .removed: removed += 1
            }
        }
        let reachable = items.filter { $0.status != .removed && $0.status != .away }
        let overall: Double = reachable.isEmpty
            ? 1.0
            : reachable.reduce(0.0) { $0 + ($1.status == .ready ? 1.0 : $1.progress) } / Double(reachable.count)

        return SyncStats(
            ready: ready,
            syncing: syncing,
            queued: queued,
            away: away,
            removed: removed,
            reachableWanted: reachable.count,
            overallProgress: overall,
            complete: syncing == 0 && queued == 0
        )
    }

    public static func computeMacSyncCounts(
        macId: String,
        catalogs: [String: [RemoteCatalogItem]],
        localItems: [String: LocalItemRecord]
    ) -> (done: Int, total: Int) {
        let wanted = (catalogs[macId] ?? []).filter { localItems[$0.videoId]?.state != .removed }
        let done = wanted.filter { localItems[$0.videoId]?.state == .ready }.count
        return (done, wanted.count)
    }

    public static func computeOfflineStorageSummary(_ localItems: [String: LocalItemRecord]) -> OfflineStorageSummary {
        var readyCount = 0
        var totalBytes: Int64 = 0
        for rec in localItems.values where rec.state == .ready {
            readyCount += 1
            totalBytes += max(0, rec.sizeBytes > 0 ? rec.sizeBytes : rec.downloadedBytes)
        }
        return OfflineStorageSummary(readyCount: readyCount, totalBytes: totalBytes)
    }
}
