import SwiftUI

struct SettingsSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var engine: MirrorEngine
    let onPairNew: () -> Void

    private var copy: AppCopy { AppCopy(engine.settings.language) }

    var body: some View {
        NavigationStack {
            Form {
                Section(copy.appearanceSection) {
                    Picker(copy.appearanceLabel, selection: Binding(
                        get: { engine.settings.appearance },
                        set: { engine.updateAppearance($0) }
                    )) {
                        ForEach(AppAppearance.allCases) { item in
                            Text(copy.appearanceName(item)).tag(item)
                        }
                    }

                    HStack {
                        Text(copy.accentLabel)
                        Spacer()
                        HStack(spacing: 10) {
                            ForEach(AppAccent.allCases) { accent in
                                Button {
                                    engine.updateAccent(accent)
                                    UISelectionFeedbackGenerator().selectionChanged()
                                } label: {
                                    Circle()
                                        .fill(accent.color)
                                        .frame(width: 24, height: 24)
                                        .overlay {
                                            if engine.settings.accent == accent {
                                                Image(systemName: "checkmark")
                                                    .font(.caption2.weight(.bold))
                                                    .foregroundStyle(.white)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(accent.rawValue)
                            }
                        }
                    }

                    Picker(copy.languageLabel, selection: Binding(
                        get: { engine.settings.language },
                        set: { engine.updateLanguage($0) }
                    )) {
                        Text("中文").tag(AppLanguage.zh)
                        Text("English").tag(AppLanguage.en)
                    }
                    .pickerStyle(.segmented)
                }

                Section(copy.syncSection) {
                    Toggle(copy.backgroundSyncLabel, isOn: Binding(
                        get: { engine.settings.backgroundSync },
                        set: { engine.updateBackgroundSync($0) }
                    ))

                    let summary = engine.storageSummary
                    LabeledContent(copy.offlineStorageLabel) {
                        Text("\(summary.readyCount) · \(formatBytes(summary.totalBytes))")
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    ForEach(engine.macs) { mac in
                        let online = engine.onlineMacIds.contains(mac.id)
                        let counts = engine.macSyncCounts(for: mac.id)
                        HStack(spacing: 12) {
                            Circle()
                                .fill(online ? Color.green : Color.secondary.opacity(0.4))
                                .frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mac.name)
                                    .font(.subheadline.weight(.medium))
                                Text("\(mac.host):\(mac.port) · \(counts.done)/\(counts.total)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                            Spacer()
                            Button(copy.disconnectMac, role: .destructive) {
                                Task { await engine.unpairMac(id: mac.id) }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }

                    Button {
                        onPairNew()
                    } label: {
                        Label(copy.pairNewMac, systemImage: "plus.circle.fill")
                    }
                } header: {
                    Text(copy.pairedMacsSection)
                } footer: {
                    Text(copy.settingsFooter)
                }
            }
            .navigationTitle(copy.settingsTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(copy.done) { dismiss() }
                }
            }
        }
    }
}
