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

  function contourEdges(cells) {
    const occupied = new Set(cells.map((cell) => `${cell.x}:${cell.y}`));
    const edges = [];
    cells.forEach(({ x, y }) => {
      if (!occupied.has(`${x}:${y - 1}`)) edges.push({ from: [x, y], to: [x + 1, y], direction: 0 });
      if (!occupied.has(`${x + 1}:${y}`)) edges.push({ from: [x + 1, y], to: [x + 1, y + 1], direction: 1 });
      if (!occupied.has(`${x}:${y + 1}`)) edges.push({ from: [x + 1, y + 1], to: [x, y + 1], direction: 2 });
      if (!occupied.has(`${x - 1}:${y}`)) edges.push({ from: [x, y + 1], to: [x, y], direction: 3 });
    });
    return edges;
  }

  function buildContourLoops(cells) {
    const remaining = contourEdges(cells).map((edge, index) => ({ ...edge, index }));
    const loops = [];
    while (remaining.length) {
      remaining.sort((a, b) => a.from[1] - b.from[1] || a.from[0] - b.from[0] || a.direction - b.direction);
      const first = remaining.shift();
      const loop = [first.from, first.to];
      let current = first;
      let guard = 0;
      while ((current.to[0] !== first.from[0] || current.to[1] !== first.from[1]) && guard < 1000) {
        const candidates = remaining.filter((edge) => edge.from[0] === current.to[0] && edge.from[1] === current.to[1]);
        const priorities = [(current.direction + 1) % 4, current.direction, (current.direction + 3) % 4, (current.direction + 2) % 4];
        const next = candidates.sort((a, b) => priorities.indexOf(a.direction) - priorities.indexOf(b.direction))[0];
        if (!next) break;
        remaining.splice(remaining.indexOf(next), 1);
        current = next;
        loop.push(next.to);
        guard += 1;
      }
      if (loop.length > 3 && loop.at(-1)[0] === loop[0][0] && loop.at(-1)[1] === loop[0][1]) loop.pop();
      loops.push(loop);
    }
    return loops;
  }

  function roundedLoopPath(points, cellSize, radius) {
    if (points.length < 3) return "";
    const simplified = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
    });
    const scaled = simplified.map(([x, y]) => ({ x: x * cellSize, y: y * cellSize }));
    const corners = scaled.map((point, index) => {
      const previous = scaled[(index - 1 + scaled.length) % scaled.length];
      const next = scaled[(index + 1) % scaled.length];
      const beforeLength = Math.hypot(previous.x - point.x, previous.y - point.y);
      const afterLength = Math.hypot(next.x - point.x, next.y - point.y);
      const cornerRadius = Math.min(radius, beforeLength / 2, afterLength / 2);
      return {
        point,
        before: { x: point.x + (previous.x - point.x) * cornerRadius / beforeLength, y: point.y + (previous.y - point.y) * cornerRadius / beforeLength },
        after: { x: point.x + (next.x - point.x) * cornerRadius / afterLength, y: point.y + (next.y - point.y) * cornerRadius / afterLength },
      };
    });
    const number = (value) => Number(value.toFixed(2));
    return corners.map((corner, index) => `${index ? "L" : "M"}${number(corner.before.x)} ${number(corner.before.y)} Q${number(corner.point.x)} ${number(corner.point.y)} ${number(corner.after.x)} ${number(corner.after.y)}`).join(" ") + " Z";
  }

  function buildPieceContour(cells, options = {}) {
    const cellSize = Number(options.cellSize) || 1;
    const radius = Math.max(0, Number(options.radius) || cellSize * 0.2);
    return buildContourLoops(cells).map((loop) => roundedLoopPath(loop, cellSize, radius)).filter(Boolean).join(" ");
  }

  return { ATOM_COLUMNS, BOARD_COLUMNS, dateKey, eventDates, venueAtoms, occupancyForEvent, placePieces, buildLayout, widestRow, hasOverlap, contourEdges, buildContourLoops, buildPieceContour };
});
