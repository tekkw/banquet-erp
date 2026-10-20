(function registerBeverageInventory(global) {
  "use strict";

  const SNAPSHOT_DATE = "2000-01-01";
  const SNAPSHOT_KEY = "beverage-inventory:latest";
  const CELL_MAPPING = Object.freeze({
    beer: Object.freeze({ label: "맥주", labelCell: "A5", stockCell: "BE5" }),
    soju: Object.freeze({ label: "소주", labelCell: "A8", stockCell: "BE8" }),
    cola: Object.freeze({ label: "콜라", labelCell: "B11", stockCell: "BE11" }),
    cider: Object.freeze({ label: "사이다", labelCell: "B14", stockCell: "BE14" }),
  });
  const ITEM_PATTERNS = Object.freeze({ beer: /맥주/, soju: /소주/, cola: /콜라/, cider: /사이다/ });
  const DEMAND_RATES = Object.freeze({ beer: 1, soju: 0.5, cola: 0.3, cider: 0.3 });
  const LABELS = Object.freeze({ beer: "맥주", soju: "소주", cola: "콜라", cider: "사이다" });
  let snapshot = null;
  let currentEvents = [];
  let bindings = {};
  let initialized = false;

  const clean = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const addDays = (dateKey, amount) => { const date = new Date(`${dateKey}T12:00:00+09:00`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
  function seoulDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function demandRange(today = seoulDateKey()) {
    const day = new Date(`${today}T12:00:00+09:00`).getUTCDay();
    return { start: today, end: addDays(today, ((7 - day) % 7) + 7) };
  }

  function sheetCells(sheet) { return Object.entries(sheet || {}).filter(([address]) => !address.startsWith("!")); }
  function parseAddress(address) {
    const match = /^([A-Z]+)(\d+)$/i.exec(address || "");
    if (!match) return null;
    return { column: match[1].toUpperCase().split("").reduce((sum, character) => (sum * 26) + character.charCodeAt(0) - 64, 0), row: Number(match[2]) };
  }
  function columnName(number) {
    let result = "";
    for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(((value - 1) % 26) + 65) + result;
    return result;
  }
  function parsePeriod(value) {
    const text = clean(value);
    const dated = text.match(/(?:^|\D)((?:20)?\d{2})\s*(?:년|[._\-/])\s*(\d{1,2})(?:\s*월|[._\-/])/);
    if (dated) return { year: Number(dated[1]) < 100 ? 2000 + Number(dated[1]) : Number(dated[1]), month: Number(dated[2]) };
    const month = text.match(/(?:^|\D)(\d{1,2})\s*월/);
    return month ? { year: null, month: Number(month[1]) } : null;
  }
  function inventoryStructure(sheet) {
    const rows = global.XLSX?.utils?.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) || [];
    const positions = [];
    rows.forEach((row, rowIndex) => (row || []).forEach((value, columnIndex) => { if (clean(value)) positions.push({ row: rowIndex, column: columnIndex, value: clean(value) }); }));
    const findCell = (pattern) => positions.find((cell) => pattern.test(cell.value));
    const headerCell = findCell(/^\s*실재고수\s*$/);
    const categoryHeader = findCell(/^\s*구분\s*$/);
    const monthlyHeader = findCell(/당월재고/);
    const items = Object.fromEntries(Object.entries(ITEM_PATTERNS).map(([key, pattern]) => [key, rows.findIndex((row) => pattern.test((row || []).map(clean).join(" ")))]));
    const headerMerge = headerCell && (sheet?.["!merges"] || []).find((range) => headerCell.row >= range.s.r && headerCell.row <= range.e.r && headerCell.column >= range.s.c && headerCell.column <= range.e.c);
    const inventoryColumns = headerCell ? headerMerge ? Array.from({ length: headerMerge.e.c - headerMerge.s.c + 1 }, (_, index) => headerMerge.s.c + index) : [headerCell.column] : [];
    const inventoryColumn = inventoryColumns.sort((left, right) => Object.values(items).filter((row) => normalizeStockNumber(rows[row]?.[right]) != null).length - Object.values(items).filter((row) => normalizeStockNumber(rows[row]?.[left]) != null).length)[0];
    const inventoryHeader = headerCell && { ...headerCell, column: inventoryColumn ?? headerCell.column, mergedColumns: inventoryColumns };
    const titleText = rows.slice(0, 12).flat().map(clean).filter(Boolean).join(" ");
    const missingItems = Object.entries(items).filter(([, row]) => row < 0).map(([key]) => key);
    return { rows, hasTable: Boolean(categoryHeader && monthlyHeader), valid: Boolean(categoryHeader && monthlyHeader && inventoryHeader && !missingItems.length), inventoryHeader, categoryHeader, monthlyHeader, items, missingItems, period: parsePeriod(titleText) };
  }
  function normalizeStockNumber(value) {
    const normalized = clean(value).replaceAll(",", "");
    if (!normalized || !/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
  }
  function readNumericCell(sheet, address, sheetName) {
    const cell = sheet?.[address];
    if (cell?.f && (cell.v == null || clean(cell.v) === "")) {
      console.debug("[Beverage Inventory] formula cache missing", { sheetName, cell: address, formula: cell.f });
      return null;
    }
    const value = normalizeStockNumber(cell?.v ?? (!cell?.f ? cell?.w : null));
    return value == null ? null : { address, value, formula: Boolean(cell?.f) };
  }
  function readInventoryItem(key, structure) {
    const row = structure.items[key]; const column = structure.inventoryHeader?.column;
    if (row < 0 || column == null) return null;
    const rawValue = structure.rows[row]?.[column]; const value = normalizeStockNumber(rawValue);
    return value == null ? null : { row: row + 1, column: column + 1, rawValue, value };
  }
  function readStockWorkbook(workbook, originalFilename = "", now = new Date()) {
    if (!workbook?.SheetNames?.length) throw new Error("재고 형식의 시트를 찾지 못했습니다.");
    const sheetNames = workbook.SheetNames.slice();
    console.debug("[Beverage Inventory] workbook sheets", { sheetNames });
    const currentKey = seoulDateKey(now);
    const filenamePeriod = parsePeriod(originalFilename);
    const candidates = workbook.SheetNames.map((sheetName, index) => {
      const sheet = workbook.Sheets?.[sheetName];
      const structure = inventoryStructure(sheet);
      const namePeriod = parsePeriod(sheetName);
      const period = namePeriod || structure.period;
      const year = period?.year || filenamePeriod?.year || Number(currentKey.slice(0, 4));
      const month = period?.month || 0;
      const variant = /신규/.test(sheetName) ? 2 : /기존/.test(sheetName) ? 1 : 0;
      return { sheetName, sheet, structure, index, year, month, variant, example: /예시/.test(sheetName) };
    }).filter((candidate) => candidate.structure.valid);
    const tableSheets = workbook.SheetNames.map((sheetName) => ({ sheetName, structure: inventoryStructure(workbook.Sheets?.[sheetName]) })).filter((candidate) => candidate.structure.hasTable);
    const preferred = candidates.some((candidate) => !candidate.example) ? candidates.filter((candidate) => !candidate.example) : candidates;
    preferred.sort((left, right) => right.year - left.year || right.month - left.month || right.variant - left.variant || right.index - left.index);
    console.debug("[Beverage Inventory] valid sheets", { validInventorySheets: candidates.map(({ sheetName, year, month, variant, example }) => ({ sheetName, year, month, variant: variant === 2 ? "신규" : variant === 1 ? "기존" : "", example })) });
    const selected = preferred[0];
    if (!selected) {
      if (tableSheets.some((candidate) => !candidate.structure.inventoryHeader)) throw new Error("실재고수 header를 찾지 못했습니다.");
      if (tableSheets.some((candidate) => candidate.structure.missingItems.length)) throw new Error("필수 품목 row를 찾지 못했습니다.");
      throw new Error("재고 형식의 시트를 찾지 못했습니다.");
    }
    const sourceCells = Object.fromEntries(Object.keys(CELL_MAPPING).map((key) => [key, readInventoryItem(key, selected.structure)]));
    console.debug("[Beverage Inventory] workbook selection", {
      selectedSheet: selected.sheetName,
      inventoryHeaderRow: selected.structure.inventoryHeader.row + 1,
      inventoryHeaderColumn: selected.structure.inventoryHeader.column + 1,
      inventoryHeaderText: selected.structure.inventoryHeader.value,
      beer: sourceCells.beer,
      soju: sourceCells.soju,
      cola: sourceCells.cola,
      cider: sourceCells.cider,
    });
    if (Object.values(sourceCells).some((cell) => !cell)) throw new Error("실재고수 값을 읽지 못했습니다.");
    const stock = Object.fromEntries(Object.entries(sourceCells).map(([key, cell]) => [key, cell.value]));
    return { ...stock, uploadedAt: new Date().toISOString(), originalFilename: clean(originalFilename), sheetName: selected.sheetName, sourceCells };
  }

  function eventDates(event) {
    const dates = [...(event?.calendarDates || []), event?.startDate, event?.endDate].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)));
    return [...new Set(dates)].sort();
  }
  function normalizeMeal(value) {
    const text = clean(value).toLowerCase();
    if (/중식|lunch/.test(text)) return "중식뷔페";
    if (/석식|dinner/.test(text)) return "석식뷔페";
    return "";
  }
  function calculateDemand(events, today = seoulDateKey()) {
    const range = demandRange(today);
    const seen = new Set();
    const details = [];
    (events || []).forEach((event) => {
      const fallbackDates = eventDates(event);
      const rows = event?.schedule?.length ? event.schedule : fallbackDates.map((date) => ({ date, content: [event.eventType, ...(event.mealTypes || [])].join(" "), venue: event.venue, people: event.guestCount }));
      rows.forEach((row) => {
        const date = clean(row.date) || fallbackDates[0] || "";
        if (!date || date < range.start || date > range.end) return;
        const venue = clean(row.venue || event.venue);
        if (/피렌체|firenze/i.test(venue)) return;
        const text = [row.content, event.eventType, ...(event.mealTypes || [])].map(clean).join(" ");
        if (/check\s*in|check\s*out|체크\s*인|체크\s*아웃|입실|퇴실/i.test(text) || !/뷔페|buffet/i.test(text)) return;
        const meal = normalizeMeal(text);
        if (!meal) return;
        const eventId = clean(event.id) || [event.eventName, event.companyName, event.startDate].map(clean).join("|");
        const key = `${eventId}|${date}|${meal}`;
        if (seen.has(key)) return;
        seen.add(key);
        const guests = Math.max(0, Number(row.people ?? event.guestCount) || 0);
        details.push({ eventOrderId: event.id || "", date, venue, meal, guests, title: clean(event.companyName || event.eventName) || "행사명 미입력" });
      });
    });
    details.sort((left, right) => left.date.localeCompare(right.date) || left.venue.localeCompare(right.venue, "ko"));
    const totalGuests = details.reduce((sum, item) => sum + item.guests, 0);
    const required = Object.fromEntries(Object.entries(DEMAND_RATES).map(([key, rate]) => [key, Math.ceil(totalGuests * rate)]));
    return { range, details, totalGuests, required };
  }
  function compareInventory(stockSnapshot, demand) {
    const items = Object.fromEntries(Object.keys(DEMAND_RATES).map((key) => {
      const stock = Math.max(0, Number(stockSnapshot?.[key]) || 0);
      const required = Math.max(0, Number(demand?.required?.[key]) || 0);
      return [key, { key, label: LABELS[key], stock, required, shortage: Math.max(0, required - stock), sufficient: stock >= required }];
    }));
    return { snapshot: stockSnapshot || null, demand, items, shortageCount: Object.values(items).filter((item) => item.shortage > 0).length };
  }
  function getComparison(events = currentEvents, today = seoulDateKey()) { return compareInventory(snapshot, calculateDemand(events, today)); }

  function matchesQuestion(question) {
    const text = clean(question);
    return /(음주류|주류|음료|맥주|소주|콜라|사이다)/.test(text) && /(발주|부족|재고|필요|충분|모자)/.test(text);
  }
  function answerQuestion(question, events = currentEvents, today = seoulDateKey()) {
    if (!snapshot) return { text: "음주류 재고 엑셀이 아직 업로드되지 않았습니다.", comparison: getComparison(events, today) };
    const comparison = getComparison(events, today);
    const selectedKey = Object.keys(LABELS).find((key) => clean(question).includes(LABELS[key]));
    const rangeLabel = `${comparison.demand.range.start.slice(5).replace("-", "/")}~${comparison.demand.range.end.slice(5).replace("-", "/")}`;
    if (selectedKey) {
      const item = comparison.items[selectedKey];
      const status = item.shortage ? `${item.shortage}개 부족합니다.` : `${item.stock - item.required}개 여유로 충분합니다.`;
      return { text: `${rangeLabel} 뷔페 행사 기준 ${item.label}은 현재 ${item.stock}개, 필요 ${item.required}개로 ${status}`, comparison };
    }
    const shortages = Object.values(comparison.items).filter((item) => item.shortage > 0);
    const shortageLabels = shortages.map((item) => `${item.label} ${item.shortage}개`);
    const shortageText = shortageLabels.length > 1 ? `${shortageLabels.slice(0, -1).join(", ")}와 ${shortageLabels.at(-1)}` : shortageLabels[0] || "";
    const text = shortages.length
      ? `${rangeLabel} 기준으로 ${shortageText}가 부족합니다.`
      : `${rangeLabel} 기준 음주류 재고가 모두 충분합니다.`;
    return { text, comparison };
  }

  function config() { return global.BANQUET_ERP_CONSTANTS?.supabaseConfig || {}; }
  async function request(path, options = {}) {
    if (typeof bindings.supabaseRequest === "function") return bindings.supabaseRequest(path, options);
    const settings = config();
    if (!settings.url || !settings.anonKey) throw new Error("Supabase 설정이 없습니다.");
    const response = await fetch(`${settings.url}/rest/v1/${path}`, { ...options, headers: { apikey: settings.anonKey, Authorization: `Bearer ${settings.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`음주류 재고 저장소 ${response.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
  async function loadSnapshot() {
    try {
      const rows = await request(`operation_board_items?select=metadata&board_date=eq.${SNAPSHOT_DATE}&item_key=eq.${encodeURIComponent(SNAPSHOT_KEY)}&limit=1`);
      snapshot = rows?.[0]?.metadata?.snapshot || null;
      console.debug("[Beverage Inventory] snapshot loaded", { uploadedAt: snapshot?.uploadedAt || null, originalFilename: snapshot?.originalFilename || "" });
      render();
      global.dispatchEvent?.(new CustomEvent("banquet:beverage-inventory-updated"));
      return snapshot;
    } catch (error) {
      console.error("[Beverage Inventory] snapshot load failed", error);
      renderError("재고 정보를 불러오지 못했습니다.");
      return null;
    }
  }
  async function saveSnapshot(nextSnapshot) {
    const payload = { board_date: SNAPSHOT_DATE, item_key: SNAPSHOT_KEY, item_kind: "manual", event_order_id: null, space_id: null, item_time: null, venue_name: "", title: "음주류 재고", people: null, memo: nextSnapshot.originalFilename || "", is_completed: false, metadata: { source: "beverage_inventory_upload", recordType: "beverage_inventory_snapshot", snapshot: nextSnapshot } };
    await request("operation_board_items?on_conflict=board_date,item_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(payload) });
    snapshot = nextSnapshot;
    render();
    global.dispatchEvent?.(new CustomEvent("banquet:beverage-inventory-updated"));
    return snapshot;
  }
  async function uploadInventoryFile(file) {
    if (!file) return null;
    if (!global.XLSX) throw new Error("엑셀 파서를 불러오지 못했습니다.");
    let workbook;
    try { workbook = global.XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true }); }
    catch (error) { console.error("[Beverage Inventory] workbook read failed", error); throw new Error("엑셀 파일을 읽지 못했습니다."); }
    const parsed = readStockWorkbook(workbook, file.name);
    const uploaded = await bindings.uploadOriginalFile?.(file, { pathPrefix: "beverage_inventory" });
    const nextSnapshot = { ...parsed, storagePath: uploaded?.storagePath || "" };
    console.debug("[Beverage Inventory] upload parsed", { sheetName: parsed.sheetName, stock: Object.fromEntries(Object.keys(LABELS).map((key) => [key, parsed[key]])) });
    return saveSnapshot(nextSnapshot);
  }

  function renderError(message) {
    const root = document.getElementById?.("beverageInventoryWidget");
    const status = root?.querySelector?.("[data-beverage-status]");
    if (status) { status.textContent = message; status.dataset.type = "error"; }
  }
  function render() {
    const root = document.getElementById?.("beverageInventoryWidget");
    if (!root) return;
    const comparison = getComparison();
    const summary = root.querySelector("[data-beverage-summary]");
    const details = root.querySelector("[data-beverage-details]");
    const status = root.querySelector("[data-beverage-status]");
    const originalButton = root.querySelector("[data-beverage-original]");
    if (!snapshot) {
      if (summary) summary.innerHTML = '<p class="beverage-inventory-empty">재고 엑셀을 업로드해주세요.</p>';
      if (details) details.innerHTML = "";
      if (status) { status.textContent = "최신 재고 없음"; status.dataset.type = "empty"; }
      if (originalButton) originalButton.disabled = true;
      return;
    }
    if (summary) summary.innerHTML = Object.values(comparison.items).map((item) => `<div class="beverage-inventory-row${item.shortage ? " is-short" : ""}"><strong>${item.label}</strong><span>${item.stock} / 필요 ${item.required}</span><em>${item.shortage ? `부족 ${item.shortage}` : "충분"}</em></div>`).join("");
    if (details) details.innerHTML = comparison.demand.details.map((item) => `<li>${escapeHtml(`${item.date.slice(5).replace("-", "/")} ${item.venue} · ${item.meal} · ${item.guests}명`)}</li>`).join("") || "<li>집계 기간의 뷔페 행사가 없습니다.</li>";
    if (status) { status.textContent = comparison.shortageCount ? `음주류 발주 필요 ${comparison.shortageCount}품목` : "재고 충분"; status.dataset.type = comparison.shortageCount ? "warning" : "ok"; }
    if (originalButton) originalButton.disabled = !snapshot.storagePath;
    const filename = root.querySelector("[data-beverage-filename]");
    if (filename) filename.textContent = snapshot.originalFilename || "업로드 파일";
  }
  function bindWidget() {
    const root = document.getElementById?.("beverageInventoryWidget");
    if (!root || root.dataset.bound === "true") return;
    root.dataset.bound = "true";
    const input = root.querySelector("[data-beverage-file]");
    root.querySelector("[data-beverage-upload]")?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", async () => {
      const file = input.files?.[0]; if (!file) return;
      renderError("재고 엑셀을 확인하고 있습니다...");
      try { await uploadInventoryFile(file); }
      catch (error) { console.error("[Beverage Inventory] upload failed", error); renderError(error.message || "재고 엑셀 업로드에 실패했습니다."); }
      finally { input.value = ""; }
    });
    root.querySelector("[data-beverage-original]")?.addEventListener("click", () => { if (snapshot?.storagePath) bindings.openStoredExcel?.(snapshot.storagePath); });
  }
  function init(options = {}) {
    bindings = { ...bindings, ...options };
    currentEvents = bindings.getEvents?.() || currentEvents;
    bindWidget();
    render();
    if (!initialized) { initialized = true; loadSnapshot(); }
  }
  function setEvents(events) { currentEvents = events || []; render(); }
  function warningHtml(events = currentEvents) {
    if (!snapshot) return "";
    const count = getComparison(events).shortageCount;
    return count ? `<div class="beverage-inventory-warning" role="status">음주류 발주 필요 <strong>${count}품목</strong></div>` : "";
  }

  global.BANQUET_ERP_BEVERAGE_INVENTORY = Object.freeze({ CELL_MAPPING, DEMAND_RATES, readStockWorkbook, demandRange, calculateDemand, compareInventory, matchesQuestion, answerQuestion, getComparison, loadSnapshot, uploadInventoryFile, init, setEvents, warningHtml, _setSnapshotForTest(value) { snapshot = value; } });
})(window);
