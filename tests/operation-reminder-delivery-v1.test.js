const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const boardSource = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const pushSource = fs.readFileSync("outputs/src/pushNotifications.js", "utf8");
const serviceWorker = fs.readFileSync("outputs/push-sw.js", "utf8");
const sender = fs.readFileSync("supabase/functions/send-operation-push/index.ts", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const context = {
  window: {}, localStorage: { getItem: () => null, setItem: () => {} }, sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null }, crypto: { randomUUID: () => "test" }, console, Date, Set, Map,
};
vm.createContext(context);
vm.runInContext(boardSource, context);
const trigger = context.window.BANQUET_ERP_OPERATION_BOARD.reminderTriggerAt({ date: "2026-10-16", time: "13:00" }, 30);
assert.strictEqual(trigger.toISOString(), "2026-10-16T03:30:00.000Z", "13:00 KST의 30분 전은 12:30 KST여야 한다");
assert.strictEqual(context.window.BANQUET_ERP_OPERATION_BOARD.reminderTriggerAt({ date: "2026-10-16", time: "" }, 30), null, "시간 미정은 예약하지 않아야 한다");
assert(boardSource.includes("await window.BANQUET_ERP_PUSH_NOTIFICATIONS?.ensureEnabled()"), "설정 시 권한과 구독을 보장해야 한다");
assert(boardSource.includes("await Promise.all(allBlocks().map((item) => syncItem(item)))"), "기본 알림 변경은 기존 원격 reminder metadata를 갱신해야 한다");
assert(pushSource.includes('Notification.permission === "denied"') && pushSource.includes("브라우저 알림 권한이 차단되어 있습니다."));
assert(pushSource.includes("pushManager.getSubscription()") && pushSource.includes("pushManager.subscribe"), "구독이 없으면 기존 Web Push 등록 경로를 사용해야 한다");
assert(sender.includes("is_completed=eq.false") && sender.includes("operation_push_deliveries?on_conflict="), "완료 제외와 중복 방지는 기존 발송 구조를 유지해야 한다");
assert(serviceWorker.includes('self.addEventListener("push"') && serviceWorker.includes("showNotification"), "백그라운드 알림은 service worker가 표시해야 한다");
assert(html.includes('params.get("eventPreviewId")') && html.includes("savedEvents.find"), "preview route는 eventOrderId로 실제 저장 경로를 resolve해야 한다");

console.log("operation reminder delivery V1 tests passed");
