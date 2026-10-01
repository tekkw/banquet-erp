package com.venezia.banquetboard.data

import android.content.Context
import com.venezia.banquetboard.model.BoardRow
import com.venezia.banquetboard.model.BoardSnapshot
import com.venezia.banquetboard.model.NextSetup
import org.json.JSONArray
import org.json.JSONObject

class WidgetPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("banquet_board_widget", Context.MODE_PRIVATE)

    fun save(snapshot: BoardSnapshot) {
        val rows = JSONArray().apply { snapshot.rows.forEach { put(it.toJson()) } }
        val root = JSONObject().put("date", snapshot.date).put("syncedAt", snapshot.syncedAt).put("rows", rows)
        snapshot.nextSetup?.let { root.put("nextSetup", JSONObject().put("venue", it.venue).put("date", it.date).put("eventName", it.eventName)) }
        preferences.edit().putString("snapshot", root.toString()).putString("last_error", "").apply()
    }

    fun load(): BoardSnapshot? = runCatching {
        val root = JSONObject(preferences.getString("snapshot", null) ?: return null)
        val rowsJson = root.optJSONArray("rows") ?: JSONArray()
        val rows = (0 until rowsJson.length()).map { index ->
            val row = rowsJson.getJSONObject(index)
            BoardRow(row.optString("itemKey"), row.optString("eventOrderId"), row.optString("time"), row.optString("venue"), row.optString("title"), row.optString("eventName"), row.optIntOrNull("people"), row.optString("type"))
        }
        val next = root.optJSONObject("nextSetup")?.let { NextSetup(it.optString("venue"), it.optString("date"), it.optString("eventName")) }
        BoardSnapshot(root.optString("date"), rows, next, root.optLong("syncedAt"), offline = lastError().isNotBlank())
    }.getOrNull()

    fun saveError(message: String) { preferences.edit().putString("last_error", message.take(240)).apply() }
    fun lastError(): String = preferences.getString("last_error", "").orEmpty()
    fun lastSyncedAt(): Long = load()?.syncedAt ?: 0L

    private fun BoardRow.toJson() = JSONObject().put("itemKey", itemKey).put("eventOrderId", eventOrderId).put("time", time).put("venue", venue).put("title", title).put("eventName", eventName).put("people", people).put("type", type)
    private fun JSONObject.optIntOrNull(key: String): Int? = if (has(key) && !isNull(key)) optInt(key) else null
}

