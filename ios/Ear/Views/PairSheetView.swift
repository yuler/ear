import AVFoundation
import SwiftUI

enum PairSheetMode: Identifiable, Equatable {
    case scanner
    case manual
    case deepLink(PairPayload)

    var id: String {
        switch self {
        case .scanner: return "scanner"
        case .manual: return "manual"
        case .deepLink(let p): return "deepLink-\(p.host)-\(p.port)-\(p.code)"
        }
    }
}

struct PairSheetView: View {
    @Environment(\.dismiss) private var dismiss
    let engine: MirrorEngine
    let initialMode: PairSheetMode
    let onPaired: (PairedMac) -> Void

    @State private var showingScanner: Bool = true
    @State private var cameraStatus: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @State private var addressInput: String = ""
    @State private var codeInput: String = ""
    @State private var linkInput: String = ""
    @State private var isPairing: Bool = false
    @State private var errorMessage: String?
    @State private var pairedMac: PairedMac?

    private var copy: AppCopy { AppCopy(engine.settings.language) }

    var body: some View {
        NavigationStack {
            Group {
                if let pairedMac {
                    pairedSuccessView(pairedMac)
                } else if isPairing {
                    ProgressView(copy.pairingBusy)
                        .controlSize(.large)
                } else if showingScanner {
                    scannerStage
                } else {
                    manualForm
                }
            }
            .navigationTitle(showingScanner ? copy.scannerTitle : copy.pairTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(copy.cancel) { dismiss() }
                }
                if !showingScanner && pairedMac == nil && !isPairing {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showingScanner = true
                            errorMessage = nil
                        } label: {
                            Image(systemName: "qrcode.viewfinder")
                        }
                    }
                }
            }
            .task {
                switch initialMode {
                case .scanner:
                    showingScanner = true
                    await requestCameraIfNeeded()
                case .manual:
                    showingScanner = false
                case .deepLink(let payload):
                    showingScanner = false
                    await performPair(host: payload.host, port: payload.port, code: payload.code)
                }
            }
        }
    }

    @ViewBuilder
    private var scannerStage: some View {
        if cameraStatus == .authorized {
            ZStack {
                QRScannerView { raw in
                    handleScannedQR(raw)
                }
                .ignoresSafeArea(edges: .bottom)

                VStack {
                    Spacer()
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(.white.opacity(0.9), lineWidth: 2.5)
                        .frame(width: 240, height: 240)
                        .background(.clear)

                    Text(copy.scannerHint)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                        .padding(.top, 20)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(.red.opacity(0.85), in: Capsule())
                            .padding(.top, 12)
                    }

                    Spacer()

                    Button {
                        showingScanner = false
                    } label: {
                        Text(copy.manualPairBtn)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.black.opacity(0.65))
                    .padding(.bottom, 28)
                }
            }
        } else if cameraStatus == .denied || cameraStatus == .restricted {
            ContentUnavailableView {
                Label(copy.cameraDeniedTitle, systemImage: "camera.fill")
            } description: {
                Text(copy.cameraDeniedBody)
            } actions: {
                VStack(spacing: 12) {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        Button(copy.openSettings) {
                            UIApplication.shared.open(url)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    Button(copy.manualPairBtn) {
                        showingScanner = false
                    }
                    .buttonStyle(.bordered)
                }
            }
        } else {
            ProgressView()
                .task { await requestCameraIfNeeded() }
        }
    }

    private var manualForm: some View {
        Form {
            Section {
                TextField(copy.addressPlaceholder, text: $addressInput)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                TextField(copy.codePlaceholder, text: $codeInput)
                    .keyboardType(.numberPad)
                    .onChange(of: codeInput) { _, newVal in
                        let digits = newVal.filter(\.isNumber)
                        if digits != newVal || digits.count > 4 {
                            codeInput = String(digits.prefix(4))
                        }
                    }
            }

            Section {
                TextField(copy.pasteLinkPlaceholder, text: $linkInput)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    submitManualPair()
                } label: {
                    Text(copy.connectButton)
                        .frame(maxWidth: .infinity)
                }
                .disabled(!canSubmitManual)
            }
        }
    }

    private func pairedSuccessView(_ mac: PairedMac) -> some View {
        ContentUnavailableView {
            Label(copy.pairSuccess, systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        } description: {
            Text(mac.name)
        }
        .task {
            try? await Task.sleep(for: .seconds(0.9))
            onPaired(mac)
            dismiss()
        }
    }

    private var canSubmitManual: Bool {
        if !linkInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        return !addressInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && codeInput.count == 4
    }

    private func requestCameraIfNeeded() async {
        let current = AVCaptureDevice.authorizationStatus(for: .video)
        if current == .notDetermined {
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            cameraStatus = granted ? .authorized : .denied
        } else {
            cameraStatus = current
        }
    }

    private func handleScannedQR(_ raw: String) {
        switch MirrorValidation.diagnosePairUrl(raw) {
        case .valid(let payload):
            errorMessage = nil
            showingScanner = false
            Task { await performPair(host: payload.host, port: payload.port, code: payload.code) }
        case .invalid(let reason):
            errorMessage = "\(copy.pairError(.httpError(status: 0, detail: nil))) (\(reason.rawValue))"
            showingScanner = false
            linkInput = raw
        }
    }

    private func submitManualPair() {
        errorMessage = nil
        let trimmedLink = linkInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedLink.isEmpty {
            switch MirrorValidation.diagnosePairUrl(trimmedLink) {
            case .valid(let payload):
                Task { await performPair(host: payload.host, port: payload.port, code: payload.code) }
            case .invalid(let reason):
                errorMessage = "\(copy.pairError(.httpError(status: 0, detail: nil))) (\(reason.rawValue))"
            }
            return
        }

        guard let parsed = MirrorValidation.parseHostAndPort(addressInput),
              codeInput.count == 4 else {
            errorMessage = copy.pairError(.invalidCode(attemptsRemaining: nil))
            return
        }
        Task { await performPair(host: parsed.host, port: parsed.port, code: codeInput) }
    }

    private func performPair(host: String, port: Int, code: String) async {
        isPairing = true
        errorMessage = nil
        defer { isPairing = false }
        do {
            let mac = try await engine.pairWith(host: host, port: port, code: code)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            pairedMac = mac
        } catch let apiError as MirrorAPIError {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            errorMessage = copy.pairError(apiError)
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            errorMessage = error.localizedDescription
        }
    }
}
