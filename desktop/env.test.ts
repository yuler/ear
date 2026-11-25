import { expect, test } from "nsh/test";
import { isDevMode, resolveDataDir, resolveDataDirOrNull } from "./env";

test("isDevMode defaults to true for local 0.0.0 version and honors EAR_ENV", () => {
  expect(isDevMode({})).toBe(true);
  expect(isDevMode({ EAR_ENV: "prod" })).toBe(false);
  expect(isDevMode({ EAR_ENV: "dev" })).toBe(true);
});

test("resolveDataDir isolates dev under <dataDir>/dev and honors EAR_DATA_DIR", () => {
  expect(resolveDataDir("/tmp/ear-test-data", { EAR_ENV: "dev" })).toBe(
    "/tmp/ear-test-data/dev",
  );
  expect(resolveDataDir("/tmp/ear-test-data", { EAR_ENV: "prod" })).toBe(
    "/tmp/ear-test-data",
  );
  expect(
    resolveDataDir("/tmp/ear-test-data", {
      EAR_ENV: "dev",
      EAR_DATA_DIR: "/tmp/ear-custom-prod",
    }),
  ).toBe("/tmp/ear-custom-prod");

  expect(resolveDataDirOrNull(undefined, {})).toBe(null);
});
