import type { PlaybackRate } from "../player";
import type { Sentence } from "../youtube/types";
import type { BlindTag } from "./blindFlowLogic";

export type DiffKind = "equal" | "mismatch" | "missing" | "extra";

export type DiffToken = {
  kind: DiffKind;
  expected?: string;
  actual?: string;
};

/** Normalize for comparison: lowercase, strip surrounding punctuation. */
export function normalizeWord(w: string): string {
  return w
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "");
}

export function tokenize(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/**
 * Word-level Diff: walk expected vs typed tokens.
 * mismatch when both present but normalize unequal;
 * missing = expected left; extra = typed left.
 */
export function wordDiff(expectedText: string, typedText: string): DiffToken[] {
  const expected = tokenize(expectedText);
  const actual = tokenize(typedText);
  const out: DiffToken[] = [];
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    const e = expected[i];
    const a = actual[i];
    if (e != null && a != null) {
      if (normalizeWord(e) === normalizeWord(a)) {
        out.push({ kind: "equal", expected: e, actual: a });
      } else {
        out.push({ kind: "mismatch", expected: e, actual: a });
      }
    } else if (e != null) {
      out.push({ kind: "missing", expected: e });
    } else if (a != null) {
      out.push({ kind: "extra", actual: a });
    }
  }
  return out;
}

export function diffSummary(tokens: DiffToken[]): {
  equal: number;
  mismatch: number;
  missing: number;
  extra: number;
} {
  const s = { equal: 0, mismatch: 0, missing: 0, extra: 0 };
  for (const t of tokens) s[t.kind] += 1;
  return s;
}

export const LOOP_RATES: PlaybackRate[] = [0.8, 1, 1.2, 1.5, 2];

export function nextRate(current: PlaybackRate): PlaybackRate {
  const i = LOOP_RATES.indexOf(current);
  if (i === -1) return 1;
  return LOOP_RATES[(i + 1) % LOOP_RATES.length]!;
}

/** Loop Dojo default queue: only Blind Flow Lag + Blind (never Pass). */
export function dojoQueue(
  sentences: Sentence[],
  tags: Record<number, BlindTag>,
): Sentence[] {
  return sentences.filter((s) => {
    const tag = tags[s.index];
    return tag === "lag" || tag === "blind";
  });
}
