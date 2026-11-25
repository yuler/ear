import { loadLessonFromEntry } from "../library/index";
import type { LibraryEntry } from "../library/types";
import { hostFetch } from "../youtube/host";
import { loadLesson } from "../youtube/parse";
import type { CaptionCue, Sentence } from "../youtube/types";
import type { SentenceLengthMode } from "../youtube/captions";
import { resegmentSentences } from "./sentencePlayer";

export type LoadedLessonCaptions = {
  cues: CaptionCue[];
  rawSentences: Sentence[];
  sentences: Sentence[];
};

/**
 * Loads captions and segmented sentences for a video lesson from local library or remote fetch.
 */
export async function fetchLessonCaptions(
  entry: LibraryEntry,
  lengthMode: SentenceLengthMode,
): Promise<LoadedLessonCaptions> {
  try {
    const loaded = await loadLessonFromEntry(entry).catch(() => null);
    let res =
      loaded && (loaded.cues?.length > 0 || loaded.sentences?.length > 0)
        ? loaded
        : null;

    if (!res && entry.url) {
      res = await loadLesson(entry.url, hostFetch).catch(() => null);
    }

    const cues = res?.cues ?? [];
    const rawSentences = res?.sentences ?? [];
    const sentences = resegmentSentences(cues, rawSentences, lengthMode);
    return { cues, rawSentences, sentences };
  } catch {
    return { cues: [], rawSentences: [], sentences: [] };
  }
}
