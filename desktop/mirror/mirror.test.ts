import { expect, test } from "nsh/test";
import { encodeQr } from "./qr";
import { parseServeEventLine } from "./service";

test("encodeQr produces valid QR matrix with finder patterns for ear://pair URLs", () => {
  const url = "ear://pair?transport=lan&host=192.168.1.42&port=7890&code=4821&name=Home%20Mac";
  const qr = encodeQr(url);
  expect(qr.version).toBeGreaterThanOrEqual(4);
  expect(qr.size).toBe(17 + qr.version * 4);
  expect(qr.modules.length).toBe(qr.size * qr.size);

  const at = (r: number, c: number) => qr.modules[r * qr.size + c];
  // Top-left 7x7 finder outer border & center 3x3 dark core
  expect(at(0, 0)).toBe(true);
  expect(at(0, 6)).toBe(true);
  expect(at(6, 0)).toBe(true);
  expect(at(3, 3)).toBe(true);
  expect(at(1, 1)).toBe(false);
  // Top-right & bottom-left finder centers
  expect(at(3, qr.size - 4)).toBe(true);
  expect(at(qr.size - 4, 3)).toBe(true);
  // Dark module at (size - 8, 8)
  expect(at(qr.size - 8, 8)).toBe(true);
});

test("parseServeEventLine parses ready, state, and error NDJSON lines", () => {
  const ready = parseServeEventLine(
    JSON.stringify({
      v: 1,
      type: "ready",
      state: {
        serverId: "srv-1",
        serverName: "Home Mac",
        shortName: "Home",
        host: "192.168.1.10",
        port: 7890,
        code: "1234",
        codeExpiresAt: 1700000120,
        pairUrl: "ear://pair?transport=lan&host=192.168.1.10&port=7890&code=1234",
        libraryCount: 3,
        devices: [],
      },
    }),
  );
  expect(ready?.type).toBe("ready");
  if (ready?.type === "ready") {
    expect(ready.state.code).toBe("1234");
    expect(ready.state.libraryCount).toBe(3);
  }

  const err = parseServeEventLine(JSON.stringify({ type: "error", message: "port busy" }));
  expect(err?.type).toBe("error");
  expect(parseServeEventLine("plain log line")).toBe(null);
});
