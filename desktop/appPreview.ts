import { signal, type Signal } from "nsh";
import {
  buildVideoPreview,
  fetchVideoPreviewMeta,
  formatDurationMs,
  isLinkText,
  readSystemClipboard,
  type ClipboardVideoPreview,
} from "./clipboard";
import { settings } from "./ui/settings";
import { hostFetch } from "./youtube/host";
import {
  captionTrackId,
  extractVideoId,
  isAutoCaptionTrack,
  preferBestCaptionTrack,
} from "./youtube/parse";
import type { CaptionTrack } from "./youtube/types";

/** The download choices the link card offers, in order. */
export const QUALITY_IDS = ["360p", "720p", "1080p", "audio"] as const;

/**
 * The quality ids to offer for a parsed video: the standard four it has, or
 * all four while it is not parsed (or reports none of them).
 */
export function availableQualityIds(preview: ClipboardVideoPreview): string[] {
  const ids = new Set((preview.qualities ?? []).map((q) => q.id));
  const list = QUALITY_IDS.filter((id) => ids.has(id));
  return list.length > 0 ? list : [...QUALITY_IDS];
}

/** The user's default quality when offered, else 360p, else the first. */
export function defaultQualityId(available: readonly string[]): string {
  const pref = settings().defaultQuality ?? "360p";
  if (available.includes(pref)) return pref;
  if (available.includes("360p")) return "360p";
  return available[0] ?? "360p";
}

function matchesLanguage(track: CaptionTrack, lang: string): boolean {
  return track.languageCode === lang || track.languageCode.startsWith(`${lang}-`);
}

/**
 * The recommended subtitle track: the video's language with a manual track
 * first, then its auto track. Without a language hint the title decides
 * (Japanese text means Japanese), else English.
 */
export function pickDefaultTrack(
  tracks: readonly CaptionTrack[],
  options: { language?: string | null; title?: string } = {},
): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const lang = options.language;
  if (lang) {
    const manual = tracks.find((t) => matchesLanguage(t, lang) && !isAutoCaptionTrack(t));
    if (manual) return manual;
    const auto = tracks.find((t) => matchesLanguage(t, lang));
    if (auto) return auto;
  }
  return preferBestCaptionTrack([...tracks], options.title);
}

/**
 * The link the top bar shows a card for (typed or read from the clipboard),
 * its parsed metadata, and the quality and subtitle chosen for it.
 */
