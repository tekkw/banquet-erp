import * as THREE from "three";

export const SLIME_SHAPES = Object.freeze({
  horizontal2: Object.freeze([[1, 1]]),
  square2x2: Object.freeze([[1, 1], [1, 1]]),
  horizontal4: Object.freeze([[1, 1, 1, 1]]),
  vertical4: Object.freeze([[1], [1], [1], [1]]),
  lShape: Object.freeze([[1, 0], [1, 1]]),
  stepShape: Object.freeze([[1, 1, 0], [0, 1, 1]]),
});

export function analyzeOccupancy(matrix) {
  if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0]) || !matrix[0].length) throw new Error("occupancy matrix is required");
  const columns = matrix[0].length;
  if (matrix.some((row) => !Array.isArray(row) || row.length !== columns)) throw new Error("occupancy rows must have equal width");
  const cells = [];
  matrix.forEach((row, y) => row.forEach((value, x) => { if (value) cells.push({ x, y }); }));
  if (!cells.length) throw new Error("occupancy must contain at least one active cell");
  return { rows: matrix.length, columns, cells, activeCount: cells.length };
}

export function occupancyBoundaryEdges(matrix) {
  const occupancy = analyzeOccupancy(matrix);
  const active = new Set(occupancy.cells.map((cell) => `${cell.x}:${cell.y}`));
  const edges = [];
  occupancy.cells.forEach(({ x, y }) => {
    if (!active.has(`${x}:${y - 1}`)) edges.push({ from: [x, y], to: [x + 1, y], direction: 0 });
    if (!active.has(`${x + 1}:${y}`)) edges.push({ from: [x + 1, y], to: [x + 1, y + 1], direction: 1 });
    if (!active.has(`${x}:${y + 1}`)) edges.push({ from: [x + 1, y + 1], to: [x, y + 1], direction: 2 });
    if (!active.has(`${x - 1}:${y}`)) edges.push({ from: [x, y + 1], to: [x, y], direction: 3 });
  });
  return { ...occupancy, edges };
}

export function traceOccupancyLoops(matrix) {
  const boundary = occupancyBoundaryEdges(matrix);
  const remaining = boundary.edges.map((edge) => ({ ...edge }));
  const loops = [];
  while (remaining.length) {
    remaining.sort((a, b) => a.from[1] - b.from[1] || a.from[0] - b.from[0] || a.direction - b.direction);
    const first = remaining.shift();
    const loop = [first.from, first.to];
    let current = first;
    let guard = 0;
    while ((current.to[0] !== first.from[0] || current.to[1] !== first.from[1]) && guard <= boundary.edges.length) {
      const candidates = remaining.filter((edge) => edge.from[0] === current.to[0] && edge.from[1] === current.to[1]);
      const directionOrder = [(current.direction + 1) % 4, current.direction, (current.direction + 3) % 4, (current.direction + 2) % 4];
      const next = candidates.sort((a, b) => directionOrder.indexOf(a.direction) - directionOrder.indexOf(b.direction))[0];
      if (!next) throw new Error("occupancy boundary is not traceable");
      remaining.splice(remaining.indexOf(next), 1);
      current = next;
      loop.push(next.to);
      guard += 1;
    }
    if (loop.at(-1)[0] !== loop[0][0] || loop.at(-1)[1] !== loop[0][1]) throw new Error("occupancy boundary did not close");
    loop.pop();
    loops.push(loop);
  }
  return { ...boundary, loops };
}

function simplifyLoop(points) {
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
  });
}

function signedArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function roundedCorners(loop, bounds, options) {
  const points = simplifyLoop(loop).map(([x, y]) => ({
    x: (x - bounds.columns / 2) * options.cellSize,
    y: (bounds.rows / 2 - y) * options.cellSize,
  }));
  const orientation = Math.sign(signedArea(points)) || 1;
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incoming = { x: point.x - previous.x, y: point.y - previous.y };
    const outgoing = { x: next.x - point.x, y: next.y - point.y };
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const convex = Math.sign(cross) === orientation;
    const beforeLength = Math.hypot(previous.x - point.x, previous.y - point.y);
    const afterLength = Math.hypot(next.x - point.x, next.y - point.y);
    const requestedRadius = convex ? options.radius : options.concaveRadius;
    const radius = Math.min(requestedRadius, beforeLength * .42, afterLength * .42);
    return {
      point,
      before: { x: point.x + (previous.x - point.x) * radius / beforeLength, y: point.y + (previous.y - point.y) * radius / beforeLength },
      after: { x: point.x + (next.x - point.x) * radius / afterLength, y: point.y + (next.y - point.y) * radius / afterLength },
    };
  });
}

function drawRoundedLoop(path, corners) {
  path.moveTo(corners[0].before.x, corners[0].before.y);
  corners.forEach((corner, index) => {
    path.quadraticCurveTo(corner.point.x, corner.point.y, corner.after.x, corner.after.y);
    const next = corners[(index + 1) % corners.length];
    path.lineTo(next.before.x, next.before.y);
  });
  path.closePath();
}

export function buildRoundedShapeFromCells(matrix, options = {}) {
  const settings = {
    cellSize: Number(options.cellSize) || 2,
    radius: Number(options.radius) || .72,
    concaveRadius: Number(options.concaveRadius) || .38,
  };
  const traced = traceOccupancyLoops(matrix);
  const ranked = traced.loops.map((loop) => ({ loop, corners: roundedCorners(loop, traced, settings) }))
    .sort((a, b) => Math.abs(signedArea(b.corners.map((corner) => corner.point))) - Math.abs(signedArea(a.corners.map((corner) => corner.point))));
  const shape = new THREE.Shape();
  drawRoundedLoop(shape, ranked[0].corners);
  ranked.slice(1).forEach((entry) => {
    const hole = new THREE.Path();
    drawRoundedLoop(hole, entry.corners);
    shape.holes.push(hole);
  });
  shape.userData = {
    occupancy: { rows: traced.rows, columns: traced.columns, activeCount: traced.activeCount },
    contourCount: ranked.length,
  };
  return shape;
}
