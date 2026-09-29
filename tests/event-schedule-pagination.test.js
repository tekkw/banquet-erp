const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

for (const file of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const source = fs.readFileSync(file, "utf8");
  const helperStart = source.indexOf("    async function fetchAllEventChildRows(");
  const helperEnd = source.indexOf("\n    async function fetchEventRowsFromSupabase", helperStart);
  assert(helperStart >= 0 && helperEnd > helperStart, `${file}: paginated child-row helper missing`);

  const helper = source.slice(helperStart, helperEnd);
  const allRows = Array.from({ length: 1023 }, (_, index) => ({ id: index + 1 }));
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

  context.fetchAllEventChildRows("event_schedules", "in.(event-id)", "created_at.asc,id.asc").then((rows) => {
    assert.equal(rows.length, 1023, `${file}: all schedule rows must be fetched`);
    assert.equal(requestedPaths.length, 2, `${file}: the second page must be requested`);
    assert(requestedPaths[1].includes("offset=1000"), `${file}: second page offset missing`);
  });

  assert(source.includes("행사 기본정보는 저장됐지만 Schedule 저장 검증에 실패했습니다."), `${file}: save verification error missing`);
  assert(source.includes("verifiedRows = await fetchEventRowsFromSupabase([savedEvent.id])"), `${file}: post-save DB reload missing`);
  assert(source.includes("savedEvents.filter((eventItem) => eventItem.id !== verifiedEvent.id)"), `${file}: DB-verified event replacement missing`);
}

setImmediate(() => console.log("event schedule pagination and save verification tests passed"));
