import {
  colorScheme,
  effect,
  keymap,
  lifecycle,
  mount,
  Scroll,
  setColorScheme,
  signal,
  View,
  type InputRef,
} from "nsh";
import { isAvailable, Menu, Window } from "nsh/desktop";
import { downloadLesson } from "./library/download";
import { listEntriesSafe, loadLessonFromEntry } from "./library/index";
import {
  findSampleLesson,
  SAMPLE_LESSONS,
  type SampleLessonMeta,
} from "./library/samples";
import type { LibraryEntry } from "./library/types";
import { BlindFlow } from "./modes/BlindFlow";
import type { BlindTag } from "./modes/blindFlow";
import { LoopDojo } from "./modes/LoopDojo";
import { dojoQueue } from "./modes/loopDojo";
import {
  getVideoTags,
  hydrateAllVideoTags,
  saveSettings,
  saveVideoTags,
} from "./persist/store";
import { ActivityBanner, type ActivityKind } from "./ui/ActivityBanner";
import { ChromeHint, type ChromeScreen } from "./ui/chrome";
import {
  buildVideoPreview,
  readSystemClipboard,
  type ClipboardVideoPreview,
} from "./ui/clipboard";
import { ClipboardCard } from "./ui/ClipboardCard";
import { LibraryGrid, type LibraryFilter } from "./ui/LibraryGrid";
import { SentencesView } from "./ui/SentencesView";
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
  const libraryFilter = signal<LibraryFilter>("all");
  const difficultyFilter = signal<"all" | Difficulty>("all");
  const savedEntries = signal<LibraryEntry[]>([]);
  const allVideoTags = signal<Record<string, Record<number, BlindTag>>>({});
  const clipboardPreview = signal<ClipboardVideoPreview | null>(null);
  const dismissedVideoId = signal<string | null>(null);
  let urlInputRef: InputRef | null = null;

  if (isAvailable) {
    Window.setTitleBar({ style: "hidden", height: 44 });
  }

  // Hydrate persisted state and local library on startup
  void hydrateAllVideoTags().then((map) => {
    allVideoTags.set(map);
  });
  void listEntriesSafe().then((entries) => {
    savedEntries.set(entries);
  });

  // Requirement #3: Auto-read clipboard on startup and when window becomes active
  const checkClipboard = async (forceShow = false) => {
    const text = await readSystemClipboard();
    const preview = buildVideoPreview(text, "clipboard");
    if (preview) {
      if (!forceShow && dismissedVideoId() === preview.videoId) return;
      if (forceShow) dismissedVideoId.set(null);
      clipboardPreview.set(preview);
      if (!url().trim()) {
        url.set(preview.rawUrl);
      }
      return;
    }
    if (forceShow) {
      // If user explicitly clicked "Clipboard" / "Show Clipboard Prompt" and system clipboard has no video,
      // populate the Downbit demo video from clipboard preview so they can see & use the prompt immediately.
      const demoUrl = "https://www.youtube.com/watch?v=b-6XR0rflJw";
      const demo = buildVideoPreview(demoUrl, "clipboard");
      if (demo) {
        dismissedVideoId.set(null);
        clipboardPreview.set(demo);
        url.set(demoUrl);
      }
    }
  };

  void checkClipboard();

  effect(() => {
    if (lifecycle() === "active") {
      void checkClipboard();
    }
  });

  // Active video prompt card (either from clipboard or typed YouTube link)
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
    return candidate;
  };

  // Requirement #4: Smooth animated progress runner for Parsing & Downloading
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

  const openSampleLesson = async (
    sample: SampleLessonMeta,
    targetScreen: ChromeScreen = "blind",
    animate = false,
  ) => {
    error.set(null);
    if (animate) {
      loading.set(true);
      try {
        await runWithAnimation("parsing", sample.title, async () => {
          lesson.set(sample.lesson);
          tags.set(getVideoTags(sample.videoId));
        });
      } finally {
        loading.set(false);
      }
    } else {
      lesson.set(sample.lesson);
      tags.set(getVideoTags(sample.videoId));
    }
    dismissedVideoId.set(sample.videoId);
    screen.set(targetScreen);
    status.set(
      `Ready · ${sample.title} (${sample.lesson.sentences.length} sentences)`,
    );
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
    lesson.set(loaded);
    tags.set(getVideoTags(entry.videoId));
    screen.set(targetScreen);
    status.set(`Opened downloaded lesson → ${entry.title}`);
  };

  const switchMode = (target: ChromeScreen) => {
    if (target !== "home" && !lesson()) {
      const first = SAMPLE_LESSONS[0];
      if (first) {
        void openSampleLesson(first, target, false);
        return;
      }
    }
    screen.set(target);
  };

  const onLoad = async () => {
    const value = url().trim();
    if (!value || loading()) return;
    loading.set(true);
    error.set(null);
    status.set(null);

    const matchedSample = findSampleLesson(value);
    const previewTitle = matchedSample?.title ?? value;

    try {
      await runWithAnimation("parsing", previewTitle, async () => {
        if (matchedSample && !isNativeHost()) {
          lesson.set(matchedSample.lesson);
          tags.set(getVideoTags(matchedSample.videoId));
          saveSettings({ lastUrl: value, preferredRate: 1 });
          dismissedVideoId.set(matchedSample.videoId);
          screen.set("blind");
          status.set(
            `Parsed "${matchedSample.title}" · ${matchedSample.lesson.sentences.length} sentences`,
          );
          return;
        }

        const loaded = await loadLesson(value, hostFetch);
        lesson.set(loaded);
        tags.set(getVideoTags(loaded.video.videoId));
        saveSettings({ lastUrl: value, preferredRate: 1 });
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
        }
      });
    } catch (e) {
      if (matchedSample) {
        lesson.set(matchedSample.lesson);
        tags.set(getVideoTags(matchedSample.videoId));
        dismissedVideoId.set(matchedSample.videoId);
        screen.set("blind");
        status.set(
          `Loaded studio track "${matchedSample.title}" (${matchedSample.lesson.sentences.length} sentences)`,
        );
      } else {
        lesson.set(null);
        tags.set({});
        screen.set("home");
        error.set(e instanceof Error ? e.message : String(e));
      }
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
        const { entry, audioNote } = await downloadLesson(target, hostFetch);
        const entries = await listEntriesSafe();
        savedEntries.set(entries);
        status.set(
          audioNote
            ? `Downloaded captions → ${entry.captionsPath} (${audioNote})`
            : `Downloaded locally → ${entry.captionsPath}` +
                (entry.audioPath ? ` + ${entry.audioPath}` : ""),
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
    if (preview.sample) {
      await openSampleLesson(preview.sample, "blind", true);
      return;
    }
    await onLoad();
  };

  keymap.bind({
    "mod+l": () => urlInputRef?.focus(),
    "mod+k": () => urlInputRef?.focus(),
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
              setColorScheme(colorScheme() === "dark" ? "light" : "dark"),
          },
          { type: "separator" },
          { role: "minimize" },
          { role: "zoom" },
          { role: "toggleFullScreen" },
        ],
      },
    ]);
  });

  const filteredSamples = (): SampleLessonMeta[] => {
    const f = libraryFilter();
    const q = url().trim().toLowerCase();
    return SAMPLE_LESSONS.filter((s) => {
      if (f !== "all" && f !== "saved" && s.category !== f) return false;
      if (
        q &&
        !q.startsWith("http") &&
        !/^[\w-]{11}$/.test(q) &&
        !s.title.toLowerCase().includes(q) &&
        !s.speaker.toLowerCase().includes(q) &&
        !s.channel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  };

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
    <View class="flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* 1. Clean Top Downbit Omnibar + Mode Switcher */}
      <TopBar
        url={url}
        onUrlChange={(v) => {
          url.set(v);
          dismissedVideoId.set(null);
        }}
        onInputRef={(ref) => {
          urlInputRef = ref;
        }}
        onSubmitParse={() => void onLoad()}
        onReadClipboard={() => void checkClipboard(true)}
        loading={loading}
        saving={saving}
        hasLesson={() => lesson() != null}
        onSaveLocal={() => void onSaveLocal()}
        screen={screen}
        onSelectScreen={switchMode}
        dojoCount={currentDojoCount}
        totalVideos={() => SAMPLE_LESSONS.length + savedEntries().length}
      />

      {/* 2. Single Clean Workspace Scroll Area (No Left Sidebar Clutter) */}
      <Scroll class="flex-1">
        <View class="mx-auto w-full max-w-[1160px] gap-4 p-4 md:p-5">
          {/* Animated Parsing / Downloading Progress Banner */}
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

          {/* Downbit-Style "From your clipboard" Floating Prompt Card */}
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

          {/* Screen 1: Simplified Downbit Media Grid */}
          <If when={screen() === "home"}>
            <LibraryGrid
              filter={libraryFilter}
              onFilterChange={(f) => libraryFilter.set(f)}
              samples={filteredSamples}
              savedEntries={savedEntries}
              activeVideoId={() => lesson()?.video.videoId ?? null}
              allVideoTags={allVideoTags}
              onOpenSample={(sample, mode) =>
                void openSampleLesson(sample, mode, true)
              }
              onDownloadSample={(sample) => {
                lesson.set(sample.lesson);
                tags.set(getVideoTags(sample.videoId));
                void downloadTargetLesson(sample.lesson);
              }}
              onOpenSaved={(entry, mode) => void openSavedEntry(entry, mode)}
              onPreviewClipboardDemo={() => void checkClipboard(true)}
              hasClipboardPreview={() => activePreview() != null}
            />
          </If>

          {/* Screen 2: Blind Flow (Cinema Listening Stage) */}
          <If when={blindLesson()}>
            {(get) => (
              <BlindFlow
                lesson={get()}
                tags={tags()}
                onTagsChange={updateTags}
                onOpenDojo={() => screen.set("loop")}
              />
            )}
          </If>

          {/* Screen 3: Loop Dojo (A–B Dictation & Diff) */}
          <If when={loopLesson()}>
            {(get) => (
              <LoopDojo
                lesson={get()}
                tags={tags()}
                onBackToBlind={() => screen.set("blind")}
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
                onPracticeInBlind={() => screen.set("blind")}
              />
            )}
          </If>
        </View>
      </Scroll>

      {/* 3. Subtle Bottom Status Bar */}
      <ChromeHint
        screen={screen()}
        onSelectScreen={switchMode}
        lessonTitle={lesson()?.video.title ?? null}
        sentenceCount={lesson()?.sentences.length ?? 0}
        dojoCount={currentDojoCount()}
      />
    </View>
  );
}

mount(App);
