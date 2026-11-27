import { expect, test } from "nsh/test";
import { themeForAccent } from "./accent";

test("green accent recolors buttons and links and keeps the rest of the theme", () => {
  const theme = themeForAccent("green");
  expect(theme.cssVars.light?.primary).toBe("#34C759");
  expect(theme.cssVars.light?.tint).toBe("#34C759");
  expect(theme.cssVars.light?.ring).toBe("#34C759");
  expect(theme.cssVars.light?.["tint-soft"]).toBe("#E5F8EB");
  expect(theme.cssVars.dark?.primary).toBe("#30D158");
  expect(theme.cssVars.dark?.tint).toBe("#30D158");
  expect(theme.cssVars.light?.background).toBe("#f2f2f7");
  expect(theme.cssVars.light?.["primary-foreground"]).toBe("#ffffff");
});
