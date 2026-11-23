import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const TABLES = ["operation_board_items", "operation_board_checklist_items"];
export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}
export function stableJson(value) { return JSON.stringify(stableValue(value)); }
export function sha256(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex"); }
export function projectRef(url) { try { return new URL(url).hostname.split(".")[0] || ""; } catch { return ""; } }
export function credentials() {
  const url = process.env.BANQUET_SUPABASE_URL || ""; const key = process.env.BANQUET_SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("BANQUET_SUPABASE_URL / BANQUET_SUPABASE_ANON_KEY 환경변수가 필요합니다.");
  return { url: url.replace(/\/$/, ""), key };
}
export function assertWriteApproval({ url, allowProjectRef, confirm, phrase }) {
  const actual = projectRef(url);
  if (!allowProjectRef || actual !== allowProjectRef) throw new Error(`project ref 확인 실패: actual=${actual || "unknown"}`);
  if (confirm !== phrase) throw new Error(`쓰기 실행에는 --confirm ${phrase}가 필요합니다.`);
}
export async function request(config, resource, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${resource}`, { ...options, headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${resource.split("?")[0]} failed: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
export async function readAll(config, table) {
  const result = []; const limit = 1000;
  for (let offset = 0; ; offset += limit) { const page = await request(config, `${table}?select=*&order=id.asc&limit=${limit}&offset=${offset}`); result.push(...page); if (page.length < limit) break; }
  return result;
}
export function tableSnapshot(rows) {
  const sorted = [...rows].sort((a, b) => String(a.id || a.item_key).localeCompare(String(b.id || b.item_key)));
  return { rows: sorted, rowChecksums: Object.fromEntries(sorted.map((row) => [String(row.id || row.item_key), sha256(row)])), checksum: sha256(sorted) };
}
export async function writeSnapshot(outputDir, snapshots, metadata = {}) {
  await fs.mkdir(outputDir, { recursive: true }); const manifest = { format: "banquet-operation-board-snapshot-v1", createdAt: new Date().toISOString(), ...metadata, tables: {} };
  for (const [table, snapshot] of Object.entries(snapshots)) { await fs.writeFile(path.join(outputDir, `${table}.json`), `${JSON.stringify(snapshot.rows, null, 2)}\n`, "utf8"); manifest.tables[table] = { rows: snapshot.rows.length, checksum: snapshot.checksum, rowChecksums: snapshot.rowChecksums }; }
  await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); return manifest;
}
export function parseArgs(argv) { const result = {}; for (let index = 0; index < argv.length; index += 1) { const token = argv[index]; if (!token.startsWith("--")) continue; const key = token.slice(2); const next = argv[index + 1]; if (!next || next.startsWith("--")) result[key] = true; else { result[key] = next; index += 1; } } return result; }
