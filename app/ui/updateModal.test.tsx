import { expect, open, test } from "nsh/test";

test("UpdateModal displays merged release notes globally and dismisses on button press", async () => {
  const app = await open("./updateModalFixture.tsx");
  await app.press("Trigger Update");
  await app.waitFor("发现新版本 v0.0.25");

  expect(app.texts().some((t) => t.includes("增量热更"))).toBe(true);
  expect(app.texts().some((t) => t.includes("立即更新并重启"))).toBe(true);
  expect(
    app.texts().some((t) =>
      t.includes("Fix sidebar traffic-light overlap and add macOS app icon"),
    ),
  ).toBe(true);
  expect(
    app.texts().some((t) =>
      t.includes("Fix macOS bundle CLI overwrite and version injection"),
    ),
  ).toBe(true);
  expect(
    app.texts().some((t) =>
      t.includes("Universal keyboard navigation and cheat sheet modal"),
    ),
  ).toBe(true);

  await app.press("稍后再说");
  await app.waitFor("Modal Closed");
  expect(app.texts().some((t) => t.includes("Modal Closed"))).toBe(true);
});
