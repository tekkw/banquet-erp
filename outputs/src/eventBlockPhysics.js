(function (root, factory) {
  const api = factory(root.BANQUET_ERP_VENUE_UTILS);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BANQUET_ERP_EVENT_BLOCK_PHYSICS = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (venueUtils) {
  "use strict";

  const ATOM_COLUMNS = Object.freeze({
    CONVENTION_1: 0, CONVENTION_2: 2, CONVENTION_3: 4,
    BURANO_1: 6, BURANO_2: 8, BURANO_3: 10,
    CAPRI_1: 12, CAPRI_2: 14, CAPRI_3: 16,
    FESTA: 18, OLIVIA: 20, UNMAPPED: 22,
  });
  const BOARD_COLUMNS = 24;

  function dateKey(value) {
    const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }

  function addDays(value, amount) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function inclusiveRange(start, end) {
    if (!start) return [];
    const last = end && end >= start ? end : start;
    const result = [];
    for (let cursor = start; cursor <= last && result.length < 62; cursor = addDays(cursor, 1)) result.push(cursor);
    return result;
  }

  function eventDates(event) {
    const explicit = [...(event.calendarDates || []), ...(event.schedule || []).map((item) => item.date)]
      .map(dateKey).filter(Boolean);
    const start = dateKey(event.startDate || event.eventDateTime || explicit[0]);
    const end = dateKey(event.endDate || start);
    return [...new Set([...inclusiveRange(start, end), ...explicit])].sort();
  }

  function venueAtoms(value) {
    const atoms = [...(venueUtils?.normalizeVenueSet?.(value) || [])];
    return atoms.length ? atoms.filter((atom) => ATOM_COLUMNS[atom] != null) : ["UNMAPPED"];
  }

  function venueForDate(event, date) {
    const schedules = (event.schedule || []).filter((item) => dateKey(item.date) === date && item.venue);
    return schedules.length ? schedules.map((item) => item.venue).join(",") : event.venue;
  }

  function occupancyForEvent(event) {
    const dates = eventDates(event);
    const cells = [];
    dates.forEach((date, dateIndex) => {
      venueAtoms(venueForDate(event, date)).forEach((atom) => {
        const x = ATOM_COLUMNS[atom];
        cells.push({ x, y: dateIndex, date, atom }, { x: x + 1, y: dateIndex, date, atom });
      });
    });
    const unique = [...new Map(cells.map((cell) => [`${cell.x}:${cell.y}`, cell])).values()];
    const xs = unique.map((cell) => cell.x);
    return {
      id: String(event.id || event.eventOrderId || `${dateKey(event.startDate)}:${event.eventName || "event"}`),
      event,
      start: dateKey(event.startDate || event.eventDateTime || dates[0]),
      end: dateKey(event.endDate || dates.at(-1)),
      cells: unique,
      minX: xs.length ? Math.min(...xs) : 0,
      maxX: xs.length ? Math.max(...xs) : 1,
      width: xs.length ? Math.max(...xs) - Math.min(...xs) + 1 : 2,
      height: Math.max(1, dates.length),
      venueLabel: venueUtils?.formatVenueShort?.(event.venue) || event.venue || "미정",
      organizerLabel: event.companyName || event.organizer || event.eventName || "행사",
    };
  }

  function collides(piece, row, occupied) {
    return piece.cells.some((cell) => occupied.has(`${cell.x}:${row + cell.y}`));
  }

  function placePieces(pieces) {
    const occupied = new Set();
    return [...pieces]
      .sort((a, b) => String(a.start).localeCompare(String(b.start)) || String(a.id).localeCompare(String(b.id)))
      .map((piece) => {
        let targetRow = 0;
        while (collides(piece, targetRow, occupied)) targetRow += 1;
        const placed = { ...piece, targetRow, cells: piece.cells.map((cell) => ({ ...cell, boardY: targetRow + cell.y })) };
        placed.cells.forEach((cell) => occupied.add(`${cell.x}:${cell.boardY}`));
        return placed;
      });
  }

  function buildLayout(events, options = {}) {
    const anchor = dateKey(options.anchorDate);
    const completed = new Set((options.completedIds || []).map(String));
    const pieces = (events || []).map(occupancyForEvent)
      .filter((piece) => piece.cells.length && !completed.has(piece.id) && (!anchor || !piece.end || piece.end >= anchor))
      .sort((a, b) => String(a.start).localeCompare(String(b.start)) || a.id.localeCompare(b.id))
      .slice(0, options.limit || 12);
    return placePieces(pieces);
  }

  function widestRow(piece) {
    const rows = new Map();
    piece.cells.forEach((cell) => {
      if (!rows.has(cell.boardY)) rows.set(cell.boardY, []);
      rows.get(cell.boardY).push(cell);
    });
    return [...rows.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0] || [piece.targetRow, []];
  }

  function hasOverlap(pieces) {
    const occupied = new Set();
    for (const piece of pieces) {
      for (const cell of piece.cells) {
        const key = `${cell.x}:${cell.boardY}`;
        if (occupied.has(key)) return true;
        occupied.add(key);
      }
    }
    return false;
  }

  return { ATOM_COLUMNS, BOARD_COLUMNS, dateKey, eventDates, venueAtoms, occupancyForEvent, placePieces, buildLayout, widestRow, hasOverlap };
});