export function createPreviewController(url: Signal<string>) {
  const clipboardPreview = signal<ClipboardVideoPreview | null>(null);
  const seededPreview = signal<ClipboardVideoPreview | null>(null);
  const metaMap = signal<Record<string, ClipboardVideoPreview>>({});
  const parsingMap = signal<Record<string, boolean>>({});
  const parseMessageMap = signal<Record<string, string>>({});
  const qualityMap = signal<Record<string, string>>({});
  const trackMap = signal<Record<string, string>>({});
  const dismissedVideoId = signal<string | null>(null);
  const fetching = new Set<string>();

  const setKey = <T>(s: Signal<Record<string, T>>, key: string, value: T | undefined) => {
    const next = { ...s() };
    if (value === undefined) delete next[key];
    else next[key] = value;
    s.set(next);
  };

  const enrich = (preview: ClipboardVideoPreview) => {
    const vid = preview.videoId;
    if (metaMap()[vid] || fetching.has(vid)) return;
    fetching.add(vid);
    setKey(parsingMap, vid, true);
    setKey(parseMessageMap, vid, "fetching metadata…");
    void fetchVideoPreviewMeta(preview, hostFetch, (ev) => {
      if (ev.message) setKey(parseMessageMap, vid, ev.message);
    })
      .then((enriched) => setKey(metaMap, vid, enriched))
      .finally(() => {
        fetching.delete(vid);
        setKey(parsingMap, vid, undefined);
        setKey(parseMessageMap, vid, undefined);
      });
  };

  const withEnriched = (base: ClipboardVideoPreview): ClipboardVideoPreview => {
    enrich(base);
    const enriched = metaMap()[base.videoId];
    return enriched
      ? {
          ...base,
          ...enriched,
          rawUrl: base.rawUrl,
          source: base.source,
          language: base.language ?? enriched.language ?? null,
        }
      : base;
  };

  const active = (): ClipboardVideoPreview | null => {
    const typed = url().trim();
    const clip = clipboardPreview();
    const seed = seededPreview();

    if (typed) {
      if (!isLinkText(typed)) return null;
      const typedVid = extractVideoId(typed);
      if (!typedVid) return null;

      const candidate =
        seed && (seed.rawUrl === typed || seed.videoId === typedVid)
          ? seed
          : clip && (clip.rawUrl === typed || clip.videoId === typedVid)
            ? clip
            : buildVideoPreview(typed, "input");
      if (!candidate || dismissedVideoId() === candidate.videoId) return null;
      return withEnriched(candidate);
    }

    if (!clip || dismissedVideoId() === clip.videoId) return null;
    return withEnriched(clip);
  };

  const isParsing = () => {
    const cur = active();
    return cur ? Boolean(parsingMap()[cur.videoId]) : false;
  };

  const parseMessage = () => {
    const cur = active();
    return cur ? (parseMessageMap()[cur.videoId] ?? "") : "";
  };

  const qualityId = (): string => {
    const cur = active();
    if (!cur) return defaultQualityId(QUALITY_IDS);
    const available = availableQualityIds(cur);
    const chosen = qualityMap()[cur.videoId];
    return chosen && available.includes(chosen) ? chosen : defaultQualityId(available);
  };

  const trackId = (): string | null => {
    const cur = active();
    if (!cur) return null;
    const chosen = trackMap()[cur.videoId];
    if (chosen) return chosen;
    const track = pickDefaultTrack(cur.captionTracks ?? [], {
      language: cur.language,
      title: cur.title,
    });
    return track ? captionTrackId(track) : null;
  };

  const checkClipboard = async (forceShow = false) => {
    if (!forceShow && !settings().clipboardAuto) return;
    const preview = buildVideoPreview(await readSystemClipboard(), "clipboard");
    if (!preview) return;
    if (!forceShow && dismissedVideoId() === preview.videoId) return;
    if (forceShow) dismissedVideoId.set(null);
    clipboardPreview.set(preview);
    if (!url().trim()) url.set(preview.rawUrl);
  };

  /** Populate the search bar from a Discover card so the user can configure before downloading. */
  const selectFromDiscover = (item: {
    videoId: string;
    url: string;
    title: string;
    thumbnailUrl: string;
    durationMs?: number | null;
    author?: string | null;
    language?: string | null;
  }) => {
    dismissedVideoId.set(null);
    const author = item.author?.trim();
    seededPreview.set({
      rawUrl: item.url,
      videoId: item.videoId,
      title: item.title,
      channel: author ? `YouTube · ${author}` : "YouTube",
      durationLabel: formatDurationMs(item.durationMs ?? null),
      thumbnailUrl: item.thumbnailUrl,
      source: "discover",
      language: item.language ?? null,
      parsedVideo: null,
      qualities: [],
      captionTracks: [],
      isParsed: false,
    });
    url.set(item.url);
  };

  return {
    active,
    isParsing,
    parseMessage,
    qualityId,
    trackId,
    checkClipboard,
    selectFromDiscover,
    selectQuality: (id: string) => {
      const cur = active();
      if (cur) setKey(qualityMap, cur.videoId, id);
    },
    selectTrack: (id: string) => {
      const cur = active();
      if (cur) setKey(trackMap, cur.videoId, id);
    },
    /** Hides the card for the current link until another one comes. */
    dismiss: () => {
      const cur = active();
      if (cur) {
        dismissedVideoId.set(cur.videoId);
        if (cur.source === "discover") {
          seededPreview.set(null);
          if (url().trim() === cur.rawUrl) url.set("");
        }
      }
    },
    /** The user typed a link: a dismissed link may show again. */
    undismiss: () => dismissedVideoId.set(null),
    /** After a download starts: empty the field and close the card. */
    reset: (videoId?: string) => {
      if (videoId) dismissedVideoId.set(videoId);
      clipboardPreview.set(null);
      seededPreview.set(null);
      url.set("");
    },
  };
}

export type PreviewController = ReturnType<typeof createPreviewController>;
