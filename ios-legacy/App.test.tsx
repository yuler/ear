import { expect, open, test } from "nsh/test";
import nshConfig from "./nsh.json";

test("renders iOS onboarding home state, opens Settings via iOS headerRightItems, and opens fallback Pair sheet", async () => {
  const app = await open("./App.tsx", { platform: "ios" });
  expect(app.texts().some((t) => t.includes("Ear"))).toBe(true);
  expect(app.texts().some((t) => t.includes("连接电脑"))).toBe(true);
  expect(app.texts().some((t) => t.includes("扫码配对"))).toBe(true);

  // Open Pair modal fallback (scanner unavailable headless) & switch tabs
  await app.press("扫码配对");
  await app.waitFor("扫描电脑上的配对二维码");
  expect(app.texts().some((t) => t.includes("从剪贴板粘贴配对链接"))).toBe(true);

  await app.press("手动配对码");
  await app.waitFor("电脑局域网地址");
  expect(app.texts().some((t) => t.includes("4 位配对码"))).toBe(true);

  await app.press("取消");
  await app.waitFor("连接电脑");

  // Open Settings sheet via the headerRight settings button (distinct from desktop header)
  await app.press("id:header-settings");
  await app.waitFor("外观与语言");
  await app.waitFor("主颜色");
  await app.waitFor("版本 v0.0.0");
  expect(app.texts().some((t) => t.includes("后台同步"))).toBe(true);
  expect(app.texts().some((t) => t.includes("已配对的电脑"))).toBe(true);

  await app.press("English");
  await app.waitFor("APPEARANCE & LANGUAGE");
  expect(app.texts().some((t) => t.includes("Background Sync"))).toBe(true);
  for (const label of ["Blue", "Green", "Orange", "Purple", "Red"]) {
    expect(app.texts().includes(label)).toBe(true);
  }

  await app.press("Done");
  await app.waitFor("Connect a Computer");
  expect(app.texts().some((t) => t.includes("Scan QR to Pair"))).toBe(true);
});

test("camera permission denied shows Open Settings recovery and manual fallback", async () => {
  let openedSettings = 0;
  const app = await open("./App.tsx", {
    platform: "ios",
    modules: {
      "ear-scanner": {
        "QrScanner.available": () => true,
        "QrScanner.permission": () => "denied",
        "QrScanner.scan": () => ({ status: "denied", value: null }),
      },
      "nsh/mobile": {
        "AppSettings.available": () => true,
        "AppSettings.open": () => {
          openedSettings += 1;
          return { opened: true };
        },
      },
    },
  });

  await app.press("扫码配对");
  await app.waitFor("需要相机权限才能扫码");
  await app.press("去设置开启");
  expect(openedSettings).toBe(1);

  await app.press("无法扫码？手动输入配对码");
  await app.waitFor("电脑局域网地址");
  expect(app.texts().some((t) => t.includes("4 位配对码"))).toBe(true);
});

test("in-app QR scan auto-pairs immediately while external ear:// deep link stops at confirm step", async () => {
  const pairUrl = "ear://pair?transport=lan&host=192.168.1.42&port=32783&code=4821&name=Studio+Mac";
  let pairRequests = 0;

  const scannedApp = await open("./App.tsx", {
    platform: "ios",
    network: {
      "POST http://192.168.1.42:32783/v1/pair": () => {
        pairRequests += 1;
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            serverId: "mac-studio",
            serverName: "Studio Mac",
            shortName: "Studio",
            deviceId: "iphone-1",
            token: "tok-1234567890abcdef",
            transport: "lan",
          }),
        };
      },
      "GET http://192.168.1.42:32783/v1/library": {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverId: "mac-studio",
          serverName: "Studio Mac",
          shortName: "Studio",
          items: [],
        }),
      },
      "POST http://192.168.1.42:32783/v1/device/status": {
        status: 200,
        body: "{}",
      },
    },
    modules: {
      "ear-scanner": {
        "QrScanner.available": () => true,
        "QrScanner.permission": () => "authorized",
        "QrScanner.scan": () => ({ status: "scanned", value: pairUrl }),
      },
    },
  });

  await scannedApp.press("扫码配对");
  await scannedApp.waitFor("已与「Studio Mac」配对");
  expect(pairRequests).toBe(1);

  // External ear:// deep link must still pause on confirmation (never auto-submit)
  let deepLinkPairRequests = 0;
  const deepLinkApp = await open("./App.tsx", {
    platform: "ios",
    urlScheme: pairUrl,
    network: {
      "POST http://192.168.1.42:32783/v1/pair": () => {
        deepLinkPairRequests += 1;
        return { status: 200, body: "{}" };
      },
    },
  });

  await deepLinkApp.waitFor("请核对电脑地址后确认配对");
  expect(deepLinkPairRequests).toBe(0);
});

