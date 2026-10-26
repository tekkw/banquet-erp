(function () {
  "use strict";

  const physics = window.BANQUET_ERP_EVENT_BLOCK_PHYSICS;
  const NS = "http://www.w3.org/2000/svg";
  const COMPLETE_KEY = "banquetBoard.eventBlocks.completed.v1";
  const CELL = 14;
  const GAP = 1.4;
  const FLOOR = 328;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let events = [];
  let layout = [];
  let previousRows = new Map();
  let initialized = false;
  let visible = true;
  let frame = 0;

  const mount = document.getElementById("eventBlockBoard");
  const empty = document.getElementById("eventBlockEmpty");
  const dialog = document.getElementById("eventBlockDetail");

  function completedIds() {
    try { return JSON.parse(localStorage.getItem(COMPLETE_KEY) || "[]").map(String); }
    catch { return []; }
  }

  function saveCompleted(id) {
    try { localStorage.setItem(COMPLETE_KEY, JSON.stringify([...new Set([...completedIds(), String(id)])])); }
    catch (error) { console.debug("event block completion state unavailable", error); }
  }

  function svgNode(name, attributes = {}) {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function easeSpring(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return 1 - Math.exp(-7 * clamped) * Math.cos(10.5 * clamped);
  }

  function animate(duration, update, done, delay = 0) {
    if (prefersReducedMotion?.matches || !visible) { update(1); done?.(); return; }
    const start = performance.now() + delay;
    const tick = (now) => {
      if (now < start) { frame = requestAnimationFrame(tick); return; }
      const progress = Math.min(1, (now - start) / duration);
      update(progress);
      if (progress < 1) frame = requestAnimationFrame(tick); else done?.();
    };
    frame = requestAnimationFrame(tick);
  }

  function targetY(piece) {
    return FLOOR - (piece.targetRow + piece.height) * (CELL + GAP);
  }

  function pieceTransform(piece, y = targetY(piece), sx = 1, sy = 1) {
    const centerX = (piece.minX + piece.width / 2) * (CELL + GAP);
    const bottom = y + piece.height * (CELL + GAP);
    return `translate(8 ${y}) translate(${centerX} ${bottom}) scale(${sx} ${sy}) translate(${-centerX} ${-bottom})`;
  }

  function pieceColor(index) {
    return `url(#eventBlockGradient${index % 4})`;
  }

  function addDefinitions(svg) {
    const defs = svgNode("defs");
    [
      ["#3b88a2", "#1f536e"], ["#9074bc", "#4e427d"],
      ["#4b9b83", "#256052"], ["#b78358", "#765035"],
    ].forEach((colors, index) => {
      const gradient = svgNode("linearGradient", { id: `eventBlockGradient${index}`, x1: "0", y1: "0", x2: "0", y2: "1" });
      gradient.append(svgNode("stop", { offset: "0", "stop-color": colors[0] }), svgNode("stop", { offset: "1", "stop-color": colors[1] }));
      defs.append(gradient);
    });
    const shadow = svgNode("filter", { id: "eventBlockShadow", x: "-30%", y: "-30%", width: "160%", height: "180%" });
    shadow.append(svgNode("feDropShadow", { dx: "0", dy: "3", stdDeviation: "2.5", "flood-color": "#020813", "flood-opacity": ".48" }));
    defs.append(shadow);
    svg.append(defs);
  }

  function renderPiece(svg, piece, index, isNew) {
    const group = svgNode("g", { class: "event-block-piece", role: "button", tabindex: "0", "data-event-block-id": piece.id, "aria-label": `${piece.venueLabel} ${piece.organizerLabel}` });
    piece.cells.forEach((cell) => {
      group.append(svgNode("rect", {
        class: "event-block-cell", x: cell.x * (CELL + GAP), y: (piece.height - cell.y - 1) * (CELL + GAP),
        width: CELL, height: CELL, rx: 3.6, fill: pieceColor(index), "data-cell-x": cell.x, "data-cell-y": cell.y,
      }));
      group.append(svgNode("path", {
        class: "event-block-shine", d: `M${cell.x * (CELL + GAP) + 3} ${(piece.height - cell.y - 1) * (CELL + GAP) + 3}h${CELL - 6}`,
      }));
    });
    const [labelRow, rowCells] = physics.widestRow(piece);
    if (rowCells.length >= 2) {
      const min = Math.min(...rowCells.map((cell) => cell.x));
      const max = Math.max(...rowCells.map((cell) => cell.x));
      const label = svgNode("text", { class: "event-block-label", x: ((min + max + 1) / 2) * (CELL + GAP), y: (piece.height - (labelRow - piece.targetRow) - .5) * (CELL + GAP), "text-anchor": "middle" });
      const venue = svgNode("tspan", { x: label.getAttribute("x"), dy: "-1" });
      venue.textContent = piece.venueLabel;
      label.append(venue);
      if (rowCells.length >= 4) {
        const organizer = svgNode("tspan", { x: label.getAttribute("x"), dy: "7" });
        organizer.textContent = String(piece.organizerLabel).slice(0, 12);
        label.append(organizer);
      }
      group.append(label);
    }
    group.style.transformOrigin = "center bottom";
    group.setAttribute("transform", pieceTransform(piece));
    const activate = () => tapPiece(group, piece);
    group.addEventListener("click", activate);
    group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    svg.append(group);

    const oldRow = previousRows.get(piece.id);
    const fromY = isNew ? -piece.height * (CELL + GAP) - 24 : oldRow != null ? FLOOR - (oldRow + piece.height) * (CELL + GAP) : targetY(piece);
    const distance = Math.abs(fromY - targetY(piece));
    const duration = Math.max(450, Math.min(750, 450 + distance * 1.15));
    const delay = initialized ? 0 : index * 50;
    if (isNew || oldRow !== piece.targetRow) {
      animate(duration, (progress) => {
        const y = fromY + (targetY(piece) - fromY) * easeSpring(progress);
        group.setAttribute("transform", pieceTransform(piece, y));
      }, () => landingSquash(group, piece), delay);
    }
  }

  function landingSquash(group, piece) {
    animate(140, (progress) => {
      const pulse = Math.sin(progress * Math.PI);
      group.setAttribute("transform", pieceTransform(piece, targetY(piece), 1 + pulse * 0.06, 1 - pulse * 0.06));
    }, () => group.setAttribute("transform", pieceTransform(piece)));
  }

  function tapPiece(group, piece) {
    navigator.vibrate?.(10);
    animate(100, (progress) => {
      const pulse = Math.sin(progress * Math.PI);
      group.setAttribute("transform", pieceTransform(piece, targetY(piece), 1 - pulse * 0.035, 1 - pulse * 0.035));
    }, () => { group.setAttribute("transform", pieceTransform(piece)); openDetail(piece); });
  }

  function formatRange(piece) {
    return piece.start === piece.end || !piece.end ? piece.start : `${piece.start} ~ ${piece.end}`;
  }

  function openDetail(piece) {
    if (!dialog) return;
    const event = piece.event;
    dialog.querySelector("[data-event-block-organizer]").textContent = event.companyName || event.organizer || "주최 미정";
    dialog.querySelector("[data-event-block-name]").textContent = event.eventName || "행사명 미정";
    dialog.querySelector("[data-event-block-date]").textContent = formatRange(piece);
    dialog.querySelector("[data-event-block-venue]").textContent = event.venue || piece.venueLabel;
    dialog.querySelector("[data-event-block-people]").textContent = event.guestCount ? `${Number(event.guestCount).toLocaleString("ko-KR")}명` : "인원 미정";
    const schedules = dialog.querySelector("[data-event-block-schedules]");
    schedules.innerHTML = "";
    (event.schedule || []).slice(0, 8).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = [item.date, item.time, item.content, item.venue].filter(Boolean).join(" · ");
      schedules.append(li);
    });
    schedules.hidden = !schedules.children.length;
    const original = dialog.querySelector("[data-event-block-original]");
    original.hidden = !event.storagePath;
    original.onclick = () => window.openStoredExcel?.(event.storagePath, { eventOrderId: event.id, originalFilename: event.originalFilename || "" });
    dialog.querySelector("[data-event-block-complete]").onclick = () => { dialog.close(); completePiece(piece); };
    dialog.showModal();
  }

  function completePiece(piece) {
    const group = [...mount.querySelectorAll("[data-event-block-id]")].find((node) => node.dataset.eventBlockId === piece.id);
    if (!group) return;
    navigator.vibrate?.(20);
    const cells = [...group.querySelectorAll(".event-block-cell, .event-block-shine")];
    animate(260, (progress) => {
      group.style.opacity = String(1 - progress);
      group.setAttribute("transform", pieceTransform(piece, targetY(piece), 1 + progress * 0.08, 1 + progress * 0.08));
      cells.forEach((cell, index) => {
        const direction = index % 2 ? 1 : -1;
        cell.style.transform = `translate(${direction * progress * (5 + index % 4)}px, ${-progress * (4 + index % 3)}px)`;
      });
    }, () => { saveCompleted(piece.id); render({ events }); });
  }

  function render(options = {}) {
    if (!mount || !physics) return;
    events = options.events || events;
    const selectedDate = window.BANQUET_ERP_OPERATION_BOARD?.getSelectedDate?.() || new Date().toISOString().slice(0, 10);
    const next = physics.buildLayout(events, { anchorDate: selectedDate, completedIds: completedIds(), limit: 12 });
    const previousIds = new Set(layout.map((piece) => piece.id));
    cancelAnimationFrame(frame);
    mount.innerHTML = "";
    const svg = svgNode("svg", { class: "event-block-svg", viewBox: `0 0 ${physics.BOARD_COLUMNS * (CELL + GAP) + 16} 340`, preserveAspectRatio: "xMidYMax meet", "aria-label": "테트리스형 행사 블록 보드" });
    addDefinitions(svg);
    const floor = svgNode("line", { class: "event-block-floor", x1: "8", x2: String(physics.BOARD_COLUMNS * (CELL + GAP) + 8), y1: String(FLOOR + 1), y2: String(FLOOR + 1) });
    svg.append(floor);
    next.forEach((piece, index) => renderPiece(svg, piece, index, initialized ? !previousIds.has(piece.id) : true));
    mount.append(svg);
    empty.hidden = Boolean(next.length);
    previousRows = new Map(next.map((piece) => [piece.id, piece.targetRow]));
    layout = next;
    initialized = true;
  }

  dialog?.querySelector("[data-event-block-close]")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  if (mount && "IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 }).observe(mount);

  window.BANQUET_ERP_EVENT_BLOCK_BOARD = { render };
})();
