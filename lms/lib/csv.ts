// Pure, no imports, so it runs under `node --test`.
/** RFC 4180 CSV. Cells starting with = + - @ get a leading ' so spreadsheets don't run them as formulas. */
export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/**
 * RFC 4180 CSV to rows. Strips a UTF-8 BOM, drops blank lines, and accepts the ; or tab
 * separators that Excel uses in some regional settings (picked from the header line).
 */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const head = text.slice(0, text.search(/\r?\n|$/));
  const count = (c: string) => head.split(c).length;
  const sep = [",", ";", "\t"].reduce((a, b) => (count(b) > count(a) ? b : a));
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
