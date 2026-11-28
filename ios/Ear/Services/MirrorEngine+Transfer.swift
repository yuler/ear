import Foundation

extension MirrorEngine {
    public func scheduleTransfers() {
        guard !pausedInBackground else { return }
        let items = library
        let candidates = items.filter { $0.status == .queued }
        let ordered = candidates.sorted { lhs, rhs in
            let lIdx = priorityQueue.firstIndex(of: lhs.videoId)
            let rIdx = priorityQueue.firstIndex(of: rhs.videoId)
            switch (lIdx, rIdx) {
            case let (l?, r?): return l < r
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil): return lhs.updatedAt > rhs.updatedAt
            }
        }

        for item in ordered {
            if activeVideoIds.count >= MirrorConstants.maxConcurrentTransfers { break }
            guard let source = item.sources.first(where: \.online),
                  let mac = macs.first(where: { $0.id == source.id }),
                  let token = tokens.token(forServerId: mac.id),
                  let remote = (catalogs[mac.id] ?? []).first(where: { $0.videoId == item.videoId }) else {
                continue
            }
            startTransfer(remote: remote, mac: mac, token: token)
        }
    }

    private func startTransfer(remote: RemoteCatalogItem, mac: PairedMac, token: String) {
        let videoId = remote.videoId
        guard !activeVideoIds.contains(videoId) else { return }
        activeVideoIds.insert(videoId)
        activeTransferMacs[videoId] = mac.id

        let task = Task { [weak self] in
            guard let self else { return }
            await self.runTransfer(remote: remote, mac: mac, token: token)
        }
        activeTasks[videoId] = task
    }

    private func runTransfer(remote: RemoteCatalogItem, mac: PairedMac, token: String) async {
        let videoId = remote.videoId
        defer {
            activeTasks.removeValue(forKey: videoId)
            activeTransferMacs.removeValue(forKey: videoId)
            activeVideoIds.remove(videoId)
            if activeVideoIds.isEmpty { endBackgroundGraceTask() }
            scheduleTransfers()
        }

        do {
            var offset = await files.partialByteCount(videoId: videoId, ext: remote.mediaExt)
            // If representation digest changed since partial download started, reset cleanly.
            if let existing = localItems[videoId],
               let oldSha = existing.contentSha256,
               let newSha = remote.contentSha256,
               oldSha != newSha {
                await files.removeVideoFiles(videoId: videoId)
                offset = 0
            }

            upsertPartialRecord(remote: remote, mac: mac, downloadedBytes: offset)

            while offset < remote.sizeBytes {
                try Task.checkCancellation()
                let end = min(remote.sizeBytes - 1, offset + MirrorConstants.rangeChunkBytes - 1)
                let chunk = try await api.fetchMediaRange(
                    mac: mac,
                    token: token,
                    videoId: videoId,
                    start: offset,
                    end: end,
                    options: MediaRangeOptions(
                        expectedTotalBytes: remote.sizeBytes,
                        expectedContentSha256: remote.contentSha256
                    )
                )
                try Task.checkCancellation()
                offset = try await files.appendMediaChunk(
                    videoId: videoId,
                    ext: remote.mediaExt,
                    data: chunk,
                    expectedOffset: offset
                )
                upsertPartialRecord(remote: remote, mac: mac, downloadedBytes: offset)
            }

            let finalFileName: String
            if remote.sizeBytes == 0 {
                _ = try await files.appendMediaChunk(videoId: videoId, ext: remote.mediaExt, data: Data(), expectedOffset: 0)
                finalFileName = try await files.finalizeMedia(videoId: videoId, ext: remote.mediaExt, expectedSha256: nil)
            } else {
                finalFileName = try await files.finalizeMedia(
                    videoId: videoId,
                    ext: remote.mediaExt,
                    expectedSha256: remote.contentSha256
                )
            }

            var captionsFileName: String?
            if remote.hasCaptions, let capData = try await api.fetchCaptions(mac: mac, token: token, videoId: videoId) {
                captionsFileName = try await files.writeCaptions(videoId: videoId, data: capData)
            }

            var thumbnailFileName: String?
            if !remote.thumbnailUrl.isEmpty,
               let thumbData = await api.fetchThumbnail(urlString: remote.thumbnailUrl) {
                thumbnailFileName = try? await files.writeThumbnail(videoId: videoId, data: thumbData)
            }

            let readyRecord = LocalItemRecord(
                videoId: videoId,
                state: .ready,
                title: remote.title,
                thumbnailUrl: remote.thumbnailUrl,
                url: remote.url,
                site: remote.site,
                durationMs: remote.durationMs,
                videoWidth: remote.videoWidth,
                videoHeight: remote.videoHeight,
                quality: remote.quality,
                subtitleLabel: remote.subtitleLabel,
                subtitleIsAuto: remote.subtitleIsAuto,
                sizeBytes: remote.sizeBytes,
                contentSha256: remote.contentSha256,
                downloadedBytes: remote.sizeBytes,
                mediaExt: remote.mediaExt,
                mimeType: remote.mimeType,
                hasCaptions: captionsFileName != nil || remote.hasCaptions,
                localFileName: finalFileName,
                captionsFileName: captionsFileName,
                thumbnailFileName: thumbnailFileName,
                sourceMacId: mac.id,
                sourceShortName: mac.shortName,
                createdAt: remote.createdAt,
                updatedAt: remote.updatedAt
            )
            localItems[videoId] = readyRecord
            priorityQueue.removeAll { $0 == videoId }
            await files.saveLocalItem(readyRecord)
            persist()

            let counts = macSyncCounts(for: mac.id)
            await api.reportStatus(
                mac: mac,
                token: token,
                syncedCount: counts.done,
                totalCount: counts.total,
                background: pausedInBackground
            )
        } catch is CancellationError {
            persist()
        } catch MirrorAPIError.unpaired {
            removeMacLocally(id: mac.id, notifyRemovedByPC: true)
        } catch MirrorAPIError.representationChanged, MirrorFileStoreError.checksumMismatch {
            await files.removeVideoFiles(videoId: videoId)
            localItems.removeValue(forKey: videoId)
            persist()
        } catch {
            onlineMacIds.remove(mac.id)
            persist()
        }
    }

    private func upsertPartialRecord(remote: RemoteCatalogItem, mac: PairedMac, downloadedBytes: Int64) {
        localItems[remote.videoId] = LocalItemRecord(
            videoId: remote.videoId,
            state: .partial,
            title: remote.title,
            thumbnailUrl: remote.thumbnailUrl,
            url: remote.url,
            site: remote.site,
            durationMs: remote.durationMs,
            videoWidth: remote.videoWidth,
            videoHeight: remote.videoHeight,
            quality: remote.quality,
            subtitleLabel: remote.subtitleLabel,
            subtitleIsAuto: remote.subtitleIsAuto,
            sizeBytes: remote.sizeBytes,
            contentSha256: remote.contentSha256,
            downloadedBytes: downloadedBytes,
            mediaExt: remote.mediaExt,
            mimeType: remote.mimeType,
            hasCaptions: remote.hasCaptions,
            localFileName: nil,
            captionsFileName: nil,
            thumbnailFileName: nil,
            sourceMacId: mac.id,
            sourceShortName: mac.shortName,
            createdAt: remote.createdAt,
            updatedAt: remote.updatedAt
        )
    }
}
