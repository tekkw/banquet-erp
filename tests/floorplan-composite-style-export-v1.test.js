const assert = require("assert");
const fs = require("fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");

const { getFloorplanStrokeStyle, buildSinglePageFloorplanPdf } = window.BANQUET_ERP_FLOORPLAN_EDITOR;
const outline = getFloorplanStrokeStyle("outline", "editor");
for (const type of ["wall", "fixed_wall", "pillar", "door", "screen"]) {
  const style = getFloorplanStrokeStyle(type, "editor");
  assert.strictEqual(style.stroke, outline.stroke, `${type} 선 색은 outline과 같아야 한다`);
  assert.strictEqual(style.strokeWidth, outline.strokeWidth, `${type} 선 굵기는 outline과 같아야 한다`);
}
assert.notStrictEqual(getFloorplanStrokeStyle("basePlanGroupFrame", "selected").stroke, outline.stroke, "선택 frame만 별도 강조색을 사용한다");
assert.strictEqual(getFloorplanStrokeStyle("dimension", "export").stroke, getFloorplanStrokeStyle("dimensionText", "export").fill, "export 치수선과 텍스트 색을 통일한다");

(async () => {
  const pdf = buildSinglePageFloorplanPdf(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), 2400, 1200);
  assert.strictEqual(pdf.type, "application/pdf");
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  assert(text.startsWith("%PDF-1.4"), "PDF header가 있어야 한다");
  assert(text.includes("/MediaBox [0 0 841.89 595.28]"), "A4 가로 page를 사용한다");
  assert(text.includes("/DCTDecode") && text.includes("/Im0 Do"), "고해상도 JPEG 도면을 한 페이지에 삽입한다");
  assert(text.endsWith("%%EOF"), "완전한 PDF trailer가 있어야 한다");

  const editor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
  assert(editor.includes('polygon.dataset.floorplanStyleType = "outline"'), "현재 기본도면 outline도 공용 token을 사용한다");
  assert(editor.includes('compositeOutlineSource: true'), "불러온 outline을 같은 style type으로 표시한다");
  assert(editor.includes('clone.querySelector("#layoutWorkspaceSelectionLayer")?.remove()'), "export에서 선택 UI를 제거한다");
  assert(editor.includes('clone.querySelector("#layoutWorkspaceGridLayer")?.remove()'), "export에서 편집 격자를 제거한다");
  assert(editor.includes('context.fillStyle = "#ffffff"'), "export는 흰 배경을 사용한다");
  assert(editor.includes("getWorkspaceExportBounds()") && editor.includes("maxSize = 4800"), "composite 전체 bbox를 고해상도로 출력한다");
  assert(editor.includes("workspaceIncludeDimensionsInExport"), "기존 치수 포함 옵션을 재사용한다");
  assert(!editor.includes("style: compositeReferencePayload"), "style을 composite reference metadata에 저장하지 않는다");

  for (const htmlPath of ["outputs/index.html", "outputs/event-order-preview.html"]) {
    const html = fs.readFileSync(htmlPath, "utf8");
    assert(html.includes('id="layoutWorkspaceExportPdfButton"'));
    assert(html.includes('id="layoutWorkspacePreviewPdfButton"'));
  }
  console.log("Floorplan composite style and export tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
