const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const FESTA_ID = "d529a00d-3419-4045-80ad-03ac92c89ade";
const BURANO_ID = "5814484c-6467-4b1a-a4e2-2e83c7d7d0eb";
const CAPRI_ID = "9de31f8f-f43e-4846-996c-af9497b119c4";

function countByEventOrderId(rows, eventOrderId) {
  return rows.filter((row) => row.event_order_id === eventOrderId).length;
}

(async () => {
for (const file of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const source = fs.readFileSync(file, "utf8");
  const helperStart = source.indexOf("    async function fetchAllEventChildRows(");
  const helperEnd = source.indexOf("\n    async function fetchEventRowsFromSupabase", helperStart);
  assert(helperStart >= 0 && helperEnd > helperStart, `${file}: paginated child-row helper missing`);

  const helper = source.slice(helperStart, helperEnd);
  // Production on 2026-09-29 placed Festa at the end of page 1, while the
  // Burano and Capri schedules were on page 2. Keep those real IDs/counts in
  // the regression so a one-page child query cannot silently pass again.
  const historicalRows = Array.from({ length: 994 }, (_, index) => ({ id: `historical-${index}` }));
  const festaRows = Array.from({ length: 6 }, (_, index) => ({ id: `festa-${index}`, event_order_id: FESTA_ID }));
  const buranoRows = Array.from({ length: 6 }, (_, index) => ({ id: `burano-${index}`, event_order_id: BURANO_ID }));
  const capriRows = Array.from({ length: 5 }, (_, index) => ({ id: `capri-${index}`, event_order_id: CAPRI_ID }));
  const allRows = [...historicalRows, ...festaRows, ...buranoRows, ...capriRows];
  const requestedPaths = [];
  const context = {
    loggedSupabaseRequest: async (_stepName, path) => {
      requestedPaths.push(path);
      const offset = Number(new URL(`https://example.test/${path}`).searchParams.get("offset"));
      return allRows.slice(offset, offset + 1000);
    },
  };
  vm.createContext(context);
  vm.runInContext(`${helper}\nthis.fetchAllEventChildRows = fetchAllEventChildRows;`, context);

  const rows = await context.fetchAllEventChildRows("event_schedules", "in.(event-id)", "created_at.asc,id.asc");
  assert.equal(rows.length, 1011, `${file}: all schedule rows must be fetched`);
  assert.equal(requestedPaths.length, 2, `${file}: the second page must be requested`);
  assert(requestedPaths[1].includes("offset=1000"), `${file}: second page offset missing`);
  assert.equal(countByEventOrderId(rows, FESTA_ID), 6, `${file}: Festa page-1 schedules missing`);
  assert.equal(countByEventOrderId(rows, BURANO_ID), 6, `${file}: Burano page-2 schedules missing`);
  assert.equal(countByEventOrderId(rows, CAPRI_ID), 5, `${file}: Capri page-2 schedules missing`);

  assert(source.includes("행사 기본정보는 저장됐지만 Schedule 저장 검증에 실패했습니다."), `${file}: save verification error missing`);
  assert(source.includes("verifiedRows = await fetchEventRowsFromSupabase([savedEvent.id])"), `${file}: post-save DB reload missing`);
  assert(source.includes("savedEvents.filter((eventItem) => eventItem.id !== verifiedEvent.id)"), `${file}: DB-verified event replacement missing`);
}

console.log("event schedule pagination and save verification tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
