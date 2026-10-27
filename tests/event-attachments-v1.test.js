const assert = require("assert");
const fs = require("fs");

const manager = fs.readFileSync("outputs/src/eventAttachments.js", "utf8");
const index = fs.readFileSync("outputs/index.html", "utf8");
const boardHtml = fs.readFileSync("outputs/board/index.html", "utf8");
const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const boardPage = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");

assert(manager.includes('entityType, entityId, linkType') && manager.includes('"event_order", eventOrderId, "event_attachment"'), "행사 첨부는 files/file_links로 실제 eventOrderId에 연결해야 한다");
assert(manager.includes('"event_note", note.id, "field_note_image"') && manager.includes('event_order_id: eventOrderId'), "현장사진은 event_notes와 note id에 연결해야 한다");
assert(manager.includes('application/pdf') && manager.includes('image/jpeg') && manager.includes('image/png') && manager.includes('image/webp'), "PDF와 지정 이미지 형식만 허용해야 한다");
assert(manager.includes('maxSide = 1800') && manager.includes('quality = .82'), "모바일 이미지는 약 1800px, JPEG 0.82로 축소해야 한다");
assert(manager.includes('capture="environment"') && manager.includes('사진 선택'), "모바일 후면 카메라와 갤러리 선택을 모두 제공해야 한다");
assert(manager.includes('file.file_type === "image"') && manager.includes('window.open(url, "_blank", "noopener")'), "이미지는 lightbox, PDF는 새 미리보기로 열어야 한다");
assert(index.includes('id="eventAttachmentPicker"') && index.includes('uploadEventAttachments(savedEvent.id, pendingAttachments)'), "저장된 eventOrderId가 생긴 뒤 선택 첨부를 업로드해야 한다");
assert(index.includes('data-event-attachments') && index.includes('data-event-field-notes'), "행사 상세에서 첨부자료와 현장 특이사항을 분리 표시해야 한다");
const overwrite = index.slice(index.indexOf("async function overwriteEventInSupabase"), index.indexOf("async function deleteEventFromSupabase"));
assert(!/file_links[^\n]+DELETE|files[^\n]+DELETE/.test(overwrite), "이벤트오더 덮어쓰기에서 기존 첨부를 삭제하면 안 된다");
assert(index.includes('eventAttachments.js?v=attachment-safe-key-v1') && boardHtml.includes('eventAttachments.js?v=attachment-safe-key-v1'), "PC/모바일은 같은 첨부 모듈을 사용해야 한다");
assert(board.includes('data-event-attachments') && board.includes('data-field-notes') && board.includes('특이사항${fieldNoteCount'), "운영보드 카드에서 첨부와 특이사항 건수에 접근할 수 있어야 한다");
assert(boardPage.includes('window.addEventListener("banquet:field-note-saved", () => refresh())'), "모바일 저장 결과가 공용 행사 데이터로 다시 동기화되어야 한다");
assert(manager.includes('entity_id=eq.${encodeURIComponent(entityId)}'), "다른 행사의 첨부가 섞이지 않도록 entity id로 조회해야 한다");
assert(!manager.includes("storage_path}</") && !manager.includes("Storage 경로:"), "첨부 UI에 raw storage path를 표시하면 안 된다");
assert(manager.includes('confirm(`${file.original_filename') && manager.includes('confirm("이 특이사항과 첨부 사진을 삭제할까요?")'), "첨부와 특이사항 삭제는 사용자 명시 확인 뒤에만 수행해야 한다");

console.log("event attachments V1 tests passed");
