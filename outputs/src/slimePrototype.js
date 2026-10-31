import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SLIME_SHAPES, buildRoundedShapeFromCells } from "./slimeShapeGenerator.js?v=slime-shape-v2";

const THREE_VERSION = "0.186.1";
const GEOMETRY = Object.freeze({ cellSize: 1.6, depth: 1.45, radius: 0.58, concaveRadius: 0.28, bevelThickness: 0.38, bevelSize: 0.34, bevelSegments: 12, curveSegments: 20, steps: 1 });
const DEFAULTS = Object.freeze({ transmission: 0.86, roughness: 0.13, thickness: 2.25, ior: 1.42, clearcoat: 1, attenuationDistance: 2.8, bevelSize: GEOMETRY.bevelSize, wobble: 1 });
const PHYSICS = Object.freeze({ gravity: -22, spring: 128, damping: 13.5, floorY: -2.42 });
const SLIME_BLOCKS = Object.freeze([
  Object.freeze({ key: "horizontal2", label: "카1", color: 0x42ced5 }),
  Object.freeze({ key: "square2x2", label: "부1+2", color: 0x63d59c }),
  Object.freeze({ key: "horizontal4", label: "부1+2+3", color: 0xf0bd57 }),
  Object.freeze({ key: "vertical4", label: "컨AB", color: 0xb38aef }),
  Object.freeze({ key: "lShape", label: "L shape", color: 0xf07b93 }),
  Object.freeze({ key: "stepShape", label: "step", color: 0x66a8f2 }),
]);
const requestedCount = Math.min(10, Math.max(6, Number(new URLSearchParams(window.location.search).get("stress")) || 6));
const PROTOTYPE_BLOCKS = Array.from({ length: requestedCount }, (_, index) => ({
  ...SLIME_BLOCKS[index % SLIME_BLOCKS.length],
  instanceId: `${SLIME_BLOCKS[index % SLIME_BLOCKS.length].key}-${index}`,
}));

const stage = document.getElementById("slimeStage");
const fallback = document.getElementById("slimeFallback");
const fpsOutput = document.getElementById("slimeFps");
const labelsRoot = document.getElementById("slimeLabels");
const controlFields = document.getElementById("slimeControlFields");
const resetButton = document.getElementById("slimeReset");
const config = { ...DEFAULTS };

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch { return false; }
}

