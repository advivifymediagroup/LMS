import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "./csv.ts";

test("toCsv quotes, escapes and defuses formulas", () => {
  assert.equal(
    toCsv([["a", 1.5], ['say "hi", ok', "=SUM(A1)"], ["-5", -5]]),
    'a,1.5\r\n"say ""hi"", ok",\'=SUM(A1)\r\n\'-5,-5\r\n',
  );
});

test("parseCsv reads quotes, CRLF, BOM, Excel's ; separator, and round-trips toCsv", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, ""y""",2\r\n\r\n,\n"multi\nline",3'), [["a", "b"], ['x, "y"', "2"], ["multi\nline", "3"]]);
  assert.deepEqual(parseCsv("Month;Client\n2026-11;Acme"), [["Month", "Client"], ["2026-11", "Acme"]]);
  const rows = [["a", "1,5"], ["b\"c", "d"]];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});
