(function initializeOperationBoardPage() {
  const constants = window.BANQUET_ERP_CONSTANTS;
  const board = window.BANQUET_ERP_OPERATION_BOARD;
  const cacheKey = "banquet-erp-events-cache-v1";
  const app = document.getElementById("boardApp");
  const login = document.getElementById("boardLogin");
  const status = document.getElementById("boardSyncStatus");
  const dateLabel = document.getElementById("boardDateLabel");
  let events = [];

  function storedUser() {
    try {
      const value = JSON.parse(localStorage.getItem(constants.authStorageKey) || "null");
      return constants.loginAccounts.find((account) => account.id === value?.id && account.role === value?.role) || null;
    } catch { return null; }
  }
  function cachedEvents() {
    try { const value = JSON.parse(localStorage.getItem(cacheKey) || "null"); return Array.isArray(value?.events) ? value.events : []; }
    catch { return []; }
  }
  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(date);
  }
  function render() {
    board.render({ events });
    dateLabel.textContent = formatDate(board.getSelectedDate());
  }
  async function request(path) {
    const response = await fetch(`${constants.supabaseConfig.url}/rest/v1/${path}`, { headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}` } });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    return response.json();
  }
  async function childRows(table, ids, order) {
    const result = []; const pageSize = 1000; const batchSize = 50;
    for (let start = 0; start < ids.length; start += batchSize) {
      const filter = `in.(${ids.slice(start, start + batchSize).join(",")})`;
      for (let offset = 0; ; offset += pageSize) {
        const page = await request(`${table}?select=*&event_order_id=${filter}&order=${order}&limit=${pageSize}&offset=${offset}`);
        result.push(...page); if (page.length < pageSize) break;
      }
    }
    return result;
  }
  function grouped(rows) {
    return rows.reduce((map, row) => { (map[row.event_order_id] ||= []).push(row); return map; }, {});
  }
  async function refresh() {
    status.textContent = "최신 일정 동기화 중";
    try {
      const rows = await request("event_orders?select=*&order=created_at.desc"); const ids = rows.map((row) => row.id);
      if (!ids.length) { events = []; render(); return; }
      const [dates, schedules] = await Promise.all([childRows("event_calendar_dates", ids, "calendar_date.asc,id.asc"), childRows("event_schedules", ids, "created_at.asc,id.asc")]);
      const byDate = grouped(dates); const bySchedule = grouped(schedules);
      events = rows.map((row) => ({ id: row.id, eventName: row.event_name || "", startDate: row.start_date || "", endDate: row.end_date || "", eventDateTime: row.event_datetime || "", venue: row.venue || "", guestCount: row.guest_count ?? "", eventType: row.event_type || "", mealTypes: row.meal_types || [], internalMemo: row.internal_memo || "", storagePath: row.storage_path || "", calendarDates: (byDate[row.id] || []).map((item) => item.calendar_date), schedule: (bySchedule[row.id] || []).map((item) => ({ date: item.schedule_date || "", time: item.schedule_time || "", content: item.content || "", venue: item.venue || "", people: item.people ?? "" })) }));
      localStorage.setItem(cacheKey, JSON.stringify({ version: 1, savedAt: Date.now(), events }));
      render(); status.textContent = "최신 일정 동기화 완료";
    } catch (error) { console.error(error); status.textContent = events.length ? "저장된 일정 표시 중 · 동기화 재시도 필요" : "일정을 불러오지 못했습니다"; }
  }
  function start() {
    login.hidden = true; app.hidden = false; events = cachedEvents(); render();
    status.textContent = events.length ? "저장된 일정 표시 중" : "최신 일정 불러오는 중";
    refresh();
  }
  document.querySelectorAll("[data-board-page-step]").forEach((button) => button.onclick = () => {
    const date = new Date(`${board.getSelectedDate()}T00:00:00`); date.setDate(date.getDate() + Number(button.dataset.boardPageStep));
    board.setSelectedDate(date.toISOString().slice(0, 10)); render();
  });
  document.querySelector("[data-board-page-today]").onclick = () => { board.setSelectedDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)); render(); };
  document.getElementById("boardLoginForm").onsubmit = (event) => {
    event.preventDefault(); const id = document.getElementById("boardLoginId").value.trim(); const password = document.getElementById("boardLoginPassword").value;
    const account = constants.loginAccounts.find((item) => item.id === id && item.password === password);
    if (!account) { document.getElementById("boardLoginError").textContent = "아이디 또는 비밀번호가 올바르지 않습니다."; return; }
    localStorage.setItem(constants.authStorageKey, JSON.stringify({ id: account.id, role: account.role, label: account.label })); start();
  };
  window.openStoredExcel = (path) => window.open(`${constants.supabaseConfig.url}/storage/v1/object/public/${constants.supabaseConfig.bucket}/${String(path).split("/").map(encodeURIComponent).join("/")}`, "_blank", "noopener");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../push-sw.js").catch(console.warn);
  if (storedUser()) start(); else { login.hidden = false; app.hidden = true; }
})();
