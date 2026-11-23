import fs from "node:fs/promises";
import path from "node:path";
import { assertWriteApproval, credentials, parseArgs, request, sha256, stableValue } from "./operation-board-safety-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log("Usage: node scripts/restore-operation-board-item.mjs --snapshot <dir> --item-key <key> [--execute --allow-project-ref <ref> --expected-current-sha <sha|missing> --confirm V32_PARTIAL_RESTORE --delete-if-absent]\nDefault is GET-only dry-run. Never truncates a table."); process.exit(0); }
if (!args.snapshot || !args["item-key"]) throw new Error("--snapshot 및 --item-key가 필요합니다.");
const config = credentials(); const itemKey = String(args["item-key"]); const dir = path.resolve(args.snapshot);
const backupItems = JSON.parse(await fs.readFile(path.join(dir, "operation_board_items.json"), "utf8"));
const backupChecklist = JSON.parse(await fs.readFile(path.join(dir, "operation_board_checklist_items.json"), "utf8"));
const backupItem = backupItems.find((row) => row.item_key === itemKey) || null; const backupChildren = backupChecklist.filter((row) => row.parent_item_key === itemKey);
const currentItems = await request(config, `operation_board_items?select=*&item_key=eq.${encodeURIComponent(itemKey)}`); const currentItem = currentItems[0] || null;
const currentChildren = await request(config, `operation_board_checklist_items?select=*&parent_item_key=eq.${encodeURIComponent(itemKey)}&order=id.asc`);
const currentSha = currentItem ? sha256({ item: stableValue(currentItem), checklist: stableValue(currentChildren) }) : "missing";
const plan = { itemKey, currentSha, backupItem: !!backupItem, backupChecklistRows: backupChildren.length, action: backupItem ? "restore-one-item" : args["delete-if-absent"] ? "delete-canary-if-safe" : "none", execute: !!args.execute };
console.log(JSON.stringify(plan, null, 2));
if (!args.execute) process.exit(0);
assertWriteApproval({ url: config.url, allowProjectRef: args["allow-project-ref"], confirm: args.confirm, phrase: "V32_PARTIAL_RESTORE" });
if (!args["expected-current-sha"] || args["expected-current-sha"] !== currentSha) throw new Error("현재 row가 dry-run 이후 변경되었습니다. 새 dry-run과 승인 없이 복구하지 않습니다.");
if (backupItem) {
  await request(config, "operation_board_items?on_conflict=board_date,item_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(backupItem) });
  for (const child of backupChildren) await request(config, "operation_board_checklist_items?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(child) });
  const backupIds = new Set(backupChildren.map((row) => row.id));
  for (const child of currentChildren.filter((row) => !backupIds.has(row.id))) await request(config, `operation_board_checklist_items?id=eq.${encodeURIComponent(child.id)}&parent_item_key=eq.${encodeURIComponent(itemKey)}`, { method: "DELETE" });
} else {
  if (!args["delete-if-absent"]) throw new Error("백업에 item이 없습니다. --delete-if-absent 없이 삭제하지 않습니다.");
  if (currentItem && (currentItem.metadata?.source !== "v32_canary" || !currentItem.metadata?.canaryRunId)) throw new Error("V3.2 canary가 아닌 row는 삭제하지 않습니다.");
  for (const child of currentChildren) await request(config, `operation_board_checklist_items?id=eq.${encodeURIComponent(child.id)}&parent_item_key=eq.${encodeURIComponent(itemKey)}`, { method: "DELETE" });
  if (currentItem) await request(config, `operation_board_items?id=eq.${encodeURIComponent(currentItem.id)}&item_key=eq.${encodeURIComponent(itemKey)}`, { method: "DELETE" });
}
console.log("부분 복구 완료");
