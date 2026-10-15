const assert = require("assert");
const fs = require("fs");

const repository = fs.readFileSync("android-widget/app/src/main/java/com/venezia/banquetboard/data/BanquetBoardRepository.kt", "utf8");
const widget = fs.readFileSync("android-widget/app/src/main/java/com/venezia/banquetboard/widget/BanquetBoardWidget.kt", "utf8");
const activity = fs.readFileSync("android-widget/app/src/main/java/com/venezia/banquetboard/MainActivity.kt", "utf8");

assert(repository.includes("operation_board_items?select="));
assert(repository.includes("completions[itemKey] != true"));
assert(repository.includes('item.optString("item_kind") != "manual"'));
assert(repository.includes('item.optBoolean("is_completed")'));
for (const excluded of ["체크", "프론트", "피렌체"]) assert(repository.includes(excluded));
assert(repository.includes('if (it.time == "시간 미정") "99:99" else it.time'));
for (const venue of ["컨A", "컨B", "컨AB", "부1", "부2", "부3", "부ALL", "카1", "카2", "카3", "카ALL"]) assert(repository.includes(`"${venue}"`));
assert(repository.includes('listOf("company_name", "company", "organizer", "organizer_name")'));
assert(repository.includes('"coffee" -> "커피브레이크"'));
assert(repository.includes('"end" -> "행사 종료"'));
assert(widget.includes("else -> 8"));
assert(widget.includes('Text("+ 외 ${hidden}건"'));
assert(widget.includes('Text("운영보드 열기"'));
assert(activity.includes('const val BOARD_URL = "https://banquet-erp.vercel.app/board/"'));

console.log("android widget remaining schedule V1 tests passed");
