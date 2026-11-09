import { expect, open, test } from "nsh/test";

test("shows Ear shell", async () => {
  const app = await open("./App.tsx");
  expect(app.texts().some((t) => t.includes("Ear"))).toBe(true);
  expect(app.texts().some((t) => t.includes("Parse"))).toBe(true);
});
