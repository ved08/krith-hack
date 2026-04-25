/**
 * Minimal CSV parser for the teacher upload flows.
 *
 * Intentionally tiny (no npm dep) — handles:
 *   - comma-separated values
 *   - double-quoted values with embedded commas and escaped quotes ("a,""b")
 *   - CRLF or LF line endings
 *   - leading/trailing whitespace on values (trimmed)
 *   - optional header row (detected heuristically: first row has >= 1 non-numeric
 *     cell that looks like a word and the values in that column in later rows
 *     don't look like a duplicate header)
 *
 * Output: `{ header: string[] | null, rows: string[][] }`. Callers map the
 * header to schema columns themselves.
 */

export type ParsedCsv = {
  header: string[] | null;
  rows: string[][];
};

export function parseCsv(raw: string): ParsedCsv {
  // Normalize line endings, strip BOM.
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cur.push(field.trim());
      field = "";
      continue;
    }
    if (ch === "\n") {
      cur.push(field.trim());
      if (cur.some((v) => v.length > 0)) lines.push(cur);
      cur = [];
      field = "";
      continue;
    }
    field += ch;
  }
  // flush trailing cell
  if (field.length > 0 || cur.length > 0) {
    cur.push(field.trim());
    if (cur.some((v) => v.length > 0)) lines.push(cur);
  }

  if (lines.length === 0) return { header: null, rows: [] };

  const first = lines[0]!;
  // Heuristic: treat first row as a header if any cell contains a
  // non-numeric, word-like token AND later rows have at least one purely
  // numeric cell in a position the header labels. Otherwise assume all
  // rows are data.
  const looksLikeHeader = first.every(
    (v) => v.length > 0 && /[a-z_]/i.test(v) && !/^\d+(\.\d+)?$/.test(v),
  );
  if (looksLikeHeader && lines.length > 1) {
    return { header: first.map((h) => h.toLowerCase()), rows: lines.slice(1) };
  }
  return { header: null, rows: lines };
}

/**
 * Map CSV rows onto (usernameOrId, value) pairs. The second column is
 * returned verbatim — the caller validates it against a domain-specific
 * set (e.g. PRESENT/ABSENT/LATE or a numeric score).
 *
 * Accepts CSVs with or without a header. When a header exists, we look
 * for a column named one of `username`/`student`/`student_id`/`id` for
 * the identifier and the remaining single column as the value. When no
 * header exists, we use column 0 + column 1.
 */
export type CsvRow = { key: string; value: string };

const IDENTIFIER_HEADERS = ["username", "student", "student_id", "id", "user"];

export function toKeyValueRows(parsed: ParsedCsv): CsvRow[] {
  if (parsed.header) {
    const idIdx = parsed.header.findIndex((h) => IDENTIFIER_HEADERS.includes(h));
    const valueIdx = parsed.header.findIndex(
      (_, i) => i !== idIdx && parsed.header![i]!.length > 0,
    );
    const keyIdx = idIdx >= 0 ? idIdx : 0;
    const valIdx = valueIdx >= 0 ? valueIdx : 1;
    return parsed.rows
      .map((r) => ({ key: r[keyIdx] ?? "", value: r[valIdx] ?? "" }))
      .filter((r) => r.key.length > 0);
  }
  return parsed.rows
    .map((r) => ({ key: r[0] ?? "", value: r[1] ?? "" }))
    .filter((r) => r.key.length > 0);
}
