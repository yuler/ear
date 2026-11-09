import { mergeSentences } from "../youtube/captions";
import type { CaptionCue, LoadedLesson } from "../youtube/types";

export type SampleLessonMeta = {
  videoId: string;
  title: string;
  speaker: string;
  channel: string;
  durationLabel: string;
  durationMs: number;
  category: "AI & Tech" | "Short Film" | "Startups";
  accentBg: string;
  accentText: string;
  badgeText: string;
  cues: CaptionCue[];
  lesson: LoadedLesson;
};

function buildSample(spec: {
  videoId: string;
  title: string;
  speaker: string;
  channel: string;
  durationLabel: string;
  durationMs: number;
  category: "AI & Tech" | "Short Film" | "Startups";
  accentBg: string;
  accentText: string;
  badgeText: string;
  cues: CaptionCue[];
}): SampleLessonMeta {
  const sentences = mergeSentences(spec.cues);
  const track = {
    languageCode: "en",
    name: "English (Studio CC)",
    baseUrl: `https://www.youtube.com/api/timedtext?v=${spec.videoId}&lang=en`,
  };
  return {
    ...spec,
    lesson: {
      video: {
        videoId: spec.videoId,
        title: spec.title,
        audioUrl: null,
        audioMimeType: "audio/mp4",
        durationMs: spec.durationMs,
        captionTracks: [track],
        playerResponse: null,
      },
      track,
      cues: spec.cues,
      sentences,
    },
  };
}

