import { exists } from "fs/promises";
import {
  colorScheme,
  effect,
  keymap,
  lifecycle,
  mount,
  Scroll,
  signal,
  View,
  type InputRef,
} from "nsh";
import { isAvailable, Menu, Window } from "nsh/desktop";
import { downloadLesson } from "./library/download";
import { listEntriesSafe, loadLessonFromEntry } from "./library/index";
import { videoFile } from "./library/paths";
import type { LibraryEntry } from "./library/types";
import { BlindFlow } from "./views/BlindFlow";
import type { BlindTag } from "./views/blindFlow";
import { LoopDojo } from "./views/LoopDojo";
import { dojoQueue } from "./views/loopDojo";
import {
  getVideoTags,
  hydrateAllVideoTags,
  saveSettings,
  saveVideoTags,
} from "./store";
import { ActivityBanner, type ActivityKind } from "./ui/ActivityBanner";
import { ChromeHint, type ChromeScreen } from "./ui/chrome";
import {
  buildVideoPreview,
  fetchVideoPreviewMeta,
  readSystemClipboard,
  type ClipboardVideoPreview,
} from "./clipboard";
import { ClipboardCard } from "./ui/ClipboardCard";
import { LibraryView } from "./views/LibraryView";
import { SentencesView } from "./views/SentencesView";
import { initSettings, settings, updateSettings } from "./ui/settings";
import { SettingsPanel } from "./ui/SettingsPanel";
import { TopBar } from "./ui/TopBar";
import { hostFetch, isNativeHost } from "./youtube/host";
import { loadLesson } from "./youtube/parse";
import type { Difficulty, LoadedLesson } from "./youtube/types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function App() {
  const url = signal("");
  const loading = signal(false);
  const saving = signal(false);
  const activityKind = signal<ActivityKind>(null);
  const activityProgress = signal(0);
  const activityTitle = signal("");
  const error = signal<string | null>(null);
  const status = signal<string | null>(null);
  const lesson = signal<LoadedLesson | null>(null);
  const screen = signal<ChromeScreen>("home");
  const tags = signal<Record<number, BlindTag>>({});
  const difficultyFilter = signal<"all" | Difficulty>("all");
  const savedEntries = signal<LibraryEntry[]>([]);
  const allVideoTags = signal<Record<string, Record<number, BlindTag>>>({});
  const clipboardPreview = signal<ClipboardVideoPreview | null>(null);
  const previewMetaMap = signal<Record<string, ClipboardVideoPreview>>({});
  const dismissedVideoId = signal<string | null>(null);
  const blindTargetIndex = signal<number | null>(null);
  const settingsOpen = signal(false);
  let urlInputRef: InputRef | null = null;
  const fetchingMetaIds = new Set<string>();

  const ensurePreviewEnriched = (preview: ClipboardVideoPreview) => {
    if (previewMetaMap()[preview.videoId] || fetchingMetaIds.has(preview.videoId)) {
      return;
    }
    fetchingMetaIds.add(preview.videoId);
    void fetchVideoPreviewMeta(preview, hostFetch)
      .then((enriched) => {
        previewMetaMap.set({
          ...previewMetaMap(),
          [preview.videoId]: enriched,
        });
      })
      .finally(() => {
        fetchingMetaIds.delete(preview.videoId);
      });
  };

  if (isAvailable) {
    Window.setTitleBar({ style: "hidden", height: 44 });
  }

  // Auto-read clipboard on startup (when enabled) and when window becomes active
  const checkClipboard = async (forceShow = false) => {
    if (!forceShow && !settings().clipboardAuto) return;
    const text = await readSystemClipboard();
    const preview = buildVideoPreview(text, "clipboard");
    if (preview) {
      if (!forceShow && dismissedVideoId() === preview.videoId) return;
      if (forceShow) dismissedVideoId.set(null);
      clipboardPreview.set(preview);
      if (!url().trim()) {
        url.set(preview.rawUrl);
      }
    }
  };

  // Hydrate persisted state and local library on startup
  void initSettings().then((s) => {
    if (s.clipboardAuto) void checkClipboard();
  });
  void hydrateAllVideoTags().then((map) => {
    allVideoTags.set(map);
  });
  void listEntriesSafe().then((entries) => {
    savedEntries.set(entries);
  });

  effect(() => {
    if (lifecycle() === "active" && settings().clipboardAuto) {
      void checkClipboard();
    }
  });

  // Active video prompt row (either from clipboard or typed YouTube link)
  const activePreview = (): ClipboardVideoPreview | null => {
    const typed = url().trim();
    const fromInput = typed
      ? buildVideoPreview(
          typed,
          clipboardPreview()?.rawUrl === typed ? "clipboard" : "input",
        )
      : null;
    const candidate = fromInput ?? clipboardPreview();
    if (!candidate) return null;
    if (dismissedVideoId() === candidate.videoId) return null;
    ensurePreviewEnriched(candidate);
    const enriched = previewMetaMap()[candidate.videoId];
    return enriched
      ? { ...enriched, rawUrl: candidate.rawUrl, source: candidate.source }
      : candidate;
  };

  // Smooth progress runner for Parsing & Downloading
  const runWithAnimation = async (
    kind: "parsing" | "downloading",
    title: string,
    work: () => Promise<void>,
  ) => {
    activityKind.set(kind);
    activityTitle.set(title);
    activityProgress.set(16);
    const timer = setInterval(() => {
      const cur = activityProgress();
      if (cur < 90) {
        activityProgress.set(Math.min(92, cur + 14));
      }
    }, 45);
    try {
      await Promise.all([work(), delay(220)]);
      activityProgress.set(100);
      await delay(60);
    } finally {
      clearInterval(timer);
      activityKind.set(null);
      activityProgress.set(0);
    }
  };

  const updateTags = (next: Record<number, BlindTag>) => {
    tags.set(next);
    const L = lesson();
    if (L) {
      saveVideoTags(L.video.videoId, next);
      allVideoTags.set({ ...allVideoTags(), [L.video.videoId]: next });
    }
  };

  const openSavedEntry = async (
    entry: LibraryEntry,
    targetScreen: ChromeScreen = "blind",
  ) => {
    error.set(null);
    const loaded = await loadLessonFromEntry(entry);
    if (!loaded) {
      error.set(`Could not read saved captions for ${entry.videoId}`);
      return;
    }
    blindTargetIndex.set(0);
    lesson.set(loaded);
    tags.set(getVideoTags(entry.videoId));
    screen.set(targetScreen);
    status.set(`Opened downloaded lesson → ${entry.title}`);
  };

  const switchMode = (target: ChromeScreen) => {
    if (target !== "home" && !lesson()) {
      error.set("Paste a YouTube link and open it first");
      screen.set("home");
      return;
    }
    screen.set(target);
  };

  const onLoad = async () => {
    const value = url().trim();
    if (!value || loading()) return;
    loading.set(true);
    error.set(null);
    status.set(null);

    try {
      await runWithAnimation("parsing", value, async () => {
        const loaded = await loadLesson(value, hostFetch);

        // If local video.mp4 already exists, attach file:// URL directly
        try {
          const targetVideo = videoFile(
            loaded.video.videoId,
            "mp4",
            settings().downloadFolder,
          );
          if (await exists(targetVideo)) {
            loaded.video.videoUrl = `file://${targetVideo}`;
            loaded.video.audioUrl = `file://${targetVideo}`;
            loaded.video.videoMimeType = "video/mp4";
          }
        } catch {
          // ignore
        }

        blindTargetIndex.set(0);
        lesson.set(loaded);
        tags.set(getVideoTags(loaded.video.videoId));
        saveSettings({ lastUrl: value });
        dismissedVideoId.set(loaded.video.videoId);
        if (!loaded.track) {
          error.set("Parsed video, but no caption tracks found");
          screen.set("home");
        } else if (loaded.sentences.length === 0) {
          error.set("Captions loaded, but no sentences after merge");
          screen.set("home");
        } else {
          screen.set("blind");
          status.set(
            isNativeHost()
              ? `Parsed "${loaded.video.title}" on native host`
              : `Parsed "${loaded.video.title}"`,
          );
          // Auto-download video & captions in background so playback has reliable local media
          void downloadTargetLesson(loaded);
        }
      });
    } catch (e) {
      lesson.set(null);
      tags.set({});
      screen.set("home");
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      loading.set(false);
    }
  };

  const downloadTargetLesson = async (target: LoadedLesson) => {
    if (saving()) return;
    saving.set(true);
    error.set(null);
    try {
      await runWithAnimation("downloading", target.video.title, async () => {
        const { entry, audioNote } = await downloadLesson(target, {
          fetchImpl: hostFetch,
          downloadFolder: settings().downloadFolder,
        });
        const entries = await listEntriesSafe();
        savedEntries.set(entries);

        // If currently viewing this lesson, update with downloaded file:// URLs
        const cur = lesson();
        if (cur && cur.video.videoId === entry.videoId) {
          const localMedia = entry.videoPath
            ? `file://${entry.videoPath}`
            : entry.audioPath
              ? `file://${entry.audioPath}`
              : null;
          if (localMedia) {
            lesson.set({
              ...cur,
              video: {
                ...cur.video,
                videoUrl: entry.videoPath
                  ? `file://${entry.videoPath}`
                  : cur.video.videoUrl,
                audioUrl: localMedia,
                videoMimeType: entry.videoPath
                  ? "video/mp4"
                  : cur.video.videoMimeType,
              },
            });
          }
        }

        status.set(
          audioNote
            ? `Downloaded captions → ${entry.captionsPath} (${audioNote})`
            : `Downloaded locally → ${entry.captionsPath}` +
                (entry.audioPath ? ` + ${entry.audioPath}` : "") +
                (entry.videoPath ? ` + ${entry.videoPath}` : ""),
        );
      });
    } catch (e) {
      error.set(e instanceof Error ? e.message : String(e));
    } finally {
      saving.set(false);
    }
  };

  const onSaveLocal = async () => {
    const L = lesson();
    if (!L) return;
    await downloadTargetLesson(L);
  };

  const onConfirmClipboard = async (preview: ClipboardVideoPreview) => {
    url.set(preview.rawUrl);
    await onLoad();
  };

  keymap.bind({
    "mod+l": () => urlInputRef?.focus(),
    "mod+k": () => urlInputRef?.focus(),
    "mod+,": () => settingsOpen.set(!settingsOpen()),
    escape: () => {
      if (settingsOpen()) settingsOpen.set(false);
    },
    "mod+1": () => switchMode("home"),
    "mod+2": () => switchMode("blind"),
    "mod+3": () => switchMode("loop"),
    "mod+4": () => switchMode("list"),
    "mod+s": () => {
      if (lesson()) void onSaveLocal();
    },
  });

  effect(() => {
    if (!isAvailable) return;
    const L = lesson();
    const sc = screen();
    const modeLabel =
      sc === "home"
        ? "Library"
        : sc === "blind"
          ? "Blind Flow"
          : sc === "loop"
            ? "Loop Dojo"
            : "Sentences";
    Window.setTitle(
      L ? `Ear — ${modeLabel} · ${L.video.title}` : `Ear — ${modeLabel}`,
    );

    Menu.setApplicationMenu([
      {
        label: "File",
        submenu: [
          {
            label: "Focus Link Field",
            shortcut: "mod+l",
            onSelect: () => urlInputRef?.focus(),
          },
          {
            label: "Read Link from Clipboard",
            onSelect: () => void checkClipboard(true),
          },
          {
            label: "Download Lesson Locally",
            shortcut: "mod+s",
            disabled: !L,
            onSelect: () => void onSaveLocal(),
          },
          { type: "separator" },
          {
            label: "Settings…",
            shortcut: "mod+,",
            onSelect: () => settingsOpen.set(true),
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "Practice",
        submenu: [
          {
            label: "Library",
            shortcut: "mod+1",
            checked: sc === "home",
            onSelect: () => switchMode("home"),
          },
          {
            label: "Blind Flow",
            shortcut: "mod+2",
            checked: sc === "blind",
            onSelect: () => switchMode("blind"),
          },
          {
            label: "Loop Dojo",
            shortcut: "mod+3",
            checked: sc === "loop",
            onSelect: () => switchMode("loop"),
          },
          {
            label: "Sentences",
            shortcut: "mod+4",
            checked: sc === "list",
            onSelect: () => switchMode("list"),
          },
        ],
      },
      {
        label: "Window",
        submenu: [
          {
            label: "Switch Appearance",
            onSelect: () =>
              updateSettings({
                appearance: colorScheme() === "dark" ? "light" : "dark",
              }),
          },
          { type: "separator" },
          { role: "minimize" },
          { role: "zoom" },
          { role: "toggleFullScreen" },
        ],
      },
    ]);
  });

  const currentDojoCount = () => {
    const L = lesson();
    if (!L) return 0;
    return dojoQueue(L.sentences, tags()).length;
  };

  const blindLesson = (): LoadedLesson | null =>
    screen() === "blind" ? lesson() : null;
  const loopLesson = (): LoadedLesson | null =>
    screen() === "loop" ? lesson() : null;
  const listLesson = (): LoadedLesson | null =>
    screen() === "list" ? lesson() : null;

  return (
    <View class="relative flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* 1. Minimal top bar + text mode tabs + 1px progress line */}
      <TopBar
        url={url}
        onUrlChange={(v) => {
          url.set(v);
          dismissedVideoId.set(null);
        }}
        onClearUrl={() => {
          const cur = activePreview();
          if (cur) dismissedVideoId.set(cur.videoId);
          url.set("");
        }}
        onInputRef={(ref) => {
          urlInputRef = ref;
        }}
        onSubmitParse={() => void onLoad()}
        onReadClipboard={() => void checkClipboard(true)}
        showClipboardButton={() =>
          !settings().clipboardAuto && url().length === 0
        }
        loading={loading}
        screen={screen}
        onSelectScreen={switchMode}
        dojoCount={currentDojoCount}
        totalVideos={() => savedEntries().length}
        onOpenSettings={() => settingsOpen.set(true)}
        activityKind={activityKind}
        activityProgress={activityProgress}
      />

      {/* 2. Single workspace scroll area */}
      <Scroll class="flex-1">
        <View class="mx-auto w-full max-w-[960px] gap-4 p-4 md:p-5">
          {/* Quiet activity status & toasts */}
          <ActivityBanner
            kind={activityKind}
            progress={activityProgress}
            targetTitle={activityTitle}
            error={error}
            status={status}
            onDismissStatus={() => {
              error.set(null);
              status.set(null);
            }}
          />

          {/* Compact single-line clipboard prompt */}
          <If when={activePreview()}>
            {(getPreview) => (
              <ClipboardCard
                preview={getPreview}
                loading={loading}
                onConfirm={(p) => void onConfirmClipboard(p)}
                onDismiss={() => dismissedVideoId.set(getPreview().videoId)}
              />
            )}
          </If>

          {/* Screen 1: Minimal library list */}
          <If when={screen() === "home"}>
            <LibraryView
              savedEntries={savedEntries}
              activeVideoId={() => lesson()?.video.videoId ?? null}
              allVideoTags={allVideoTags}
              onOpenSaved={(entry, mode) => void openSavedEntry(entry, mode)}
            />
          </If>

          {/* Screen 2: Blind Flow */}
          <If when={blindLesson()}>
            {(get) => (
              <BlindFlow
                lesson={get()}
                tags={tags()}
                onTagsChange={updateTags}
                onOpenDojo={() => screen.set("loop")}
                onDownload={() => void onSaveLocal()}
                saving={saving}
                initialIndex={blindTargetIndex() ?? undefined}
              />
            )}
          </If>

          {/* Screen 3: Loop Dojo */}
          <If when={loopLesson()}>
            {(get) => (
              <LoopDojo
                lesson={get()}
                tags={tags()}
                onBackToBlind={() => screen.set("blind")}
                onDownload={() => void onSaveLocal()}
                saving={saving}
              />
            )}
          </If>

          {/* Screen 4: Sentences List */}
          <If when={listLesson()}>
            {(get) => (
              <SentencesView
                lesson={get}
                tags={tags}
                difficultyFilter={difficultyFilter}
                onDifficultyFilterChange={(df) => difficultyFilter.set(df)}
                onPracticeInBlind={(idx) => {
                  if (idx != null) {
                    blindTargetIndex.set(idx);
                  }
                  screen.set("blind");
                }}
              />
            )}
          </If>
        </View>
      </Scroll>

      {/* 3. Optional bottom shortcut bar (hidden by default) */}
      <ChromeHint
        screen={screen()}
        onSelectScreen={switchMode}
        lessonTitle={lesson()?.video.title ?? null}
        sentenceCount={lesson()?.sentences.length ?? 0}
        dojoCount={currentDojoCount()}
      />

      {/* 4. Settings Modal */}
      <If when={settingsOpen()}>
        <SettingsPanel onClose={() => settingsOpen.set(false)} />
      </If>
    </View>
  );
}

mount(App);
