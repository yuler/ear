import { keymap, mount, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import type { LibraryEntry } from "../library/types";
import { ShortcutsModal } from "./ShortcutsModal";
import { VideoDetailView } from "../views/VideoDetailView";
import { LibraryView } from "../views/LibraryView";

function mockEntry(id: string, over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    videoId: id,
    title: `Video ${id}`,
    url: `https://example.com/${id}`,
    site: "YouTube",
    state: "ready",
    captionsPath: null,
    videoPath: `/downloads/${id}.mp4`,
    audioPath: null,
    videoUrl: null,
    audioUrl: null,
    audioMimeType: null,
    durationMs: 60000,
    quality: "720p",
    sizeBytes: 1024,
    note: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

export function OverlayFixtureApp() {
  const showModal = signal(false);
  const showPlayer = signal(false);
  const entries = signal<LibraryEntry[]>([
    mockEntry("v1", { videoWidth: 720, videoHeight: 1280 }),
    mockEntry("v2", { videoWidth: 1920, videoHeight: 1080 }),
    mockEntry("v3"),
  ]);
  const deleteCount = signal(0);
  const openCount = signal(0);
  const lastOpened = signal<string | null>(null);

  const isBackgroundDisabled = () => showPlayer() || showModal();

  const deleteEntry = (entry: LibraryEntry) => {
    deleteCount.set(deleteCount() + 1);
    entries.set(entries().filter((e) => e.videoId !== entry.videoId));
  };

  keymap.bind(
    {
      "shift+/": () => showModal.set(!showModal()),
      f1: () => showModal.set(!showModal()),
    },
    { when: "notEditing" },
  );

  return (
    <View class="relative h-full w-full p-4 overflow-hidden">
      <View class="flex-col gap-1 mb-2">
        <Button onPress={() => showPlayer.set(true)}>
          <Text>Open Player</Text>
        </Button>
        <Button onPress={() => showModal.set(true)}>
          <Text>Open Modal</Text>
        </Button>
        <Button
          onPress={() => {
            entries.set([mockEntry("v1")]);
          }}
        >
          <Text>Shrink Entries</Text>
        </Button>
        <Button
          onPress={() => {
            entries.set([]);
          }}
        >
          <Text>Clear Entries</Text>
        </Button>
        <If when={showPlayer()}>
          <Button><Text>Player is Active</Text></Button>
        </If>
        <If when={!showPlayer()}>
          <Button><Text>Player is Inactive</Text></Button>
        </If>
        <If when={showModal()}>
          <Button><Text>Modal is Active</Text></Button>
        </If>
        <If when={!showModal()}>
          <Button><Text>Modal is Inactive</Text></Button>
        </If>
        <If when={Boolean(lastOpened())}>
          <Button><Text>Item Was Opened</Text></Button>
        </If>
      </View>

      <LibraryView
        disabled={isBackgroundDisabled}
        savedEntries={entries}
        downloadFolder={() => "/tmp/ear-downloads"}
        diskSpace={() => ({
          path: "/tmp/ear-downloads",
          availableBytes: 120 * 1024 ** 3,
          totalBytes: 500 * 1024 ** 3,
        })}
        onOpenDownloadFolder={() => {}}
        onOpenEntry={(e) => {
          openCount.set(openCount() + 1);
          lastOpened.set(e.videoId);
        }}
        onOpenFolder={() => {}}
        onDeleteEntry={deleteEntry}
      />

      <If when={showPlayer()}>
        <VideoDetailView
          entry={() => entries()[0] ?? mockEntry("v1")}
          src={() => "/downloads/v1.mp4"}
          disabled={showModal}
          onClose={() => showPlayer.set(false)}
        />
      </If>

      <ShortcutsModal
        open={showModal}
        onClose={() => showModal.set(false)}
      />
    </View>
  );
}

mount(OverlayFixtureApp);
