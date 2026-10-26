const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "outputs/board/index.html"), "utf8");
const controller = fs.readFileSync(path.join(root, "outputs/src/eventBlockBoard.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "outputs/src/eventBlockRenderer3d.js"), "utf8");
const page = fs.readFileSync(path.join(root, "outputs/src/operationBoardPage.js"), "utf8");
const css = fs.readFileSync(path.join(root, "outputs/src/styles/eventBlockBoard.css"), "utf8");

assert(html.includes('"three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js"'), "Three.js must be pinned in the import map");
assert(html.includes('"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"'), "official Three.js addons path is required");
assert(renderer.includes('export const THREE_VERSION = "0.186.1"'), "renderer version must match the import map");

assert(renderer.includes("new THREE.WebGLRenderer"), "WebGL renderer must initialize explicitly");
assert(renderer.includes("new MarchingCubes"), "high quality pieces must use MarchingCubes");
assert(renderer.includes("mesh.addBall(ball.x, ball.y, ball.z, ball.strength, ball.subtract)"), "every occupancy cell must map to a metaball");
assert(renderer.includes("resolution: 28") && renderer.includes("strengthBase: 21") && renderer.includes("strengthBase / (domain * domain)") && renderer.includes("subtract: 12") && renderer.includes("isolation: 80"), "metaball radius must scale with occupancy domain while quality stays bounded");
assert(renderer.includes("lShape: [[0, 0], [1, 0], [0, 1]]"), "technical spike must include a recognizable L shape");
assert(renderer.includes("horizontal2") && renderer.includes("square2x2") && renderer.includes("horizontal4") && renderer.includes("stepShape"), "all five test shapes are required");

assert(renderer.includes("new THREE.MeshPhysicalMaterial"), "jelly must use a physical material");
assert(renderer.includes("transmission: 0.88") && renderer.includes("thickness: 0.65") && renderer.includes("ior: 1.38"), "physical transmission and volume parameters are required");
assert(renderer.includes("clearcoat: 1") && renderer.includes("specularIntensity: 0.9"), "gummy highlights require clearcoat and specular response");
assert(renderer.includes("new RoomEnvironment") && renderer.includes("new THREE.PMREMGenerator"), "studio environment lighting is required");
assert(renderer.includes("DirectionalLight") && renderer.includes("PointLight") && renderer.includes("HemisphereLight"), "key, fill, rim and ambient lighting must be layered");
assert(renderer.includes("OrthographicCamera") && renderer.includes("degToRad(6)"), "camera must keep a near-front board view with slight depth tilt");

assert(renderer.includes("pieceWorldTarget") && renderer.includes("piece.targetRow + piece.height / 2"), "physics rows must map deterministically to 3D world targets");
assert(renderer.includes("dropRecord") && renderer.includes("landingWobble") && renderer.includes("Math.exp(-4.8 * progress)"), "drop must end with a damped jelly wobble");
assert(renderer.includes("firstScene ? index * 55 : 0"), "initial 3D pieces must enter with a short deterministic stagger");
assert(renderer.includes("pressPiece") && renderer.includes("applyJellyTransform(record") && !renderer.includes("record.group.style"), "touch response must animate mesh transforms without CSS scaling");
assert(renderer.includes("function complete(id, done)") && renderer.includes("record.material.transmission") && renderer.includes("removeRecord(record.id)"), "complete must change material, collapse and remove the mesh");

assert(renderer.includes("new RoundedBoxGeometry") && renderer.includes('jellyQuality") === "normal"'), "normal mode must use rounded 3D geometry");
assert(renderer.includes("Math.min(window.devicePixelRatio || 1, 1.6)"), "mobile pixel ratio must be capped");
assert(renderer.includes("if (animations.size) requestRender()"), "renderer must stop full-speed RAF work while idle");
assert(renderer.includes("IntersectionObserver") && renderer.includes("ResizeObserver"), "off-screen pause and responsive resizing are required");
assert(controller.includes("hasWebGL") && controller.includes("keeping SVG fallback"), "WebGL failure must preserve the existing fallback renderer");
assert(controller.includes('import("./eventBlockRenderer3d.js?v=event-block-3d-v1")'), "controller must load the 3D renderer without restructuring the app");
assert(controller.includes("renderer3d.complete") && controller.includes("saveCompleted(piece.id)"), "3D completion must preserve local completion state and gravity reflow");
assert(page.includes("startJellyRenderTest") && page.includes('get("jellyTest") === "1"'), "synthetic test shapes must have an explicit development entry");
assert(page.includes("합성 occupancy shape · 실제 행사 데이터 미사용") && page.includes("eventBlockBoard?.render({ events: [] })"), "technical spike must use only synthetic data");
assert(css.includes("event-block-webgl") && css.includes("event-block-3d-label"), "canvas and crisp DOM label layers are required");
assert(html.includes('id="todayOperationBoard"'), "existing list view must remain available");

console.log("event block Three.js renderer V1 tests passed");
