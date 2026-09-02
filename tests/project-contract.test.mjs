import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(
  new URL("../app/puzzle-game.tsx", import.meta.url),
);
const source = await readFile(sourcePath, "utf8");

test("keeps the fixed 1200 by 800 frame contract", () => {
  assert.match(source, /const FRAME_WIDTH = 1200;/);
  assert.match(source, /const FRAME_HEIGHT = 800;/);
});

test("keeps exactly the confirmed 4-piece and 12-piece levels", () => {
  assert.match(source, /\{ rows: 2, columns: 2, count: 4 \}/);
  assert.match(source, /\{ rows: 3, columns: 4, count: 12 \}/);
});

test("keeps the gallery device-local", () => {
  assert.match(source, /indexedDB\.open/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});
