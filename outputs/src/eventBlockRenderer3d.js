import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const THREE_VERSION = "0.186.1";
export const METABALL_PARAMETERS = Object.freeze({ resolution: 28, strengthBase: 21, subtract: 12, isolation: 80, maxPolyCount: 12000, depth: 0.56 });
export const MATERIAL_PARAMETERS = Object.freeze({ transmission: 0.88, thickness: 0.65, roughness: 0.18, ior: 1.38, clearcoat: 1, clearcoatRoughness: 0.12, specularIntensity: 0.9, dispersion: 0.02 });
export const JELLY_TEST_SHAPES = Object.freeze({
  horizontal2: [[0, 0], [1, 0]],
  square2x2: [[0, 0], [1, 0], [0, 1], [1, 1]],
  lShape: [[0, 0], [1, 0], [0, 1]],
  horizontal4: [[0, 0], [1, 0], [2, 0], [3, 0]],
  stepShape: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]],
});

const COLORS = [0x3aa8cf, 0x9875d2, 0x48b596, 0xd9945e, 0xd56883];
const BOARD_COLUMNS = 24;
const DROP_HEIGHT = 14;

export function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch { return false; }
}

export function metaballForCell(cell, bounds) {
  const domain = Math.max(bounds.width, bounds.height, 1);
  const padX = (domain - bounds.width) / 2;
  const padY = (domain - bounds.height) / 2;
  return {
    x: (cell.x - bounds.minX + 0.5 + padX) / domain,
    y: (cell.y + 0.5 + padY) / domain,
    z: 0.5,
    strength: METABALL_PARAMETERS.strengthBase / (domain * domain),
    subtract: METABALL_PARAMETERS.subtract,
  };
}

export function pieceWorldTarget(piece) {
  return {
    x: (piece.minX + piece.maxX + 1) / 2 - BOARD_COLUMNS / 2,
    y: piece.targetRow + piece.height / 2,
    z: 0,
  };
}

function easeSpring(value) {
  const t = Math.min(1, Math.max(0, value));
  return 1 - Math.exp(-7 * t) * Math.cos(10.5 * t);
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
  object.removeFromParent();
}

