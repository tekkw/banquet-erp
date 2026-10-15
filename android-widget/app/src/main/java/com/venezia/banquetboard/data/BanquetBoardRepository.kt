package com.venezia.banquetboard.data

import android.content.Context
import com.venezia.banquetboard.model.BoardRow
import com.venezia.banquetboard.model.BoardSnapshot
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

class BanquetBoardRepository(context: Context) {
    private val client = SupabaseClient()
    private val cache = WidgetPreferences(context.applicationContext)
    private val seoul = ZoneId.of("Asia/Seoul")

    fun cached(): BoardSnapshot? = cache.load()
    fun lastError(): String = cache.lastError()

    suspend fun refresh(): BoardSnapshot {
        val today = LocalDate.now(seoul)
        return try {
            val dates = client.select("event_calendar_dates?select=event_order_id,calendar_date&calendar_date=eq.$today")
            val ids = (0 until dates.length()).map { dates.getJSONObject(it).optString("event_order_id") }.filter(String::isNotBlank).distinct()
            val snapshot = loadBoard(today, ids)
            cache.save(snapshot)
            snapshot
        } catch (error: Exception) {
            cache.saveError(error.message ?: "동기화 실패")
            throw error
        }
    }

    private suspend fun loadBoard(today: LocalDate, ids: List<String>): BoardSnapshot {
        val idFilter = ids.joinToString(",")
        val orders = if (ids.isEmpty()) org.json.JSONArray() else client.select("event_orders?select=id,event_name,company_name,venue,guest_count,event_datetime,start_date,end_date&id=in.($idFilter)")
        val schedules = if (ids.isEmpty()) org.json.JSONArray() else client.select("event_schedules?select=id,event_order_id,schedule_date,schedule_time,content,venue,people,created_at&event_order_id=in.($idFilter)&order=created_at.asc")
        val storedItems = client.select("operation_board_items?select=item_key,item_kind,event_order_id,item_time,venue_name,title,people,is_completed,metadata&board_date=eq.$today")
        val events = (0 until orders.length()).associate { index -> orders.getJSONObject(index).optString("id") to orders.getJSONObject(index) }
        val completions = (0 until storedItems.length()).associate { index -> storedItems.getJSONObject(index).optString("item_key") to storedItems.getJSONObject(index).optBoolean("is_completed") }
        val perEventIndex = mutableMapOf<String, Int>()
        val rows = buildList {
            val eventRows = mutableMapOf<String, MutableList<BoardRow>>()
            val boundaryRows = mutableMapOf<String, MutableList<BoundaryRow>>()
            val inheritedDates = mutableMapOf<String, String>()
            val scheduleSeen = mutableSetOf<String>()
            val visibleScheduleSeen = mutableSetOf<String>()
            for (index in 0 until schedules.length()) {
                val schedule = schedules.getJSONObject(index)
                val eventId = schedule.optString("event_order_id")
                val event = events[eventId] ?: continue
                scheduleSeen.add(eventId)
                val rowIndex = perEventIndex.getOrDefault(eventId, 0)
                perEventIndex[eventId] = rowIndex + 1
                val explicitDay = scheduleDate(schedule.optString("schedule_date"), today)
                if (explicitDay.isNotBlank()) inheritedDates[eventId] = explicitDay
                val day = explicitDay.ifBlank { inheritedDates[eventId].orEmpty() }.ifBlank { today.toString() }
                if (day != today.toString()) continue
                val content = schedule.optString("content").trim()
                val venue = schedule.optString("venue").ifBlank { event.optString("venue") }.trim()
                if (!isVisible(content, venue)) continue
                visibleScheduleSeen.add(eventId)
                val time = normalizeTime(schedule.optString("schedule_time"))
                if (time.isBlank()) continue
                val type = classify(content)
                val displayTitle = eventDisplayTitle(event)
                val title = when (type) { "start" -> displayTitle; "end" -> "행사 종료"; "lunch" -> "중식"; "dinner" -> "석식"; "coffee" -> "커피브레이크"; else -> content.ifBlank { displayTitle } }
                val itemKey = "auto:$eventId:$today:$time:$type:$rowIndex"
                val row = BoardRow(
                    itemKey = itemKey,
                    eventOrderId = eventId,
                    time = time,
                    venue = shortVenue(venue),
                    title = title,
                    eventName = displayTitle,
                    people = schedule.optIntOrNull("people") ?: event.optIntOrNull("guest_count"),
                    type = type,
                )
                eventRows.getOrPut(eventId) { mutableListOf() }.add(row)
                if (type !in setOf("lunch", "dinner", "coffee")) boundaryRows.getOrPut(eventId) { mutableListOf() }.add(BoundaryRow(rowIndex, time, endTime(schedule.optString("schedule_time")), venue, row))
                if (completions[itemKey] != true) add(row)
            }
            events.forEach { (eventId, event) ->
                val boundaries = boundaryRows[eventId].orEmpty()
                val existing = eventRows[eventId].orEmpty()
                if (boundaries.isNotEmpty() && existing.none { it.type == "start" }) {
                    val first = boundaries.minBy { it.time }; val key = "auto:$eventId:$today:${first.time}:start:${first.index}"
                    if (completions[key] != true) add(first.row.copy(itemKey = key, type = "start", title = eventDisplayTitle(event)))
                }
                if (boundaries.isNotEmpty() && existing.none { it.type == "end" }) {
                    val last = boundaries.maxBy { it.endTime }; val key = "auto:$eventId:$today:${last.time}:end:${last.index}:${last.endTime}"
                    if (completions[key] != true) add(last.row.copy(itemKey = key, time = last.endTime, type = "end", title = "행사 종료", people = null))
                }
                if (existing.isEmpty() && (eventId !in scheduleSeen || eventId in visibleScheduleSeen)) {
                    val key = "auto:$eventId:$today:fallback"; val time = normalizeTime(event.optString("event_datetime")).ifBlank { "시간 미정" }
                    if (completions[key] != true) add(BoardRow(key, eventId, time, shortVenue(event.optString("venue")), eventDisplayTitle(event), eventDisplayTitle(event), event.optIntOrNull("guest_count"), "schedule"))
                }
            }
            for (index in 0 until storedItems.length()) {
                val item = storedItems.getJSONObject(index)
                if (item.optString("item_kind") != "manual" || item.optBoolean("is_completed") || isHiddenManual(item.optJSONObject("metadata"))) continue
                add(BoardRow(item.optString("item_key"), item.optString("event_order_id"), normalizeTime(item.optString("item_time")).ifBlank { "시간 미정" }, shortVenue(item.optString("venue_name")), item.optString("title", "작업"), item.optString("title", "작업"), item.optIntOrNull("people"), "manual"))
            }
        }.distinctBy(BoardRow::itemKey).sortedWith(compareBy<BoardRow>({ if (it.time == "시간 미정") "99:99" else it.time }, BoardRow::venue))
        return BoardSnapshot(today.toString(), rows, null, System.currentTimeMillis())
    }

