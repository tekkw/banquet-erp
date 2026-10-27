const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { File, Blob } = require("buffer");

let uuid = 0;
const uploadedPaths = [];
const metadataRows = [];
const deletedPaths = [];
function response(ok, body = "", status = ok ? 200 : 400) { return { ok, status, text: async () => typeof body === "string" ? body : JSON.stringify(body) }; }
async function fetchMock(url, options = {}) {
  const value = String(url); const method = options.method || "GET";
  if (value.includes("/storage/v1/object/public/") && method === "GET") return response(true, "x", 206);
  if (value.includes("/storage/v1/object/event-orders/") && method === "POST") { uploadedPaths.push(decodeURIComponent(value.split("/event-orders/")[1])); return response(true); }
  if (value.includes("/storage/v1/object/event-orders/") && method === "DELETE") { deletedPaths.push(decodeURIComponent(value.split("/event-orders/")[1])); return response(true); }
  if (value.includes("/rest/v1/files?select=*") && method === "POST") { const row = { id: `file-${metadataRows.length + 1}`, ...JSON.parse(options.body) }; metadataRows.push(row); return response(true, [row]); }
  if (value.includes("/rest/v1/file_links") && method === "POST") return response(true, {});
  if (value.includes("/rest/v1/file_links?select=id")) return response(true, [{ id: "link-1" }]);
  if (value.includes("/rest/v1/files?id=eq.") && method === "DELETE") return response(true, "");
  throw new Error(`unexpected request: ${method} ${value}`);
}

const window = {
  BANQUET_ERP_CONSTANTS: { supabaseConfig: { url: "https://example.supabase.co", anonKey: "test", bucket: "event-orders" } },
  location: { hostname: "production.example.com" },
  dispatchEvent() {},
};
const context = { window, fetch: fetchMock, File, Blob, URL, Date, console, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` }, CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, createImageBitmap: async () => ({ width: 100, height: 100, close() {} }) };
vm.runInNewContext(fs.readFileSync("outputs/src/storage.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("outputs/src/eventAttachments.js", "utf8"), context);
const attachments = window.BANQUET_ERP_EVENT_ATTACHMENTS;

const unsafeName = "261030_갯벌세계유산등재추진단_레이아웃 (최종).jpg";
const firstPath = attachments.buildAttachmentStoragePath({ eventOrderId: "event/한글 id", fileName: unsafeName, now: 1761600000000, randomId: "8f3a2c" });
assert.strictEqual(firstPath, "attachments/event_order/event_id/1761600000000_8f3a2c.jpg");
assert(/^[\x20-\x7E]+$/.test(firstPath), "storage key는 ASCII여야 한다");
assert(!firstPath.includes("갯벌") && !firstPath.includes("(") && !firstPath.includes(" "));
assert.notStrictEqual(attachments.buildAttachmentStoragePath({ eventOrderId: "event-1", fileName: "같은 이름.pdf", now: 1, randomId: "a" }), attachments.buildAttachmentStoragePath({ eventOrderId: "event-1", fileName: "같은 이름.pdf", now: 1, randomId: "b" }));
assert.strictEqual(attachments.storedPath({ bucket: "event-orders", public_url: "https://example.supabase.co/storage/v1/object/public/event-orders/attachments/event_order/legacy/file.pdf" }), "attachments/event_order/legacy/file.pdf", "구형 public_url만 있는 metadata도 호환한다");

assert.strictEqual(attachments.resolvedMimeType(new File(["x"], "자료.xlsx", { type: "text/plain" })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
assert.strictEqual(attachments.resolvedMimeType(new File(["x"], "자료.pdf", { type: "text/plain" })), "application/pdf");
for (const [name, mime] of [["a.jpg", "image/jpeg"], ["a.jpeg", "image/jpeg"], ["a.png", "image/png"], ["a.xls", "application/vnd.ms-excel"], ["a.doc", "application/msword"], ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["a.ppt", "application/vnd.ms-powerpoint"], ["a.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]]) assert.strictEqual(attachments.resolvedMimeType(new File(["x"], name, { type: "text/plain" })), mime);

(async () => {
  const jpg = new File(["jpg"], unsafeName, { type: "image/jpeg" });
  const pdf = new File(["pdf"], "행사 자료 (최종).pdf", { type: "text/plain" });
  const created = await attachments.uploadEventAttachments("event-1", [jpg, pdf]);
  assert.strictEqual(created.length, 2, "신규/기존 행사에서 공유하는 uploadEventAttachments가 JPG/PDF를 저장한다");
  assert.strictEqual(new Set(uploadedPaths).size, 2, "같은 시각 업로드도 UUID로 충돌하지 않는다");
  assert(uploadedPaths.every((path) => /^[\x20-\x7E]+$/.test(path) && !path.includes("갯벌") && !path.includes("행사 자료")));
  const jpgRow = metadataRows.find((row) => row.original_filename === unsafeName); const pdfRow = metadataRows.find((row) => row.original_filename.endsWith(".pdf"));
  assert(jpgRow, "UI 원본명은 metadata에 보존한다");
  assert(uploadedPaths.includes(jpgRow.storage_path), "업로드 key를 metadata에 그대로 저장한다");
  assert.strictEqual(pdfRow.mime_type, "application/pdf", "extension-first MIME을 저장한다");
  assert(attachments.publicUrl(jpgRow).endsWith(jpgRow.storage_path.split("/").map(encodeURIComponent).join("/")), "조회 URL은 저장된 storage_path를 그대로 사용한다");
  await attachments.deleteFile(jpgRow);
  assert.strictEqual(deletedPaths[0], jpgRow.storage_path, "삭제도 동일 storage_path를 사용한다");
  const manager = fs.readFileSync("outputs/src/eventAttachments.js", "utf8");
  const index = fs.readFileSync("outputs/index.html", "utf8");
  assert(index.includes("uploadEventAttachments(savedEvent.id, pendingAttachments)"), "신규 행사 첨부가 공용 uploader를 사용한다");
  assert(manager.includes('uploadEventAttachments(eventOrderId, input.files)'), "기존 행사 +첨부자료도 공용 uploader를 사용한다");
  for (const page of ["outputs/index.html", "outputs/board/index.html"]) { const html = fs.readFileSync(page, "utf8"); assert(html.includes("storage.js?v=attachment-safe-key-v1") && html.includes("eventAttachments.js?v=attachment-safe-key-v1"), "PC/mobile은 같은 MIME/path helper를 먼저 로드한다"); }
  console.log("event attachment safe storage path V1 tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
