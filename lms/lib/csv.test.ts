import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "./csv.ts";

test("toCsv quotes, escapes and defuses formulas", () => {
  assert.equal(
    toCsv([["a", 1.5], ['say "hi", ok', "=SUM(A1)"], ["-5", -5]]),
    'a,1.5\r\n"say ""hi"", ok",\'=SUM(A1)\r\n\'-5,-5\r\n',
  );
});