test("scanner manual button jumps straight to manual pairing code tab", async () => {
  const app = await open("./App.tsx", {
    platform: "ios",
    modules: {
      "ear-scanner": {
        "QrScanner.available": () => true,
        "QrScanner.permission": () => "authorized",
        "QrScanner.scan": () => ({ status: "manual", value: null }),
      },
    },
  });

  await app.press("扫码配对");
  await app.waitFor("电脑局域网地址");
  expect(app.texts().some((t) => t.includes("4 位配对码"))).toBe(true);
});

test("ios/nsh.json declares camera + local network permissions, app settings capability, ear:// scheme, and ear-scanner", () => {
  expect(nshConfig.id).toBe("dev.yuler.ear");
  expect(nshConfig.appearance).toBe("system");
  expect(nshConfig.schemes).toEqual(["ear"]);
  expect(nshConfig.capabilities.application).toBe(true);
  expect(nshConfig.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  expect(nshConfig.ios.infoPlist.NSCameraUsageDescription.length).toBeGreaterThan(10);
  expect(nshConfig.ios.infoPlist.NSLocalNetworkUsageDescription.length).toBeGreaterThan(10);
  expect(nshConfig.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking).toBe(true);
  expect(nshConfig.dependencies["ear-scanner"].path).toBe("ext/ear-scanner");
});

test("QR scan failures show clear contextual errors and diagnostic metadata at top of Pair modal", async () => {
  // 1. Scanning a non-Ear QR code shows invalid QR error
  const invalidQrApp = await open("./App.tsx", {
    platform: "ios",
    modules: {
      "ear-scanner": {
        "QrScanner.available": () => true,
        "QrScanner.permission": () => "authorized",
        "QrScanner.scan": () => ({ status: "scanned", value: "https://example.com/not-ear" }),
      },
    },
  });
  await invalidQrApp.press("扫码配对");
  await invalidQrApp.waitFor("这不是有效的 Ear 配对二维码，请扫描电脑「设置 → 手机镜像」中的二维码。");
  expect(invalidQrApp.texts().some((t) => t.includes("not_ear_url"))).toBe(true);

  // 2. Scanning an expired/mismatched Ear QR code prompts to re-scan refreshed QR
  const pairUrl = "ear://pair?transport=lan&host=192.168.1.42&port=32783&code=4821";
  const expiredQrApp = await open("./App.tsx", {
    platform: "ios",
    network: {
      "POST http://192.168.1.42:32783/v1/pair": {
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "code_expired" }),
      },
    },
    modules: {
      "ear-scanner": {
        "QrScanner.available": () => true,
        "QrScanner.permission": () => "authorized",
        "QrScanner.scan": () => ({ status: "scanned", value: pairUrl }),
      },
    },
  });
  await expiredQrApp.press("扫码配对");
  await expiredQrApp.waitFor("二维码里的配对码已过期或已刷新，请直接重新扫描电脑屏幕上最新的二维码。");
  expect(expiredQrApp.texts().some((t) => t.includes("192.168.1.42:32783"))).toBe(true);
});

test("Settings shows Offline Storage section and tapping an offline video opens Detail Player + File Info", async () => {
  const storageState = JSON.stringify({
    settings: { appearance: "system", accent: "blue", language: "zh", backgroundSync: true },
    macs: [],
    catalogs: {},
    localItems: {
      "vid-demo": {
        videoId: "vid-demo",
        state: "ready",
        title: "Offline Listening Demo",
        thumbnailUrl: "",
        durationMs: 120_000,
        sizeBytes: 7 * 1024 * 1024,
        contentSha256: "a".repeat(64),
        downloadedBytes: 7 * 1024 * 1024,
        chunkSize: 4 * 1024 * 1024,
        completedChunks: 2,
        totalChunks: 2,
        mediaExt: "mp4",
        mimeType: "video/mp4",
        hasCaptions: true,
        localPath: "/sandbox/mirror/vid-demo/media.mp4",
        captionsPath: "/sandbox/mirror/vid-demo/captions.json",
        sourceMacId: "mac-1",
        sourceShortName: "yule-omarchy",
        updatedAt: 2000,
      },
    },
  });

  const app = await open("./App.tsx", {
    platform: "ios",
    storage: { "ear.ios.mirror.v1": storageState },
  });

  await app.waitFor("Offline Listening Demo");

  // Open Settings and verify Offline Storage section
  await app.press("id:header-settings");
  await app.waitFor("本地离线存储");
  expect(app.texts().some((t) => t.includes("1 个视频 · 7 MB"))).toBe(true);
  await app.press("完成");
  await app.waitFor("Offline Listening Demo");

  // Tap offline video -> opens Detail Player
  await app.press("Offline Listening Demo");
  await app.waitFor("单句停");
  expect(app.texts().some((t) => t.includes("遮挡条"))).toBe(true);

  // Open Video File Info sheet
  await app.press("id:detail-info");
  await app.waitFor("视频与文件信息");
  expect(app.texts().some((t) => t.includes("media.mp4"))).toBe(true);
  expect(app.texts().some((t) => t.includes("captions.json"))).toBe(true);
});
