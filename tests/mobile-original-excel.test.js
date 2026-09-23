const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const file of ['outputs/index.html', 'outputs/event-order-preview.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const viewer = html.slice(html.indexOf('    function openStoredExcel('), html.search(/    (?:async )?function downloadStoredExcel\(/));
  assert(html.includes('<iframe id="excelViewerFrame" class="excel-viewer-frame" title="원본 엑셀 미리보기"></iframe>'), file);
  assert(viewer.includes('view.officeapps.live.com/op/embed.aspx'), file);
  assert(viewer.includes('buildPublicStorageUrl(storagePath)'), file);
  assert(viewer.includes('document.documentElement.classList.add("excel-viewer-open")'), file);
  assert(viewer.includes('document.documentElement.classList.remove("excel-viewer-open")'), file);
  assert(viewer.includes('excelViewerFrame.removeAttribute("src")'), file);
  assert(!viewer.includes('XLSX.read'), file);
}
const mobileCss = fs.readFileSync('outputs/src/styles/mobile.css', 'utf8');
assert(mobileCss.includes('html.excel-viewer-open body { overflow: hidden !important; }'));
assert(mobileCss.includes('touch-action: pan-x pan-y'));
const board = fs.readFileSync('outputs/src/operationBoard.js', 'utf8');
assert(board.includes('window.openStoredExcel(event.storagePath)'));
assert(board.includes('window.openStoredExcel(event.storagePath);'));
console.log('shared Office Excel viewer, mobile touch/body lock, and operation-board reuse passed');
