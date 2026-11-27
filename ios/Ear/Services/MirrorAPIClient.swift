import Foundation

public enum MirrorAPIError: Error, Equatable, Sendable {
    case invalidCode(attemptsRemaining: Int?)
    case codeExpired
    case pairLocked
    case unpaired
    case timeout
    case unreachable(String)
    case representationChanged
    case invalidRangeResponse(String)
    case httpError(status: Int, detail: String?)
}

public struct PairResponse: Equatable, Sendable {
    public let serverId: String
    public let serverName: String
    public let shortName: String
    public let deviceId: String
    public let token: String
    public let transport: TransportKind
}

public struct CatalogResponse: Equatable, Sendable {
    public let serverId: String
    public let serverName: String
    public let shortName: String
    public let items: [RemoteCatalogItem]
}

public struct MediaRangeOptions: Sendable {
    public let expectedTotalBytes: Int64?
    public let expectedContentSha256: String?

    public init(expectedTotalBytes: Int64? = nil, expectedContentSha256: String? = nil) {
        self.expectedTotalBytes = expectedTotalBytes
        self.expectedContentSha256 = expectedContentSha256
    }
}

public protocol MirrorAPIClientProtocol: Sendable {
    func pair(host: String, port: Int, code: String, deviceName: String, deviceId: String?) async throws -> PairResponse
    func fetchLibrary(mac: PairedMac, token: String) async throws -> CatalogResponse
    func fetchMediaRange(
        mac: PairedMac,
        token: String,
        videoId: String,
        start: Int64,
        end: Int64,
        options: MediaRangeOptions
    ) async throws -> Data
    func fetchCaptions(mac: PairedMac, token: String, videoId: String) async throws -> Data?
    func reportStatus(mac: PairedMac, token: String, syncedCount: Int, totalCount: Int, background: Bool) async
    func unpair(mac: PairedMac, token: String) async
}

public final class HTTPMirrorAPIClient: MirrorAPIClientProtocol {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    private func baseURL(host: String, port: Int) throws -> URL {
        guard MirrorValidation.isValidLanHost(host), port > 0, port <= 65535,
              let url = URL(string: "http://\(host):\(port)") else {
            throw MirrorAPIError.unreachable("Invalid LAN host: \(host)")
        }
        return url
    }

