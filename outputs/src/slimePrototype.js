import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SLIME_SHAPES, buildRoundedShapeFromCells } from "./slimeShapeGenerator.js?v=slime-shape-v2";

const THREE_VERSION = "0.186.1";
const GEOMETRY = Object.freeze({ width: 4, height: 4, depth: 1.45, radius: 0.72, bevelThickness: 0.38, bevelSize: 0.34, bevelSegments: 12, curveSegments: 20, steps: 1 });
const DEFAULTS = Object.freeze({ transmission: 0.86, roughness: 0.13, thickness: 2.25, ior: 1.42, clearcoat: 1, attenuationDistance: 2.8, bevelSize: GEOMETRY.bevelSize, wobble: 1 });
const PHYSICS = Object.freeze({ gravity: -22, spring: 128, damping: 13.5, floorY: -2.42 });

const stage = document.getElementById("slimeStage");
const fallback = document.getElementById("slimeFallback");
const fpsOutput = document.getElementById("slimeFps");
const controlFields = document.getElementById("slimeControlFields");
const resetButton = document.getElementById("slimeReset");
const shapePicker = document.getElementById("slimeShapePicker");
const config = { ...DEFAULTS };
let selectedShapeKey = "square2x2";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch { return false; }
}

function makeGeometry(matrix, bevelSize) {
  const shape = buildRoundedShapeFromCells(matrix, { cellSize: 2, radius: GEOMETRY.radius, concaveRadius: .38 });
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

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x37c7d5,
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
    attenuationColor: new THREE.Color(0x16aabd),
    attenuationDistance: config.attenuationDistance,
    envMapIntensity: 1.35,
  });

  const shaderUniforms = { uImpact: { value: 0 }, uWobbleTime: { value: 0 }, uHalfHeight: { value: GEOMETRY.height / 2 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shaderUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uImpact;\nuniform float uWobbleTime;\nuniform float uHalfHeight;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float jellyWeight = smoothstep(0.08, 1.0, (position.y + uHalfHeight) / (uHalfHeight * 2.0));
        float jellyWave = sin(position.y * 2.4 + uWobbleTime * 11.0) * uImpact * jellyWeight;
        transformed.x += jellyWave * 0.11;
        transformed.z += cos(position.x * 2.1 + uWobbleTime * 9.0) * uImpact * jellyWeight * 0.08;`);
  };
  material.customProgramCacheKey = () => "slime-prototype-deform-v1";

  let geometry = makeGeometry(SLIME_SHAPES[selectedShapeKey], config.bevelSize);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x0b2231, roughness: .78, metalness: .08 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 18), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = PHYSICS.floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  const shadowMaterial = new THREE.MeshBasicMaterial({ map: makeContactShadowTexture(), transparent: true, opacity: .34, depthWrite: false });
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, PHYSICS.floorY + .015, .15);
  scene.add(contactShadow);

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
  const motion = { phase: "drop", y: 0, velocityY: 0, deformation: 0, deformationVelocity: 0, pressing: false };
  let halfHeight = 2.25;
  let targetFloorY = 0;
  let geometrySize = new THREE.Vector3(4.8, 4.8, 2.2);
  let massFactor = 1;
  let shadowWidth = 5.4;
  let shadowDepth = 3.4;
  let elapsed = 0;
  let lastTime = performance.now();
  let fpsStarted = lastTime;
  let fpsFrames = 0;

  function frameCamera() {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const paddedWidth = geometrySize.x + 3.4;
    const paddedHeight = geometrySize.y + 4.2;
    const heightDistance = paddedHeight / 2 / Math.tan(verticalFov / 2);
    const widthDistance = paddedWidth / 2 / (Math.tan(verticalFov / 2) * Math.max(.45, camera.aspect));
    const distance = Math.max(10.5, heightDistance, widthDistance);
    const lookY = targetFloorY + geometrySize.y * .06;
    camera.position.set(geometrySize.x * .018, lookY + Math.min(2.3, geometrySize.y * .4), distance);
    camera.lookAt(0, lookY, 0);
  }

  function updateGeometry() {
    const matrix = SLIME_SHAPES[selectedShapeKey];
    const next = makeGeometry(matrix, config.bevelSize);
    geometry.dispose();
    geometry = next;
    mesh.geometry = geometry;
    geometry.boundingBox.getSize(geometrySize);
    halfHeight = geometrySize.y / 2;
    shaderUniforms.uHalfHeight.value = halfHeight;
    targetFloorY = PHYSICS.floorY + halfHeight + .035;
    const activeCells = matrix.flat().filter(Boolean).length;
    massFactor = Math.max(.8, Math.min(1.45, Math.sqrt(activeCells / 4)));
    shadowWidth = geometrySize.x * 1.12;
    shadowDepth = Math.max(2.7, geometrySize.z * 2.15);
    if (motion.phase !== "drop") motion.y = targetFloorY;
    frameCamera();
  }

  function resetDrop() {
    motion.phase = "drop";
    motion.y = targetFloorY + Math.max(8, geometrySize.y * 1.15);
    motion.velocityY = 0;
    motion.deformation = 0;
    motion.deformationVelocity = 0;
    motion.pressing = false;
    mesh.rotation.set(0, 0, 0);
  }

  function updateMotion(delta) {
    if (motion.phase === "drop") {
      motion.velocityY += PHYSICS.gravity * delta;
      motion.y += motion.velocityY * delta;
      const stretch = Math.min(.075, Math.abs(motion.velocityY) * .0045);
      mesh.scale.set(1 - stretch * .42, 1 + stretch, 1 - stretch * .32);
      mesh.position.y = motion.y;
      shaderUniforms.uImpact.value = stretch * .42;
      if (motion.y <= targetFloorY) {
        motion.phase = "spring";
        motion.y = targetFloorY;
        motion.deformation = -.16;
        motion.deformationVelocity = Math.min(2.2, Math.abs(motion.velocityY) * .13);
        motion.velocityY = 0;
      }
    } else {
      const target = motion.pressing ? -.13 : 0;
      const spring = PHYSICS.spring / massFactor;
      const damping = PHYSICS.damping * Math.sqrt(massFactor);
      const acceleration = (target - motion.deformation) * spring - motion.deformationVelocity * damping;
      motion.deformationVelocity += acceleration * delta;
      motion.deformation += motion.deformationVelocity * delta;
      const wobble = config.wobble;
      const vertical = 1 + motion.deformation * wobble;
      const horizontal = 1 - motion.deformation * .62 * wobble;
      mesh.scale.set(horizontal, vertical, horizontal);
      mesh.position.y = targetFloorY + halfHeight * (vertical - 1);
      mesh.rotation.z = motion.deformationVelocity * .007 * wobble;
      shaderUniforms.uImpact.value = Math.min(.17, (Math.abs(motion.deformation) * .7 + Math.abs(motion.deformationVelocity) * .018) * wobble);
    }
    const compression = Math.max(0, 1 - mesh.scale.y);
    contactShadow.scale.set(shadowWidth * (1 + compression * 1.45), shadowDepth * (1 + compression * .7), 1);
    shadowMaterial.opacity = .3 + compression * .55;
  }

  function syncMaterial() {
    material.transmission = config.transmission;
    material.roughness = config.roughness;
    material.thickness = config.thickness;
    material.ior = config.ior;
    material.clearcoat = config.clearcoat;
    material.attenuationDistance = config.attenuationDistance;
  }

  function setPointer(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    pointer.y = -(event.clientY - bounds.top) / bounds.height * 2 + 1;
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.intersectObject(mesh, false).length || motion.phase === "drop") return;
    renderer.domElement.setPointerCapture(event.pointerId);
    motion.pressing = true;
    motion.deformationVelocity -= .45;
  });
  const release = (event) => {
    if (!motion.pressing) return;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    motion.pressing = false;
    motion.deformationVelocity += .72 * config.wobble;
  };
  renderer.domElement.addEventListener("pointerup", release);
  renderer.domElement.addEventListener("pointercancel", release);

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frameCamera();
  }

  function animate(now) {
    const delta = Math.min(.033, Math.max(.001, (now - lastTime) / 1000));
    lastTime = now;
    elapsed += delta;
    syncMaterial();
    updateMotion(delta);
    shaderUniforms.uWobbleTime.value = elapsed;
    renderer.render(scene, camera);
    fpsFrames += 1;
    if (now - fpsStarted >= 600) {
      fpsOutput.value = `${Math.round(fpsFrames * 1000 / (now - fpsStarted))} FPS`;
      fpsFrames = 0;
      fpsStarted = now;
    }
    requestAnimationFrame(animate);
  }

  createControls(updateGeometry, resetDrop);
  shapePicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slime-shape]");
    if (!button || !SLIME_SHAPES[button.dataset.slimeShape]) return;
    selectedShapeKey = button.dataset.slimeShape;
    shapePicker.querySelectorAll("[data-slime-shape]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    updateGeometry();
    resetDrop();
  });
  updateGeometry();
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
