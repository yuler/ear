import Foundation
import Security

public protocol TokenStoring: Sendable {
    func token(forServerId serverId: String) -> String?
    func save(token: String, forServerId serverId: String)
    func removeToken(forServerId serverId: String)
}

public final class KeychainTokenStore: TokenStoring {
    private let service: String

    public init(service: String = "dev.yuler.ear.mirror.token") {
        self.service = service
    }

    public func token(forServerId serverId: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: serverId,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func save(token: String, forServerId serverId: String) {
        guard let data = token.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: serverId
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var addQuery = query
            addQuery.merge(attributes) { _, new in new }
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    public func removeToken(forServerId serverId: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: serverId
        ]
        SecItemDelete(query as CFDictionary)
    }
}

public final class InMemoryTokenStore: TokenStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: [String: String] = [:]

    public init() {}

    public func token(forServerId serverId: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        return tokens[serverId]
    }

    public func save(token: String, forServerId serverId: String) {
        lock.lock()
        defer { lock.unlock() }
        tokens[serverId] = token
    }

    public func removeToken(forServerId serverId: String) {
        lock.lock()
        defer { lock.unlock() }
        tokens.removeValue(forKey: serverId)
    }
}