function makeGeometry(matrix, bevelSize) {
  const shape = buildRoundedShapeFromCells(matrix, { cellSize: GEOMETRY.cellSize, radius: GEOMETRY.radius, concaveRadius: GEOMETRY.concaveRadius });
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: GEOMETRY.depth,
    bevelEnabled: true,
    bevelThickness: GEOMETRY.bevelThickness,
    bevelSize,
    bevelSegments: GEOMETRY.bevelSegments,
    curveSegments: GEOMETRY.curveSegments,
    steps: GEOMETRY.steps,
  });
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function makeContactShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(96, 96, 10, 96, 96, 92);
  gradient.addColorStop(0, "rgba(0, 0, 0, .58)");
  gradient.addColorStop(.42, "rgba(0, 0, 0, .3)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createJellyMaterial(color) {
  const uniforms = { uImpact: { value: 0 }, uWobbleTime: { value: 0 }, uHalfHeight: { value: 2 } };
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(.12),
    emissiveIntensity: .42,
    side: THREE.DoubleSide,
    metalness: 0,
    transparent: false,
    opacity: 1,
    transmission: config.transmission,
    roughness: config.roughness,
    thickness: config.thickness,
    ior: config.ior,
    clearcoat: config.clearcoat,
    clearcoatRoughness: 0.08,
    specularIntensity: 1,
    attenuationColor: new THREE.Color(color).multiplyScalar(0.72),
    attenuationDistance: config.attenuationDistance,
    envMapIntensity: 1.55,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uImpact;\nuniform float uWobbleTime;\nuniform float uHalfHeight;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float jellyWeight = smoothstep(0.08, 1.0, (position.y + uHalfHeight) / (uHalfHeight * 2.0));
        float jellyWave = sin(position.y * 2.4 + uWobbleTime * 11.0) * uImpact * jellyWeight;
        transformed.x += jellyWave * 0.11;
        transformed.z += cos(position.x * 2.1 + uWobbleTime * 9.0) * uImpact * jellyWeight * 0.08;`);
  };
  material.customProgramCacheKey = () => "slime-prototype-deform-v2";
  return { material, uniforms };
}

function createControls(onGeometryChange, onReset) {
  const fields = [
    ["transmission", 0, 1, .01], ["roughness", .02, .6, .01], ["thickness", .1, 5, .05],
    ["ior", 1, 2.1, .01], ["clearcoat", 0, 1, .01], ["attenuationDistance", .3, 8, .1],
    ["bevelSize", .08, .6, .01], ["wobble", 0, 1.8, .05],
  ];
  fields.forEach(([key, min, max, step]) => {
    const label = document.createElement("label");
    const name = document.createElement("span");
    const value = document.createElement("output");
    const input = document.createElement("input");
    name.textContent = key;
    value.textContent = String(config[key]);
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(config[key]);
    input.dataset.slimeControl = key;
    input.addEventListener("input", () => {
      config[key] = Number(input.value);
      value.textContent = Number(input.value).toFixed(step < .1 ? 2 : 1);
      if (key === "bevelSize") onGeometryChange();
    });
    label.append(name, value, input);
    controlFields.append(label);
  });
  resetButton.addEventListener("click", onReset);
}

function initialize() {
  if (!supportsWebGL()) {
    fallback.hidden = false;
    fallback.textContent = "WebGL을 사용할 수 없어 3D 슬라임을 표시할 수 없습니다.";
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "slime-canvas";
  renderer.domElement.setAttribute("aria-label", `Three.js ${THREE_VERSION} 단일 3D 슬라임`);
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x061522);
  scene.fog = new THREE.Fog(0x061522, 16, 28);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.set(0.3, 1.75, 15.6);
  camera.lookAt(0, -0.35, 0);

  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, 0.025).texture;
  scene.environment = environment;
  scene.environmentIntensity = 1.05;
  environmentScene.dispose();
  pmrem.dispose();

  const slimes = PROTOTYPE_BLOCKS.map((definition, index) => {
    const geometry = makeGeometry(SLIME_SHAPES[definition.key], config.bevelSize);
    const { material, uniforms } = createJellyMaterial(definition.color);
    const mesh = new THREE.Mesh(geometry, material);
    const geometrySize = new THREE.Vector3();
    geometry.boundingBox.getSize(geometrySize);
    const halfHeight = geometrySize.y / 2;
    uniforms.uHalfHeight.value = halfHeight;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.slimeKey = definition.key;
    scene.add(mesh);
    const label = document.createElement("span");
    label.textContent = definition.label;
    label.style.setProperty("--slime-label-color", `#${definition.color.toString(16).padStart(6, "0")}`);
    labelsRoot.append(label);
    return {
      ...definition,
      geometry,
      geometrySize,
      halfHeight,
      targetFloorY: PHYSICS.floorY + halfHeight + .035,
      massFactor: Math.max(.8, Math.min(1.45, Math.sqrt(SLIME_SHAPES[definition.key].flat().filter(Boolean).length / 4))),
      mesh,
      material,
      uniforms,
      label,
      contactShadow: null,
      shadowMaterial: null,
      anchor: { x: 0, z: 0 },
      motion: { phase: "delay", delay: index * .12, y: 0, velocityY: 0, deformation: 0, deformationVelocity: 0, pressing: false },
    };
  });
  const debugState = {
    meshCount: slimes.length,
    geometryCount: slimes.length,
    triangles: slimes.map((slime) => slime.geometry.index ? slime.geometry.index.count / 3 : slime.geometry.attributes.position.count / 3),
    fps: 0,
  };
  window.__SLIME_PROTOTYPE_V2__ = debugState;
  stage.dataset.meshCount = String(debugState.meshCount);
  stage.dataset.geometryCount = String(debugState.geometryCount);
  stage.dataset.triangles = debugState.triangles.join(",");
  stage.dataset.geometrySizes = slimes.map((slime) => slime.geometrySize.toArray().map((value) => value.toFixed(2)).join("x")).join(",");

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x0b2231, roughness: .78, metalness: .08 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 18), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = PHYSICS.floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  const contactShadowTexture = makeContactShadowTexture();
  slimes.forEach((slime) => {
    slime.shadowMaterial = new THREE.MeshBasicMaterial({ map: contactShadowTexture, transparent: true, opacity: .34, depthWrite: false });
    slime.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), slime.shadowMaterial);
    slime.contactShadow.rotation.x = -Math.PI / 2;
    slime.contactShadow.position.y = PHYSICS.floorY + .015;
    scene.add(slime.contactShadow);
  });

  const key = new THREE.DirectionalLight(0xf0fbff, 4.2);
  key.position.set(-5.5, 9, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0004;
  const softKey = new THREE.RectAreaLight(0xc9f6ff, 14, 5.5, 2.2);
  softKey.position.set(-4.5, 5.8, 6.5);
  softKey.lookAt(0, 0, 0);
  const fill = new THREE.PointLight(0x527fca, 24, 32, 2);
  fill.position.set(5.5, 1, 6);
  const rim = new THREE.PointLight(0xb882ff, 30, 28, 2);
  rim.position.set(3.5, 5, -5);
  scene.add(key, softKey, fill, rim, new THREE.HemisphereLight(0x8dc6d8, 0x041019, 1.1));

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let activeSlime = null;
  let elapsed = 0;
  let lastTime = performance.now();
  let fpsStarted = lastTime;
  let fpsFrames = 0;

  function layoutSlimes() {
    const compact = camera.aspect < .78;
    const columns = compact ? 2 : Math.min(5, Math.ceil(slimes.length / 2));
    const rows = Math.ceil(slimes.length / columns);
    const xSpan = compact ? 7.6 : Math.min(20, (columns - 1) * 8);
    const zSpan = compact ? Math.min(14, (rows - 1) * 6) : Math.min(7, (rows - 1) * 6);
    const positions = slimes.map((_, index) => {
      const column = index % columns; const row = Math.floor(index / columns);
      return [columns === 1 ? 0 : -xSpan / 2 + xSpan * column / (columns - 1), rows === 1 ? 0 : -zSpan / 2 + zSpan * row / (rows - 1)];
    });
    slimes.forEach((slime, index) => {
      [slime.anchor.x, slime.anchor.z] = positions[index];
      slime.mesh.position.x = slime.anchor.x;
      slime.mesh.position.z = slime.anchor.z;
      slime.contactShadow.position.x = slime.anchor.x;
      slime.contactShadow.position.z = slime.anchor.z + .15;
    });
  }

  function frameCamera() {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const paddedWidth = camera.aspect < .78 ? 16 : 23;
    const paddedHeight = 12;
    const heightDistance = paddedHeight / 2 / Math.tan(verticalFov / 2);
    const widthDistance = paddedWidth / 2 / (Math.tan(verticalFov / 2) * Math.max(.45, camera.aspect));
    const distance = Math.max(18, heightDistance, widthDistance);
    camera.position.set(0, camera.aspect < .78 ? 20 : 12, distance);
    camera.lookAt(0, -.35, 0);
  }

  function updateGeometry() {
    slimes.forEach((slime) => {
      const next = makeGeometry(SLIME_SHAPES[slime.key], config.bevelSize);
      slime.geometry.dispose();
      slime.geometry = next;
      slime.mesh.geometry = next;
      next.boundingBox.getSize(slime.geometrySize);
      slime.halfHeight = slime.geometrySize.y / 2;
      slime.targetFloorY = PHYSICS.floorY + slime.halfHeight + .035;
      slime.uniforms.uHalfHeight.value = slime.halfHeight;
      if (!["drop", "delay"].includes(slime.motion.phase)) slime.motion.y = slime.targetFloorY;
    });
    frameCamera();
  }

  function resetDrop() {
    activeSlime = null;
    slimes.forEach((slime, index) => {
      const { motion } = slime;
      motion.phase = "delay";
      motion.delay = index * .12;
      motion.y = slime.targetFloorY + Math.max(8, slime.geometrySize.y * 1.15);
      motion.velocityY = 0;
      motion.deformation = 0;
      motion.deformationVelocity = 0;
      motion.pressing = false;
      slime.mesh.position.y = motion.y;
      slime.mesh.rotation.set(0, 0, 0);
      slime.mesh.scale.set(1, 1, 1);
    });
  }

  function updateMotion(slime, delta) {
    const { mesh, motion } = slime;
    if (motion.phase === "delay") {
      motion.delay -= delta;
      if (motion.delay > 0) return;
      motion.phase = "drop";
    }
    if (motion.phase === "drop") {
      motion.velocityY += PHYSICS.gravity * delta;
      motion.y += motion.velocityY * delta;
      const stretch = Math.min(.075, Math.abs(motion.velocityY) * .0045);
      mesh.scale.set(1 - stretch * .42, 1 + stretch, 1 - stretch * .32);
      mesh.position.y = motion.y;
      slime.uniforms.uImpact.value = stretch * .42;
      if (motion.y <= slime.targetFloorY) {
        motion.phase = "spring";
        motion.y = slime.targetFloorY;
        motion.deformation = -.16;
        motion.deformationVelocity = Math.min(2.2, Math.abs(motion.velocityY) * .13);
        motion.velocityY = 0;
      }
    } else {
      const target = motion.pressing ? -.13 : 0;
      const spring = PHYSICS.spring / slime.massFactor;
      const damping = PHYSICS.damping * Math.sqrt(slime.massFactor);
      const acceleration = (target - motion.deformation) * spring - motion.deformationVelocity * damping;
      motion.deformationVelocity += acceleration * delta;
      motion.deformation += motion.deformationVelocity * delta;
      const wobble = config.wobble;
      const vertical = 1 + motion.deformation * wobble;
      const horizontal = 1 - motion.deformation * .62 * wobble;
      mesh.scale.set(horizontal, vertical, horizontal);
      mesh.position.y = slime.targetFloorY + slime.halfHeight * (vertical - 1);
      mesh.rotation.z = motion.deformationVelocity * .007 * wobble;
      slime.uniforms.uImpact.value = Math.min(.17, (Math.abs(motion.deformation) * .7 + Math.abs(motion.deformationVelocity) * .018) * wobble);
    }
    const compression = Math.max(0, 1 - mesh.scale.y);
    slime.contactShadow.scale.set(slime.geometrySize.x * 1.12 * (1 + compression * 1.45), Math.max(2.7, slime.geometrySize.z * 2.15) * (1 + compression * .7), 1);
    slime.shadowMaterial.opacity = .3 + compression * .55;
  }

  function syncMaterial() {
    slimes.forEach(({ material }) => {
      material.transmission = config.transmission;
      material.roughness = config.roughness;
      material.thickness = config.thickness;
      material.ior = config.ior;
      material.clearcoat = config.clearcoat;
      material.attenuationDistance = config.attenuationDistance;
    });
  }

  function setPointer(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    pointer.y = -(event.clientY - bounds.top) / bounds.height * 2 + 1;
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(slimes.map((slime) => slime.mesh), false)[0];
    const slime = hit && slimes.find((item) => item.mesh === hit.object);
    if (!slime || ["drop", "delay"].includes(slime.motion.phase)) return;
    renderer.domElement.setPointerCapture(event.pointerId);
    activeSlime = slime;
    stage.dataset.lastTap = slime.key;
    slime.motion.pressing = true;
    slime.motion.deformationVelocity -= .45;
  });
  const release = (event) => {
    if (!activeSlime?.motion.pressing) return;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    activeSlime.motion.pressing = false;
    activeSlime.motion.deformationVelocity += .72 * config.wobble;
    activeSlime = null;
  };
  renderer.domElement.addEventListener("pointerup", release);
  renderer.domElement.addEventListener("pointercancel", release);

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    layoutSlimes();
    frameCamera();
  }

  const labelPosition = new THREE.Vector3();
  function updateLabels() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    slimes.forEach((slime) => {
      labelPosition.set(slime.mesh.position.x, slime.mesh.position.y + slime.halfHeight * slime.mesh.scale.y + .45, slime.mesh.position.z).project(camera);
      slime.label.style.transform = `translate(-50%, -50%) translate(${(labelPosition.x * .5 + .5) * width}px, ${(-labelPosition.y * .5 + .5) * height}px)`;
      slime.label.hidden = labelPosition.z < -1 || labelPosition.z > 1;
    });
  }

  function animate(now) {
    const delta = Math.min(.033, Math.max(.001, (now - lastTime) / 1000));
    lastTime = now;
    elapsed += delta;
    syncMaterial();
    slimes.forEach((slime, index) => {
      updateMotion(slime, delta);
      slime.uniforms.uWobbleTime.value = elapsed + index * .13;
    });
    updateLabels();
    renderer.render(scene, camera);
    fpsFrames += 1;
    if (now - fpsStarted >= 600) {
      debugState.fps = Math.round(fpsFrames * 1000 / (now - fpsStarted));
      fpsOutput.value = `${debugState.fps} FPS`;
      stage.dataset.fps = String(debugState.fps);
      stage.dataset.transforms = slimes.map((slime) => [slime.mesh.position.x, slime.mesh.position.y, slime.mesh.position.z, slime.mesh.scale.x, slime.mesh.scale.y].map((value) => value.toFixed(2)).join(":")).join(",");
      fpsFrames = 0;
      fpsStarted = now;
    }
    requestAnimationFrame(animate);
  }

  createControls(updateGeometry, resetDrop);
  resetDrop();
  new ResizeObserver(resize).observe(stage);
  resize();
  requestAnimationFrame(animate);
}

try { initialize(); }
catch (error) {
  fallback.hidden = false;
  fallback.textContent = "3D 슬라임 renderer를 초기화하지 못했습니다.";
  console.error("slime prototype initialization failed", error);
}