export function createEventBlockRenderer3d(options) {
  if (!supportsWebGL()) throw new Error("WebGL unavailable");
  const { mount, onActivate = () => {}, reducedMotion = false } = options;
  const quality = new URLSearchParams(location.search).get("jellyQuality") === "normal" ? "normal" : "high";
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "event-block-webgl";
  renderer.domElement.setAttribute("aria-label", "3D 젤리 행사 블록 보드");

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-12.8, 12.8, 11, -11, 0.1, 80);
  camera.position.set(0, 2.4, 34);
  camera.lookAt(0, 0.35, 0);
  const root = new THREE.Group();
  root.rotation.x = -THREE.MathUtils.degToRad(6);
  root.rotation.y = THREE.MathUtils.degToRad(3);
  root.position.y = -9.2;
  scene.add(root);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.9;
  room.dispose();
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xe4f7ff, 3.2);
  key.position.set(-7, 11, 14);
  const fill = new THREE.PointLight(0x789fd7, 16, 45, 2);
  fill.position.set(10, 2, 12);
  const rim = new THREE.DirectionalLight(0xc59cff, 2.5);
  rim.position.set(8, 7, -10);
  scene.add(key, fill, rim, new THREE.HemisphereLight(0xb7dbe8, 0x06121d, 1.25));

  const labels = document.createElement("div");
  labels.className = "event-block-3d-labels";
  mount.replaceChildren(renderer.domElement, labels);
  mount.classList.add("event-block-board--webgl");

  const records = new Map();
  const animations = new Map();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const projected = new THREE.Vector3();
  let animationFrame = 0;
  let dirty = true;
  let visible = true;
  let destroyed = false;
  let testMode = false;

  function createMaterial(color) {
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      opacity: 1,
      transparent: false,
      attenuationColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.22),
      attenuationDistance: 2.8,
      envMapIntensity: 1.25,
      ...MATERIAL_PARAMETERS,
    });
  }

  function createMarchingMesh(piece, material) {
    const mesh = new MarchingCubes(METABALL_PARAMETERS.resolution, material, false, false, METABALL_PARAMETERS.maxPolyCount);
    const bounds = { minX: piece.minX, width: piece.width, height: piece.height };
    mesh.isolation = METABALL_PARAMETERS.isolation;
    mesh.reset();
    piece.cells.forEach((cell) => {
      const ball = metaballForCell(cell, bounds);
      mesh.addBall(ball.x, ball.y, ball.z, ball.strength, ball.subtract);
    });
    mesh.blur(1);
    mesh.update();
    const domain = Math.max(piece.width, piece.height, 1);
    mesh.scale.set(domain / 2, domain / 2, METABALL_PARAMETERS.depth / 2);
    mesh.castShadow = false;
    return mesh;
  }

  function createRoundedFallback(piece, material) {
    const group = new THREE.Group();
    const centerX = (piece.minX + piece.maxX + 1) / 2;
    const centerY = piece.height / 2;
    piece.cells.forEach((cell) => {
      const geometry = new RoundedBoxGeometry(0.995, 0.995, METABALL_PARAMETERS.depth, 3, 0.24);
      const cellMesh = new THREE.Mesh(geometry, material);
      cellMesh.position.set(cell.x + 0.5 - centerX, cell.y + 0.5 - centerY, 0);
      group.add(cellMesh);
    });
    return group;
  }

  function createLabel(piece) {
    const label = document.createElement("button");
    label.type = "button";
    label.className = "event-block-3d-label";
    label.dataset.eventBlock3dLabel = piece.id;
    label.innerHTML = `<strong></strong><span></span>`;
    label.querySelector("strong").textContent = piece.venueLabel;
    label.querySelector("span").textContent = piece.cells.length >= 4 ? String(piece.organizerLabel).slice(0, 12) : "";
    label.setAttribute("aria-label", `${piece.venueLabel} ${piece.organizerLabel}`);
    label.onclick = () => pressPiece(piece.id);
    labels.append(label);
    return label;
  }

  function createRecord(piece, index) {
    const material = createMaterial(COLORS[index % COLORS.length]);
    let object;
    try { object = quality === "high" ? createMarchingMesh(piece, material) : createRoundedFallback(piece, material); }
    catch (error) {
      console.warn("MarchingCubes failed; using rounded 3D fallback", error);
      object = createRoundedFallback(piece, material);
    }
    const group = new THREE.Group();
    object.traverse((child) => { if (child.isMesh) child.userData.pieceId = piece.id; });
    group.add(object);
    const target = pieceWorldTarget(piece);
    group.position.set(target.x, target.y, target.z);
    root.add(group);
    return { id: piece.id, piece, group, object, material, label: createLabel(piece), target, height: piece.height };
  }

  function applyJellyTransform(record, scaleX, scaleY, rotationZ = 0, centerY = record.target.y) {
    record.group.scale.set(scaleX, scaleY, (scaleX + scaleY) / 2);
    record.group.rotation.z = rotationZ;
    record.group.position.y = centerY + record.height / 2 * (scaleY - 1);
  }

  function addAnimation(keyName, duration, update, complete, delay = 0) {
    if (reducedMotion || !visible) { update(1); complete?.(); requestRender(); return; }
    animations.set(keyName, { start: performance.now() + delay, duration, update, complete });
    requestRender();
  }

  function landingWobble(record) {
    addAnimation(`land:${record.id}`, 390, (progress) => {
      const wave = Math.exp(-4.8 * progress) * Math.cos(progress * Math.PI * 5);
      applyJellyTransform(record, 1 + wave * .11, 1 - wave * .12, wave * .018);
    }, () => applyJellyTransform(record, 1, 1, 0));
  }

  function dropRecord(record, fromY, delay = 0) {
    const targetY = record.target.y;
    addAnimation(`move:${record.id}`, Math.max(480, Math.min(760, 500 + Math.abs(fromY - targetY) * 18)), (progress) => {
      const amount = easeSpring(progress);
      const y = THREE.MathUtils.lerp(fromY, targetY, amount);
      record.group.scale.set(.95, 1.08, 1);
      record.group.position.y = y + record.height * .04;
    }, () => landingWobble(record), delay);
  }

  function pressPiece(id) {
    const record = records.get(String(id));
    if (!record || animations.has(`complete:${record.id}`)) return;
    addAnimation(`press:${record.id}`, 210, (progress) => {
      const pulse = Math.sin(progress * Math.PI);
      applyJellyTransform(record, 1 + pulse * .07, 1 - pulse * .08, Math.sin(progress * Math.PI * 2) * .012);
    }, () => { applyJellyTransform(record, 1, 1, 0); onActivate(record.id); });
  }

  function complete(id, done) {
    const record = records.get(String(id));
    if (!record) { done?.(); return; }
    record.material.transparent = true;
    addAnimation(`complete:${record.id}`, 330, (progress) => {
      const inflate = progress < .3 ? 1 + progress / .3 * .1 : THREE.MathUtils.lerp(1.1, .08, (progress - .3) / .7);
      applyJellyTransform(record, inflate, inflate, Math.sin(progress * Math.PI * 3) * .025);
      record.material.opacity = progress < .3 ? 1 : 1 - (progress - .3) / .7;
      record.material.transmission = THREE.MathUtils.lerp(MATERIAL_PARAMETERS.transmission, .99, progress);
    }, () => {
      removeRecord(record.id);
      done?.();
    });
  }

  function removeRecord(id) {
    const record = records.get(String(id));
    if (!record) return;
    [...animations.keys()].filter((keyName) => keyName.endsWith(`:${record.id}`)).forEach((keyName) => animations.delete(keyName));
    record.label.remove();
    disposeObject(record.group);
    records.delete(record.id);
    dirty = true;
  }

  function updateLabels() {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    records.forEach((record) => {
      record.group.getWorldPosition(projected);
      projected.project(camera);
      record.label.style.transform = `translate(-50%, -50%) translate(${(projected.x * .5 + .5) * width}px, ${(-projected.y * .5 + .5) * height}px)`;
      record.label.hidden = projected.z < -1 || projected.z > 1;
    });
  }

  function renderFrame(now) {
    animationFrame = 0;
    if (destroyed || !visible) return;
    animations.forEach((animation, keyName) => {
      if (now < animation.start) return;
      const progress = Math.min(1, (now - animation.start) / animation.duration);
      animation.update(progress);
      if (progress >= 1) { animations.delete(keyName); animation.complete?.(); }
    });
    renderer.render(scene, camera);
    updateLabels();
    dirty = false;
    if (animations.size) requestRender();
  }

  function requestRender() {
    dirty = true;
    if (!animationFrame && visible && !destroyed) animationFrame = requestAnimationFrame(renderFrame);
  }

  function resize() {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(360, mount.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewWidth = testMode ? 17 : 26;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewWidth / aspect / 2;
    camera.bottom = -viewWidth / aspect / 2;
    camera.updateProjectionMatrix();
    root.position.y = testMode ? -3.2 : camera.bottom + 1.4;
    requestRender();
  }

  function render({ pieces, previousRows = new Map() }) {
    const firstScene = records.size === 0;
    const nextIds = new Set(pieces.map((piece) => String(piece.id)));
    [...records.keys()].filter((id) => !nextIds.has(id) && !animations.has(`complete:${id}`)).forEach(removeRecord);
    pieces.forEach((piece, index) => {
      const id = String(piece.id);
      const target = pieceWorldTarget(piece);
      let record = records.get(id);
      if (!record) {
        record = createRecord(piece, index);
        records.set(id, record);
        const fromY = target.y + DROP_HEIGHT;
        record.group.position.y = fromY;
        dropRecord(record, fromY, firstScene ? index * 55 : 0);
        return;
      }
      const oldRow = previousRows.get(id);
      record.piece = piece;
      record.target = target;
      record.group.position.x = target.x;
      if (oldRow != null && oldRow !== piece.targetRow) dropRecord(record, oldRow + piece.height / 2, index * 28);
      else { record.group.position.y = target.y; requestRender(); }
    });
  }

  function renderTestShapes() {
    testMode = true;
    const placements = [{ x: 5, row: 0 }, { x: 9, row: 3 }, { x: 5, row: 4 }, { x: 9, row: 0 }, { x: 13, row: 4 }];
    const pieces = Object.entries(JELLY_TEST_SHAPES).map(([id, cells], index) => {
      const placement = placements[index];
      const normalized = cells.map(([x, y]) => ({ x: x + placement.x, y, boardY: placement.row + y }));
      const xs = normalized.map((cell) => cell.x);
      const height = Math.max(...normalized.map((cell) => cell.y)) + 1;
      return { id: `test:${id}`, cells: normalized, minX: Math.min(...xs), maxX: Math.max(...xs), width: Math.max(...xs) - Math.min(...xs) + 1, height, targetRow: placement.row, venueLabel: id, organizerLabel: "Jelly Render Test" };
    });
    render({ pieces });
    resize();
  }

  function pointerPosition(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  renderer.domElement.addEventListener("pointerup", (event) => {
    pointerPosition(event);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...records.values()].map((record) => record.group), true).find((item) => item.object.userData.pieceId);
    if (hit) pressPiece(hit.object.userData.pieceId);
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible && (dirty || animations.size)) requestRender(); }, { threshold: .02 });
  intersectionObserver.observe(mount);
  document.addEventListener("visibilitychange", () => { visible = document.visibilityState !== "hidden"; if (visible) requestRender(); });
  resize();

  function dispose() {
    destroyed = true;
    cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    [...records.keys()].forEach(removeRecord);
    environment.dispose();
    renderer.dispose();
    labels.remove();
    renderer.domElement.remove();
  }

  return { mode: quality, render, complete, renderTestShapes, dispose };
}