export const SAMPLE_LESSONS: SampleLessonMeta[] = [
  buildSample({
    videoId: "b-6XR0rflJw",
    title: "30秒真实英语，你能听懂多少？| 听力辅助 + 跟读拆解 + 实用词汇 | B1-B2",
    speaker: "EnglishLoop",
    channel: "EnglishLoop | 英语圈",
    durationLabel: "6:45",
    durationMs: 405000,
    category: "AI & Tech",
    accentBg: "bg-[#1a2230]",
    accentText: "text-[#6cb6ff]",
    badgeText: "B1-B2 · REAL ENGLISH",
    cues: [
      {
        startMs: 3000,
        endMs: 8200,
        text: "When native speakers talk at natural speed, words blend together into connected phrases.",
      },
      {
        startMs: 9500,
        endMs: 14400,
        text: "Instead of catching every isolated word, train your ear to recognize the rhythm of the sentence.",
      },
      {
        startMs: 16000,
        endMs: 20500,
        text: "Listen once without subtitles first, then reveal the line to check what you missed.",
      },
      {
        startMs: 22000,
        endMs: 27200,
        text: "Repeating a short six-second clip three times builds real listening reflexes.",
      },
    ],
  }),
  buildSample({
    videoId: "lXUZvyajciY",
    title: "Andrej Karpathy — We're summoning ghosts, not building animals",
    speaker: "Andrej Karpathy",
    channel: "Dwarkesh Podcast",
    durationLabel: "2:26:08",
    durationMs: 8768000,
    category: "AI & Tech",
    accentBg: "bg-[#241c15]",
    accentText: "text-[#e8a13a]",
    badgeText: "DECADE OF AGENTS",
    cues: [
      {
        // 13 words over 5.8s -> ~134 wpm (i-1)
        startMs: 81000,
        endMs: 86800,
        text: "This is really a lot more accurately described as the decade of agents.",
      },
      {
        // 10 words over 3.8s -> ~158 wpm (i+1)
        startMs: 106000,
        endMs: 109800,
        text: "What do you think will take a decade to accomplish?",
      },
      {
        // 19 words over 6.8s -> ~168 wpm (i+1)
        startMs: 116000,
        endMs: 122800,
        text: "You should think of it almost like an employee or an intern that you would hire to work with you.",
      },
      {
        // 14 words over 4.3s -> ~195 wpm (Hard)
        startMs: 133000,
        endMs: 137300,
        text: "The reason you don't do it today is because they just don't work.",
      },
      {
        // 18 words over 5.6s -> ~193 wpm (Hard)
        startMs: 143000,
        endMs: 148600,
        text: "They don't have continual learning, and you cannot just tell them something and expect them to remember it.",
      },
      {
        // 14 words over 6.2s -> ~135 wpm (i-1)
        startMs: 152000,
        endMs: 158200,
        text: "It will take about a decade to work through all of those subtle issues.",
      },
    ],
  }),
  buildSample({
    videoId: "vif8NQcjVf0",
    title: "Jensen Huang: NVIDIA — The $4 Trillion Company & the AI Revolution",
    speaker: "Jensen Huang",
    channel: "Lex Fridman #494",
    durationLabel: "2:25:59",
    durationMs: 8759000,
    category: "AI & Tech",
    accentBg: "bg-[#16231a]",
    accentText: "text-[#7cc08a]",
    badgeText: "LEX #494",
    cues: [
      {
        startMs: 12000,
        endMs: 17200,
        text: "Accelerated computing is not just about making chips run slightly faster.",
      },
      {
        startMs: 19000,
        endMs: 25200,
        text: "When you drop the marginal cost of intelligence by a factor of a million, you change how software is written.",
      },
      {
        startMs: 27000,
        endMs: 31800,
        text: "Every single layer of the computing stack has been reinvented from scratch.",
      },
      {
        startMs: 33000,
        endMs: 37200,
        text: "Instead of retrieving pre-recorded files, computers now generate tokens in real time.",
      },
      {
        startMs: 39000,
        endMs: 44200,
        text: "That is the fundamental shift from information retrieval to generative intelligence.",
      },
    ],
  }),
  buildSample({
    videoId: "5eouRdDYM2c",
    title: "Sam Altman in conversation with Patrick Collison — Intelligence as a Utility",
    speaker: "Sam Altman",
    channel: "Stripe Sessions",
    durationLabel: "56:31",
    durationMs: 3391000,
    category: "Startups",
    accentBg: "bg-[#1a1f2b]",
    accentText: "text-[#8cb4f5]",
    badgeText: "UTILITY ERA",
    cues: [
      {
        startMs: 5000,
        endMs: 10800,
        text: "There has never been a better time in history to start a small, focused technology company.",
      },
      {
        startMs: 12000,
        endMs: 17200,
        text: "Small teams with deep domain taste can now move faster than giant organizations ever could.",
      },
      {
        startMs: 19000,
        endMs: 23800,
        text: "Treat intelligence like electricity or bandwidth that gets cheaper every single quarter.",
      },
      {
        startMs: 25000,
        endMs: 31200,
        text: "Build for where the models will be in eighteen months, not for the limitations you see today.",
      },
    ],
  }),
  buildSample({
    videoId: "aqz-KE-bpKQ",
    title: "Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film",
    speaker: "Blender Studio",
    channel: "Blender Foundation",
    durationLabel: "10:34",
    durationMs: 634000,
    category: "Short Film",
    accentBg: "bg-[#1e2618]",
    accentText: "text-[#86c34f]",
    badgeText: "UHD 60FPS",
    cues: [
      {
        startMs: 2000,
        endMs: 7500,
        text: "Every morning in the forest begins quietly before the creatures wake up.",
      },
      {
        startMs: 9000,
        endMs: 14200,
        text: "Patience stays easy until someone crosses the line and tests your kindness.",
      },
      {
        startMs: 16000,
        endMs: 20800,
        text: "Open tools let independent artists build cinema-grade worlds right on their desktop.",
      },
      {
        startMs: 22000,
        endMs: 27400,
        text: "Listen closely to the rhythm of natural English phrasing across each scene.",
      },
    ],
  }),
  buildSample({
    videoId: "y6NfxiemvHg",
    title: "Demis Hassabis: Future of AI, Simulating Reality, Physics and Video Games",
    speaker: "Demis Hassabis",
    channel: "Lex Fridman #475",
    durationLabel: "2:28:15",
    durationMs: 8895000,
    category: "AI & Tech",
    accentBg: "bg-[#251b18]",
    accentText: "text-[#e58a6e]",
    badgeText: "ROUND 2 · #475",
    cues: [
      {
        startMs: 4000,
        endMs: 9800,
        text: "Nature is complex, yet the underlying patterns of biology and physics can be learned.",
      },
      {
        startMs: 11000,
        endMs: 16400,
        text: "When you fold a protein in seconds instead of years, scientific discovery enters a new epoch.",
      },
      {
        startMs: 18000,
        endMs: 23000,
        text: "Games taught us how to search vast decision trees with intuition and planning.",
      },
      {
        startMs: 24500,
        endMs: 30200,
        text: "The ultimate goal has always been to solve intelligence and use it to advance science.",
      },
    ],
  }),
  buildSample({
    videoId: "ZIaOBAjvc38",
    title: "Skill Issue: Andrej Karpathy on Code Agents, AutoResearch, and the Loopy Era",
    speaker: "Andrej Karpathy",
    channel: "No Priors",
    durationLabel: "1:06:32",
    durationMs: 3992000,
    category: "AI & Tech",
    accentBg: "bg-[#231926]",
    accentText: "text-[#d49cf0]",
    badgeText: "LOOPY ERA",
    cues: [
      {
        startMs: 3000,
        endMs: 8400,
        text: "Working effectively with coding agents is a genuine skill that takes deliberate practice.",
      },
      {
        startMs: 10000,
        endMs: 14800,
        text: "You have to decompose problems cleanly and verify every single step in a tight loop.",
      },
      {
        startMs: 16000,
        endMs: 21500,
        text: "Comprehensible input works the exact same way when you train your ear for fast spoken English.",
      },
      {
        startMs: 23000,
        endMs: 28800,
        text: "Keep the loop short, focus on the phrases you missed, and let repetition build fluency.",
      },
    ],
  }),
];

export function findSampleLesson(input: string): SampleLessonMeta | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  for (const s of SAMPLE_LESSONS) {
    if (
      s.videoId.toLowerCase() === q ||
      q.includes(s.videoId.toLowerCase()) ||
      s.title.toLowerCase() === q
    ) {
      return s;
    }
  }
  return null;
}
