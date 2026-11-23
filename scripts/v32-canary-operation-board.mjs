import crypto from "node:crypto";
import path from "node:path";
import { TABLES, assertWriteApproval, credentials, parseArgs, projectRef, readAll, request, sha256, tableSnapshot, writeSnapshot } from "./operation-board-safety-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log("Usage: node scripts/v32-canary-operation-board.mjs [--execute --allow-project-ref <ref> --confirm V32_CANARY_WRITE]\nDefault prints a no-write plan. Execute creates one tagged canary, verifies updates, and deletes only that row."); process.exit(0); }
if (!args.execute) { console.log(JSON.stringify({ mode: "dry-run", writes: 0, required: ["--execute", "--allow-project-ref <exact ref>", "--confirm V32_CANARY_WRITE", "BANQUET_SUPABASE_URL", "BANQUET_SUPABASE_ANON_KEY"], target: { boardDate: "2099-12-31", itemKeyPrefix: "v32-canary:", eventOrderId: null } }, null, 2)); process.exit(0); }

const config = credentials(); assertWriteApproval({ url: config.url, allowProjectRef: args["allow-project-ref"], confirm: args.confirm, phrase: "V32_CANARY_WRITE" });
const runId = crypto.randomUUID(); const itemKey = `v32-canary:${runId}`; const boardDate = "2099-12-31"; const output = path.resolve(`backups/v32-canary-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const beforeSnapshots = {}; for (const table of TABLES) beforeSnapshots[table] = tableSnapshot(await readAll(config, table));
await writeSnapshot(output, beforeSnapshots, { projectRef: projectRef(config.url), canaryRunId: runId, itemKey, readOnly: true });
const initial = { board_date: boardDate, item_key: itemKey, item_kind: "manual", event_order_id: null, space_id: null, item_time: "09:00", venue_name: "V3.2 검증용", title: "V3.2 canary", people: null, memo: "V3.2 canary memo", is_completed: true, metadata: { source: "v32_canary", recordType: "v32_canary", taskType: "next_setup", canaryRunId: runId, pinned: true, setupOverride: { scheduledDate: "2099-12-31", scheduledTime: "09:00", color: "#2563EB" } } };
let created = false;
async function readCanary() { return (await request(config, `operation_board_items?select=*&board_date=eq.${boardDate}&item_key=eq.${encodeURIComponent(itemKey)}`))[0] || null; }
async function cleanup() { const row = await readCanary(); if (!row) return; if (row.metadata?.source !== "v32_canary" || row.metadata?.canaryRunId !== runId) throw new Error("canary identity가 달라 자동 삭제를 중단했습니다."); await request(config, `operation_board_items?id=eq.${encodeURIComponent(row.id)}&item_key=eq.${encodeURIComponent(itemKey)}`, { method: "DELETE" }); }
try {
  await request(config, "operation_board_items?on_conflict=board_date,item_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(initial) }); created = true;
  let row = await readCanary(); if (!row || row.memo !== initial.memo || !row.is_completed || !row.metadata?.pinned) throw new Error("canary 초기 저장 검증 실패");
  const updatedMetadata = { ...row.metadata, setupOverride: { ...row.metadata.setupOverride, scheduledDate: "2099-12-30", scheduledEndDate: "2099-12-31", turnoverDecision: "confirmed", timelineSegments: [{ id: "a", label: "반입" }, { id: "b", label: "배치" }], sortOrder: 2, color: "#FF6600" } };
  await request(config, `operation_board_items?id=eq.${encodeURIComponent(row.id)}&item_key=eq.${encodeURIComponent(itemKey)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ metadata: updatedMetadata }) });
  row = await readCanary(); const override = row?.metadata?.setupOverride || {}; if (override.scheduledEndDate !== "2099-12-31" || override.turnoverDecision !== "confirmed" || override.timelineSegments?.length !== 2 || override.sortOrder !== 2 || override.color !== "#FF6600") throw new Error("canary 계획 필드 저장 검증 실패");
  if (row.memo !== initial.memo || !row.is_completed || !row.metadata?.pinned) throw new Error("기존 완료/고정/메모가 손상되었습니다.");
  const mergedMetadata = { ...row.metadata, setupOverride: { ...override, turnoverDecision: "dismissed", timelineSegments: override.timelineSegments.slice(0, 1) } };
  await request(config, `operation_board_items?id=eq.${encodeURIComponent(row.id)}&item_key=eq.${encodeURIComponent(itemKey)}`, { method: "PATCH", body: JSON.stringify({ metadata: mergedMetadata }) });
  row = await readCanary(); if (row.metadata.setupOverride.turnoverDecision !== "dismissed" || row.metadata.setupOverride.timelineSegments.length !== 1) throw new Error("canary 해제/병합 검증 실패");
  await cleanup(); created = false; if (await readCanary()) throw new Error("canary 삭제 검증 실패");
  const afterItems = await readAll(config, "operation_board_items"); const afterChecklist = await readAll(config, "operation_board_checklist_items");
  const beforeItemMap = new Map(beforeSnapshots.operation_board_items.rows.map((item) => [item.id, sha256(item)])); const afterItemMap = new Map(afterItems.map((item) => [item.id, sha256(item)]));
  const concurrentItemChanges = [...new Set([...beforeItemMap.keys(), ...afterItemMap.keys()])].filter((id) => beforeItemMap.get(id) !== afterItemMap.get(id));
  const beforeChecklistMap = new Map(beforeSnapshots.operation_board_checklist_items.rows.map((item) => [item.id, sha256(item)])); const afterChecklistMap = new Map(afterChecklist.map((item) => [item.id, sha256(item)]));
  const concurrentChecklistChanges = [...new Set([...beforeChecklistMap.keys(), ...afterChecklistMap.keys()])].filter((id) => beforeChecklistMap.get(id) !== afterChecklistMap.get(id));
  console.log(JSON.stringify({ passed: true, itemKey, backup: output, canaryRemaining: false, concurrentChanges: { operationBoardItems: concurrentItemChanges, checklistItems: concurrentChecklistChanges }, note: "canary 이외 차이는 다른 사용자의 동시 변경으로 보고하며 자동 복구하지 않습니다." }, null, 2));
} catch (error) {
  if (created) await cleanup().catch((cleanupError) => console.error("CANARY CLEANUP FAILED", cleanupError.message));
  throw error;
}
