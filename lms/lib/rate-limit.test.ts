import { test } from "node:test";
import assert from "node:assert/strict";
import { clearLimit, limited } from "./rate-limit.ts";

test("limited allows max attempts in the window, then blocks until it passes", () => {
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(limited("k", 5, 60_000, t + i), false);
  assert.equal(limited("k", 5, 60_000, t + 10), true);
  assert.equal(limited("k", 5, 60_000, t + 61_000), false); // old attempts expired
  assert.equal(limited("other", 5, 60_000, t), false); // keys are separate
  clearLimit("k");
  assert.equal(limited("k", 1, 60_000, t), false);
});
