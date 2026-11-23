/**
 * Minimal ISO/IEC 18004 QR Code encoder (Byte mode, ECC Level L, Versions 1..8).
 * Zero external dependencies; covers up to 192 UTF-8 bytes (ear://pair?... URLs).
 */

interface VersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecPerBlock: number;
  blocks: number;
  alignments: number[];
}

// Level L specs for Versions 1..8 (single-group versions for compact implementation).
const SPECS: readonly VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecPerBlock: 7, blocks: 1, alignments: [] },
  { version: 2, size: 25, dataCodewords: 34, ecPerBlock: 10, blocks: 1, alignments: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecPerBlock: 15, blocks: 1, alignments: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecPerBlock: 20, blocks: 1, alignments: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecPerBlock: 26, blocks: 1, alignments: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecPerBlock: 18, blocks: 2, alignments: [6, 34] },
  { version: 7, size: 45, dataCodewords: 156, ecPerBlock: 20, blocks: 2, alignments: [6, 22, 38] },
  { version: 8, size: 49, dataCodewords: 194, ecPerBlock: 24, blocks: 2, alignments: [6, 24, 42] },
];

// Version information bitstrings for versions 7 & 8 (18-bit BCH(18,6)).
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
};

// Format info for ECC Level L (01) + Mask 0 (000): 0b01000 -> BCH + XOR 0x5412 = 0x77c4.
const FORMAT_L_MASK0 = 0x77c4;

export interface QrMatrix {
  version: number;
  size: number;
  /** Row-major boolean modules (`size * size`), true = dark module. */
  modules: boolean[];
}

function gfMul(a: number, b: number): number {
  let res = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) res ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>= 1;
  }
  return res;
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= gfMul(poly[j]!, root);
    }
    poly = next;
    root = gfMul(root, 2);
  }
  return poly;
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rem[0]!;
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) {
      rem[i] ^= gfMul(gen[i + 1]!, factor);
    }
  }
  return rem;
}

function encodeBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function chooseSpec(byteLen: number): VersionSpec {
  // Byte mode overhead: 4-bit mode + 8-bit length + 4-bit terminator = 2 bytes.
  const needed = byteLen + 2;
  for (const s of SPECS) {
    if (needed <= s.dataCodewords) return s;
  }
  return SPECS[SPECS.length - 1]!;
}

function buildCodewords(bytes: Uint8Array, spec: VersionSpec): number[] {
  const maxPayload = spec.dataCodewords - 2;
  const payload = bytes.length > maxPayload ? bytes.slice(0, maxPayload) : bytes;

  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);

  const totalBits = spec.dataCodewords * 8;
  const term = Math.min(4, totalBits - bits.length);
  pushBits(0, term);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    data.push(byte);
  }

  let pad = 0;
  while (data.length < spec.dataCodewords) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
    pad++;
  }

  // Split into equal blocks (all SPECS v1..v8 have uniform block sizes).
  const blockLen = spec.dataCodewords / spec.blocks;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const slice = data.slice(b * blockLen, (b + 1) * blockLen);
    dataBlocks.push(slice);
    ecBlocks.push(rsRemainder(slice, spec.ecPerBlock));
  }

  const out: number[] = [];
  for (let i = 0; i < blockLen; i++) {
    for (let b = 0; b < spec.blocks; b++) out.push(dataBlocks[b]![i]!);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) out.push(ecBlocks[b]![i]!);
  }
  return out;
}

/** Encode UTF-8 text into a scannable QR code matrix (ECC Level L). */
export function encodeQr(text: string): QrMatrix {
  const bytes = encodeBytes(text);
  const spec = chooseSpec(bytes.length);
  const { size, version } = spec;
  const modules = new Array<boolean>(size * size).fill(false);
  const reserved = new Array<boolean>(size * size).fill(false);

  const set = (r: number, c: number, dark: boolean, isFunc = true) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r * size + c] = dark;
    if (isFunc) reserved[r * size + c] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const border = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        set(r, c, inOuter && (border || core));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment patterns (v2+)
  for (const r of spec.alignments) {
    for (const c of spec.alignments) {
      if (reserved[r * size + c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          set(r + dr, c + dc, dark);
        }
      }
    }
  }

  // Dark module & reserve format info strips
  set(size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!reserved[8 * size + i]) reserved[8 * size + i] = true;
    if (!reserved[i * size + 8]) reserved[i * size + 8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8 * size + (size - 1 - i)] = true;
    reserved[(size - 1 - i) * size + 8] = true;
  }

  // Version info blocks (v7+)
  const vBits = VERSION_INFO[version];
  if (vBits !== undefined) {
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      set(r, c, bit);
      set(c, r, bit);
    }
  }

  // Place interleaved codewords with Mask 0: (r + c) % 2 === 0
  const codewords = buildCodewords(bytes, spec);
  let bitIdx = 0;
  const totalDataBits = codewords.length * 8;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip vertical timing column
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let colOff = 0; colOff < 2; colOff++) {
        const c = right - colOff;
        if (reserved[r * size + c]) continue;
        let bit = false;
        if (bitIdx < totalDataBits) {
          const byte = codewords[bitIdx >> 3]!;
          bit = ((byte >> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        const masked = (r + c) % 2 === 0 ? !bit : bit;
        modules[r * size + c] = masked;
      }
    }
    upward = !upward;
  }

  // Write Format Information (ECC L, Mask 0)
  const fmt = FORMAT_L_MASK0;
  for (let i = 0; i <= 5; i++) set(8, i, ((fmt >> (14 - i)) & 1) === 1);
  set(8, 7, ((fmt >> 8) & 1) === 1);
  set(8, 8, ((fmt >> 7) & 1) === 1);
  set(7, 8, ((fmt >> 6) & 1) === 1);
  for (let i = 9; i < 15; i++) set(14 - i, 8, ((fmt >> (14 - i)) & 1) === 1);

  for (let i = 0; i < 7; i++) set(size - 1 - i, 8, ((fmt >> (14 - i)) & 1) === 1);
  for (let i = 7; i < 15; i++) set(8, size - 15 + i, ((fmt >> (14 - i)) & 1) === 1);

  return { version, size, modules };
}