    private fun isVisible(content: String, venue: String): Boolean {
        val text = "$content $venue".lowercase()
        if (Regex("체크\\s*인|체크\\s*아웃|check[ -]?in|check[ -]?out|프론트|front desk").containsMatchIn(text)) return false
        if (Regex("피렌체|firenze|florence").containsMatchIn(text) && !Regex("중식|석식|lunch|dinner|디너").containsMatchIn(text)) return false
        return true
    }

    private fun classify(content: String): String = when {
        Regex("중식|lunch", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "lunch"
        Regex("석식|dinner|디너", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "dinner"
        Regex("커피|coffee|다과|break", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "coffee"
        Regex("종료|폐회|철수|end", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "end"
        Regex("시작|개회|입장|start", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "start"
        else -> "schedule"
    }
    private fun normalizeTime(value: String): String = Regex("(\\d{1,2})\\s*[:시]\\s*(\\d{0,2})").find(value)?.let { "${it.groupValues[1].toInt().toString().padStart(2, '0')}:${(it.groupValues[2].toIntOrNull() ?: 0).toString().padStart(2, '0')}" }.orEmpty()
    private fun endTime(value: String): String = Regex("~\\s*(\\d{1,2}:\\d{2})").find(value)?.groupValues?.get(1) ?: normalizeTime(value)
    private fun scheduleDate(value: String, today: LocalDate): String {
        val raw = value.replace(Regex("\\([^)]*\\)"), "").trim()
        if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) return raw
        val match = Regex("(\\d{1,2})\\s*[./월-]\\s*(\\d{1,2})").find(raw) ?: return ""
        return "%04d-%02d-%02d".format(today.year, match.groupValues[1].toInt(), match.groupValues[2].toInt())
    }
    private fun eventDisplayTitle(event: JSONObject): String {
        val invalid = setOf("", "-", "미입력", "없음")
        val organizer = listOf("company_name", "company", "organizer", "organizer_name").map { event.optString(it).trim() }.firstOrNull { it.lowercase() !in invalid }
        return organizer ?: event.optString("event_name").trim().takeIf { it.lowercase() !in invalid } ?: "행사"
    }
    internal fun shortVenue(value: String): String {
        val name = value.uppercase().replace(Regex("^\\s*\\d+\\s*F\\s*"), "").replace(Regex("[\\s._-]"), "").replace("컨벤션센터", "컨벤션").replace("Ⅰ", "1").replace("Ⅱ", "2").replace("Ⅲ", "3")
        return when {
            Regex("컨벤션(?:전체|ALL|AB|1\\+2\\+3)").containsMatchIn(name) -> "컨AB"
            Regex("컨벤션A|컨A|컨벤션[12]").containsMatchIn(name) -> "컨A"
            Regex("컨벤션B|컨B|컨벤션3").containsMatchIn(name) -> "컨B"
            Regex("부라노(?:전체|ALL|1\\+2\\+3)$").containsMatchIn(name) || name == "부라노" -> "부ALL"
            Regex("부라노1|부라노I$").containsMatchIn(name) -> "부1"
            Regex("부라노2|부라노II$").containsMatchIn(name) -> "부2"
            Regex("부라노3|부라노III$").containsMatchIn(name) -> "부3"
            Regex("카프리(?:전체|ALL|1\\+2\\+3)$").containsMatchIn(name) || name == "카프리" -> "카ALL"
            Regex("카프리1|카프리I$").containsMatchIn(name) -> "카1"
            Regex("카프리2|카프리II$").containsMatchIn(name) -> "카2"
            Regex("카프리3|카프리III$").containsMatchIn(name) -> "카3"
            else -> name
        }
    }
    private fun isHiddenManual(metadata: JSONObject?): Boolean = metadata?.let { it.optString("source") == "board_asset_ai" || it.optString("recordType") == "board_ai_change_log" || it.optString("noteType") == "field_note" } ?: false
    private data class BoundaryRow(val index: Int, val time: String, val endTime: String, val venue: String, val row: BoardRow)
    private fun JSONObject.optIntOrNull(key: String): Int? = if (has(key) && !isNull(key)) optInt(key) else null
}
