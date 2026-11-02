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