    private func execute(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw MirrorAPIError.unreachable("Non-HTTP response")
            }
            return (data, http)
        } catch let error as MirrorAPIError {
            throw error
        } catch let urlError as URLError where urlError.code == .timedOut {
            throw MirrorAPIError.timeout
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw MirrorAPIError.unreachable(error.localizedDescription)
        }
    }

    public func pair(host: String, port: Int, code: String, deviceName: String, deviceId: String?) async throws -> PairResponse {
        let url = try baseURL(host: host, port: port).appendingPathComponent("v1/pair")
        var req = URLRequest(url: url, timeoutInterval: 6)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: String] = ["code": code, "deviceName": deviceName]
        if let deviceId { body["deviceId"] = deviceId }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, http) = try await execute(req)
        if !(200...299).contains(http.statusCode) {
            let errObj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let errCode = errObj?["error"] as? String
            let attempts = (errObj?["attemptsRemaining"] as? NSNumber)?.intValue
            if errCode == "pair_locked" || http.statusCode == 429 { throw MirrorAPIError.pairLocked }
            if errCode == "code_expired" { throw MirrorAPIError.codeExpired }
            if errCode == "invalid_code" || http.statusCode == 401 {
                throw MirrorAPIError.invalidCode(attemptsRemaining: attempts)
            }
            throw MirrorAPIError.httpError(status: http.statusCode, detail: errCode)
        }

        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let parsed = Self.validatePairJSON(obj) else {
            throw MirrorAPIError.httpError(status: http.statusCode, detail: "Malformed pair response")
        }
        return parsed
    }

    public func fetchLibrary(mac: PairedMac, token: String) async throws -> CatalogResponse {
        let url = try baseURL(host: mac.host, port: mac.port).appendingPathComponent("v1/library")
        var req = URLRequest(url: url, timeoutInterval: 5)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, http) = try await execute(req)
        if http.statusCode == 401 { throw MirrorAPIError.unpaired }
        guard (200...299).contains(http.statusCode) else {
            throw MirrorAPIError.httpError(status: http.statusCode, detail: nil)
        }
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let parsed = Self.validateCatalogJSON(obj) else {
            throw MirrorAPIError.httpError(status: http.statusCode, detail: "Malformed catalog response")
        }
        return parsed
    }

    public func fetchMediaRange(
        mac: PairedMac,
        token: String,
        videoId: String,
        start: Int64,
        end: Int64,
        options: MediaRangeOptions
    ) async throws -> Data {
        let expectedLen = Int(end - start + 1)
        let encodedId = videoId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? videoId
        let url = try baseURL(host: mac.host, port: mac.port).appendingPathComponent("v1/videos/\(encodedId)/media")
        var req = URLRequest(url: url, timeoutInterval: 30)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
        if let sha = options.expectedContentSha256 {
            req.setValue("\"sha256:\(sha)\"", forHTTPHeaderField: "If-Match")
        }

        let (data, http) = try await execute(req)
        if http.statusCode == 401 { throw MirrorAPIError.unpaired }
        if http.statusCode == 412 || http.statusCode == 416 { throw MirrorAPIError.representationChanged }
        guard (200...299).contains(http.statusCode) else {
            throw MirrorAPIError.httpError(status: http.statusCode, detail: nil)
        }
        guard http.statusCode == 206 else {
            throw MirrorAPIError.invalidRangeResponse("Expected 206, received \(http.statusCode)")
        }
        guard let contentRange = MirrorValidation.parseContentRangeHeader(http.value(forHTTPHeaderField: "Content-Range")) else {
            throw MirrorAPIError.invalidRangeResponse("Missing or malformed Content-Range")
        }
        if let expectedTotal = options.expectedTotalBytes, contentRange.total != expectedTotal {
            throw MirrorAPIError.representationChanged
        }
        guard contentRange.start == start && contentRange.end == end else {
            throw MirrorAPIError.invalidRangeResponse("Range mismatch \(contentRange.start)-\(contentRange.end)")
        }
        if let expectedSha = options.expectedContentSha256 {
            let expectedEtag = "\"sha256:\(expectedSha)\""
            let respEtag = http.value(forHTTPHeaderField: "ETag")?.trimmingCharacters(in: .whitespaces)
            let respSha = http.value(forHTTPHeaderField: "X-Ear-Content-Sha256")?.trimmingCharacters(in: .whitespaces)
            if respEtag != expectedEtag && respSha != expectedSha {
                throw MirrorAPIError.representationChanged
            }
        }
        guard data.count == expectedLen else {
            throw MirrorAPIError.invalidRangeResponse("Payload length \(data.count) != \(expectedLen)")
        }
        return data
    }

    public func fetchCaptions(mac: PairedMac, token: String, videoId: String) async throws -> Data? {
        let encodedId = videoId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? videoId
        let url = try baseURL(host: mac.host, port: mac.port).appendingPathComponent("v1/videos/\(encodedId)/captions")
        var req = URLRequest(url: url, timeoutInterval: 8)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, http) = try await execute(req)
        if http.statusCode == 404 { return nil }
        if http.statusCode == 401 { throw MirrorAPIError.unpaired }
        guard (200...299).contains(http.statusCode), data.count <= MirrorConstants.maxCaptionsBytes else {
            return nil
        }
        return data
    }

    public func reportStatus(mac: PairedMac, token: String, syncedCount: Int, totalCount: Int, background: Bool) async {
        guard let base = try? baseURL(host: mac.host, port: mac.port) else { return }
        var req = URLRequest(url: base.appendingPathComponent("v1/device/status"), timeoutInterval: 3)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["syncedCount": syncedCount, "totalCount": totalCount, "background": background]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await session.data(for: req)
    }

    public func unpair(mac: PairedMac, token: String) async {
        guard let base = try? baseURL(host: mac.host, port: mac.port) else { return }
        var req = URLRequest(url: base.appendingPathComponent("v1/unpair"), timeoutInterval: 3)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await session.data(for: req)
    }

    public static func validatePairJSON(_ obj: [String: Any]) -> PairResponse? {
        guard let serverId = (obj["serverId"] as? String)?.trimmingCharacters(in: .whitespaces),
              !serverId.isEmpty, serverId.count <= 128,
              let deviceId = (obj["deviceId"] as? String)?.trimmingCharacters(in: .whitespaces),
              !deviceId.isEmpty, deviceId.count <= 128,
              let token = (obj["token"] as? String)?.trimmingCharacters(in: .whitespaces),
              token.count >= 16, token.count <= 256 else {
            return nil
        }
        let serverName = (obj["serverName"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        let shortName = (obj["shortName"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        let transport: TransportKind = (obj["transport"] as? String) == "relay" ? .relay : .lan
        return PairResponse(
            serverId: serverId,
            serverName: serverName.isEmpty ? serverId : String(serverName.prefix(128)),
            shortName: shortName.isEmpty ? String((serverName.isEmpty ? serverId : serverName).prefix(32)) : String(shortName.prefix(32)),
            deviceId: deviceId,
            token: token,
            transport: transport
        )
    }

    public static func validateCatalogJSON(_ obj: [String: Any]) -> CatalogResponse? {
        guard let rawItems = obj["items"] as? [[String: Any]] else { return nil }
        let serverId = (obj["serverId"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        let serverName = (obj["serverName"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        let shortName = (obj["shortName"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        let items: [RemoteCatalogItem] = rawItems.compactMap { it in
            guard let videoId = it["videoId"] as? String, MirrorValidation.isSafeVideoId(videoId),
                  let rawExt = (it["mediaExt"] as? String)?.trimmingCharacters(in: .whitespaces).lowercased(),
                  MirrorValidation.isSafeMediaExt(rawExt),
                  let sizeNum = it["sizeBytes"] as? NSNumber else {
                return nil
            }
            let sizeBytes = sizeNum.int64Value
            guard sizeBytes >= 0, sizeBytes <= MirrorConstants.maxRemoteMediaBytes else { return nil }

            let updatedAt = (it["updatedAt"] as? NSNumber)?.int64Value ?? 0
            let durationMs = (it["durationMs"] as? NSNumber).flatMap { $0.intValue >= 0 ? $0.intValue : nil }
            let rawSha = it["contentSha256"] as? String
            let sha = rawSha.flatMap { MirrorValidation.isSha256Hex($0) ? $0.lowercased() : nil }
            let rawTitle = (it["title"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            let title = rawTitle.isEmpty ? videoId : String(rawTitle.prefix(300))
            let rawMime = (it["mimeType"] as? String)?.trimmingCharacters(in: .whitespaces).lowercased() ?? "video/mp4"
            let quality = (it["quality"] as? String)?.trimmingCharacters(in: .whitespaces)
            return RemoteCatalogItem(
                videoId: videoId,
                title: title,
                thumbnailUrl: MirrorValidation.sanitizeThumbnailUrl(it["thumbnailUrl"] as? String),
                durationMs: durationMs,
                sizeBytes: sizeBytes,
                contentSha256: sha,
                quality: quality.map { String($0.prefix(32)) },
                mediaExt: rawExt,
                mimeType: rawMime.contains("/") ? rawMime : "video/mp4",
                hasCaptions: (it["hasCaptions"] as? Bool) == true,
                updatedAt: max(0, updatedAt)
            )
        }
        return CatalogResponse(serverId: serverId, serverName: serverName, shortName: shortName, items: items)
    }
}
