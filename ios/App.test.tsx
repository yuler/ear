import { expect, open, test } from "nsh/test";
import nshConfig from "./nsh.json";

test("renders iOS onboarding home state and opens Pair and Settings sheets", async () => {
  const app = await open("./App.tsx");
  expect(app.texts().some((t) => t.includes("Ear"))).toBe(true);
  expect(app.texts().some((t) => t.includes("连接电脑"))).toBe(true);
  expect(app.texts().some((t) => t.includes("配对电脑"))).toBe(true);

  // Open Pair modal & switch between QR Link and Manual 4-digit Code tabs
  await app.press("配对电脑");
  await app.waitFor("用 iPhone 相机扫码最快");
  expect(app.texts().some((t) => t.includes("从剪贴板粘贴配对链接"))).toBe(true);

  await app.press("手动配对码");
  await app.waitFor("电脑局域网地址");
  expect(app.texts().some((t) => t.includes("4 位配对码"))).toBe(true);

  await app.press("取消");
  await app.waitFor("连接电脑");

  // Open Settings sheet and toggle language zh -> English
  await app.press("⚙");
  await app.waitFor("外观与语言");
  expect(app.texts().some((t) => t.includes("后台同步"))).toBe(true);
  expect(app.texts().some((t) => t.includes("已配对的电脑"))).toBe(true);

  await app.press("English");
  await app.waitFor("APPEARANCE & LANGUAGE");
  expect(app.texts().some((t) => t.includes("Background Sync"))).toBe(true);

  await app.press("Done");
  await app.waitFor("Connect a Computer");
  expect(app.texts().some((t) => t.includes("Pair Computer"))).toBe(true);
});

test("ios/nsh.json declares Local Network permission, export compliance, ATS local networking, and ear:// scheme", () => {
  expect(nshConfig.id).toBe("dev.yuler.ear");
  expect(nshConfig.appearance).toBe("system");
  expect(nshConfig.schemes).toEqual(["ear"]);
  expect(nshConfig.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  expect(nshConfig.ios.infoPlist.NSLocalNetworkUsageDescription.length).toBeGreaterThan(10);
  expect(nshConfig.ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking).toBe(true);
});
