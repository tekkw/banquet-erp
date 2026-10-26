const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "outputs/board/slime-test.html"), "utf8");
const script = fs.readFileSync(path.join(root, "outputs/src/slimePrototype.js"), "utf8");
const css = fs.readFileSync(path.join(root, "outputs/src/styles/slimePrototype.css"), "utf8");

assert(html.includes("Slime Renderer Prototype V1"), "prototype must have an independent development entry");
assert(html.includes("three@0.186.1") && html.includes('type="module"'), "prototype must pin Three.js as an ES module");
assert(!html.includes("operationBoardPage") && !html.includes("eventBlockBoard"), "prototype must not load operation-board code");
assert(!script.includes("eventOrder") && !script.includes("occupancy") && !script.includes("localStorage"), "prototype must not connect event data or completion state");
assert(!script.includes("MarchingCubes"), "prototype must not use metaballs or MarchingCubes");

assert(script.includes("new THREE.Shape") && script.includes("new THREE.ExtrudeGeometry"), "one rounded contour must create one extruded mesh");
assert.strictEqual((script.match(/new THREE\.Mesh\(geometry, material\)/g) || []).length, 1, "the 2x2 solid must be one mesh, not four cells");
assert(script.includes("depth: 1.45") && script.includes("bevelThickness: 0.38") && script.includes("bevelSegments: 12") && script.includes("curveSegments: 20"), "thick rounded candy geometry parameters are required");

assert(script.includes("new THREE.MeshPhysicalMaterial"), "jelly must use MeshPhysicalMaterial");
assert(script.includes("transmission: 0.86") && script.includes("thickness: 2.25") && script.includes("ior: 1.42"), "transmission, thickness and refraction parameters are required");
assert(script.includes("attenuationColor") && script.includes("attenuationDistance") && script.includes("clearcoatRoughness"), "colored volume attenuation and glossy coat are required");
assert(script.includes("new RoomEnvironment") && script.includes("new THREE.PMREMGenerator"), "studio environment map is required");
assert(script.includes("RectAreaLight") && script.includes("DirectionalLight") && script.includes("PointLight"), "soft key, shadow key, fill and rim lighting are required");
assert(script.includes("new THREE.PerspectiveCamera(36") && script.includes("camera.position.set(0.3, 1.75, 15.6)"), "camera must show front, top and side depth subtly");
assert(script.includes("PlaneGeometry(28, 18)") && script.includes("makeContactShadowTexture"), "floor and soft contact shadow are required");

assert(script.includes("velocityY += PHYSICS.gravity * delta") && script.includes("motion.y += motion.velocityY * delta"), "drop must use velocity and gravity integration");
assert(script.includes("PHYSICS.spring") && script.includes("PHYSICS.damping") && script.includes("motion.deformationVelocity += acceleration * delta"), "landing and release must use a damped spring state");
assert(script.includes("pointerdown") && script.includes("pointerup") && script.includes("motion.pressing"), "touch compression must distinguish pointer down and release");
assert(script.includes("material.onBeforeCompile") && script.includes("uImpact") && script.includes("jellyWeight"), "mesh vertices must receive subtle height-weighted impact deformation");

for (const control of ["transmission", "roughness", "thickness", "ior", "clearcoat", "attenuationDistance", "bevelSize", "wobble"]) {
  assert(script.includes(`[\"${control}\"`) || script.includes(`, [\"${control}\"`), `${control} tuning control is required`);
}
assert(script.includes("Math.min(window.devicePixelRatio || 1, 1.6)"), "mobile pixel ratio must be capped");
assert(script.includes("fpsOutput.value"), "prototype must expose measured FPS");
assert(css.includes("dark") && css.includes("slime-controls") && css.includes("slime-canvas"), "prototype presentation and tuning panel styles are required");

console.log("slime renderer prototype V1 tests passed");
