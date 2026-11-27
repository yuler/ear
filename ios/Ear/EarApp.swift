import SwiftUI

@main
struct EarApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var engine = MirrorEngine()
    @State private var incomingPairPayload: PairPayload?

    var body: some Scene {
        WindowGroup {
            LibraryView(
                engine: engine,
                incomingPairPayload: $incomingPairPayload
            )
            .preferredColorScheme(engine.settings.appearance.colorScheme)
            .tint(engine.settings.accent.color)
            .task {
                await engine.hydrate()
                await engine.pollAllMacs()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    if scenePhase == .active && !engine.macs.isEmpty {
                        await engine.pollAllMacs()
                    }
                }
            }
            .onChange(of: scenePhase) { _, phase in
                engine.setAppLifecycle(isBackground: phase == .background)
            }
            .onOpenURL { url in
                if let payload = MirrorValidation.parsePairUrl(url.absoluteString) {
                    incomingPairPayload = payload
                }
            }
        }
    }
}
