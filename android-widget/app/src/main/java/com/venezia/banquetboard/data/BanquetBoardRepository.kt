package com.venezia.banquetboard.data

import android.content.Context
import com.venezia.banquetboard.model.BoardRow
import com.venezia.banquetboard.model.BoardSnapshot
import com.venezia.banquetboard.model.NextSetup
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

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
            val snapshot = if (ids.isEmpty()) BoardSnapshot(today.toString(), emptyList(), null, System.currentTimeMillis()) else loadBoard(today, ids)
            cache.save(snapshot)
            snapshot
        } catch (error: Exception) {
            cache.saveError(error.message ?: "동기화 실패")
            throw error
        }
    }

    private suspend fun loadBoard(today: LocalDate, ids: List<String>): BoardSnapshot {
        val idFilter = ids.joinToString(",")
        val orders = client.select("event_orders?select=id,event_name,venue,guest_count,start_date,end_date&id=in.($idFilter)")
        val schedules = client.select("event_schedules?select=id,event_order_id,schedule_date,schedule_time,content,venue,people,created_at&event_order_id=in.($idFilter)&order=created_at.asc")
        val events = (0 until orders.length()).associate { index -> orders.getJSONObject(index).optString("id") to orders.getJSONObject(index) }
        val perEventIndex = mutableMapOf<String, Int>()
        val rows = buildList {
            for (index in 0 until schedules.length()) {
                val schedule = schedules.getJSONObject(index)
                val eventId = schedule.optString("event_order_id")
                val event = events[eventId] ?: continue
                val rowIndex = perEventIndex.getOrDefault(eventId, 0)
                perEventIndex[eventId] = rowIndex + 1
                val content = schedule.optString("content").trim()
                val venue = schedule.optString("venue").ifBlank { event.optString("venue") }.trim()
                if (!isVisible(content, venue)) continue
                val time = normalizeTime(schedule.optString("schedule_time"))
                if (time.isBlank()) continue
                val type = classify(content)
                add(BoardRow(
                    itemKey = "auto:$eventId:$today:$time:$type:$rowIndex",
                    eventOrderId = eventId,
                    time = time,
                    venue = compactVenue(venue),
                    title = content.ifBlank { event.optString("event_name", "행사") },
                    eventName = event.optString("event_name", "행사"),
                    people = schedule.optIntOrNull("people") ?: event.optIntOrNull("guest_count"),
                    type = type,
                ))
            }
        }.distinctBy { "${it.eventOrderId}|${it.time}|${it.venue}|${it.title}" }.sortedWith(compareBy(BoardRow::time, BoardRow::venue))
        val next = findNextSetup(today, events.values.toList(), rows)
        return BoardSnapshot(today.toString(), rows, next, System.currentTimeMillis())
    }

    private suspend fun findNextSetup(today: LocalDate, currentEvents: List<JSONObject>, rows: List<BoardRow>): NextSetup? {
        val venues = rows.map { normalizeVenue(it.venue) }.filter(String::isNotBlank).distinct()
        if (venues.isEmpty()) return null
        val until = today.plusDays(14)
        val dates = client.select("event_calendar_dates?select=event_order_id,calendar_date&calendar_date=gt.$today&calendar_date=lte.$until&order=calendar_date.asc")
        if (dates.length() == 0) return null
        val dateByEvent = (0 until dates.length()).associate { dates.getJSONObject(it).optString("event_order_id") to dates.getJSONObject(it).optString("calendar_date") }
        val ids = dateByEvent.keys.filter(String::isNotBlank)
        if (ids.isEmpty()) return null
        val orders = client.select("event_orders?select=id,event_name,venue&id=in.(${ids.joinToString(",")})")
        val candidates = (0 until orders.length()).map { orders.getJSONObject(it) }.mapNotNull { event ->
            val venue = compactVenue(event.optString("venue")); val normalized = normalizeVenue(venue)
            if (venues.none { overlaps(it, normalized) }) null else Triple(dateByEvent[event.optString("id")].orEmpty(), venue, event.optString("event_name", "행사"))
        }.sortedBy { it.first }
        return candidates.firstOrNull()?.let { NextSetup(it.second, it.first, it.third) }
    }

    private fun isVisible(content: String, venue: String): Boolean {
        val text = "$content $venue".lowercase()
        if (Regex("체크\\s*인|체크\\s*아웃|check[ -]?in|check[ -]?out|프론트|front desk").containsMatchIn(text)) return false
        if (Regex("피렌체|firenze|florence").containsMatchIn(text) && !Regex("중식|석식|lunch|dinner|디너").containsMatchIn(text)) return false
        return true
    }

    private fun classify(content: String): String = when {
        Regex("커피|coffee|다과|break", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "coffee"
        Regex("종료|폐회|철수|end", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "end"
        Regex("시작|개회|입장|start", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "start"
        else -> "schedule"
    }
    private fun normalizeTime(value: String): String = Regex("(\\d{1,2})\\s*[:시]\\s*(\\d{0,2})").find(value)?.let { "${it.groupValues[1].toInt().toString().padStart(2, '0')}:${(it.groupValues[2].toIntOrNull() ?: 0).toString().padStart(2, '0')}" }.orEmpty()
    private fun compactVenue(value: String): String = value.replace(Regex("^\\s*\\d+\\s*F\\s*", RegexOption.IGNORE_CASE), "").trim()
    private fun normalizeVenue(value: String): String = compactVenue(value).lowercase().replace("전체", "all").replace(Regex("[\\s·ㆍ._-]"), "")
    private fun overlaps(left: String, right: String): Boolean {
        val split = { value: String -> Regex("^(.*?)(all|\\d+)$").find(value)?.let { it.groupValues[1] to it.groupValues[2] } ?: (value to "all") }
        val a = split(left); val b = split(right)
        return a.first == b.first && (a.second == "all" || b.second == "all" || a.second == b.second)
    }
    private fun JSONObject.optIntOrNull(key: String): Int? = if (has(key) && !isNull(key)) optInt(key) else null
}
