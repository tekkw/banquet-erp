package com.venezia.banquetboard.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.FontWeight
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.venezia.banquetboard.MainActivity
import com.venezia.banquetboard.data.BanquetBoardRepository
import com.venezia.banquetboard.model.BoardRow
import com.venezia.banquetboard.model.BoardSnapshot
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class BanquetBoardWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(180.dp, 110.dp), DpSize(300.dp, 180.dp), DpSize(360.dp, 300.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = BanquetBoardRepository(context)
        val snapshot = repository.cached() ?: try {
            repository.refresh()
        } catch (error: Exception) {
            Log.e("BanquetBoardWidget", "Initial refresh failed", error)
            null
        }
        val error = repository.lastError()
        provideContent { WidgetContent(snapshot, error) }
    }
}

@Composable
private fun WidgetContent(snapshot: BoardSnapshot?, error: String) {
    val size = LocalSize.current
    val rowLimit = when { size.height < 150.dp -> 3; size.height < 250.dp -> 6; else -> 11 }
    val showNext = size.height >= 170.dp
    val openBoard = actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MainActivity.BOARD_URL)))
    Column(
        modifier = GlanceModifier.fillMaxSize().background(ColorProvider(Color(0xFF081A2B))).cornerRadius(18.dp).padding(14.dp).clickable(openBoard),
        verticalAlignment = Alignment.Top,
    ) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("연회 운영보드", style = TextStyle(color = ColorProvider(Color.White), fontSize = 18.sp, fontWeight = FontWeight.Bold))
                Text(dateLabel(snapshot?.date), style = TextStyle(color = ColorProvider(Color(0xFFBFD5E5)), fontSize = 13.sp))
            }
            Text("↻", modifier = GlanceModifier.padding(8.dp).clickable(actionRunCallback<RefreshAction>()), style = TextStyle(color = ColorProvider(Color(0xFF7DD3FC)), fontSize = 22.sp, fontWeight = FontWeight.Bold))
        }
        Spacer(GlanceModifier.height(8.dp))
        if (error.isNotBlank()) {
            Text("동기화 실패", style = TextStyle(color = ColorProvider(Color(0xFFFCA5A5)), fontSize = 14.sp, fontWeight = FontWeight.Bold))
            Text(error, maxLines = 3, style = TextStyle(color = ColorProvider(Color(0xFFFECACA)), fontSize = 12.sp))
        } else if (snapshot == null) {
            Text("일정을 불러오는 중…", style = TextStyle(color = ColorProvider(Color.LightGray), fontSize = 14.sp))
        } else if (snapshot.rows.isEmpty()) {
            Text("오늘 등록된 일정이 없습니다.", style = TextStyle(color = ColorProvider(Color.LightGray), fontSize = 14.sp))
        } else {
            snapshot.rows.take(rowLimit).forEach { BoardRowView(it) }
        }
        if (showNext && snapshot?.nextSetup != null) {
            Spacer(GlanceModifier.height(6.dp))
            Text("다음 세팅", style = TextStyle(color = ColorProvider(Color(0xFFD4A853)), fontSize = 13.sp, fontWeight = FontWeight.Bold))
            Text("${snapshot.nextSetup.venue} · ${shortDate(snapshot.nextSetup.date)} ${snapshot.nextSetup.eventName}", maxLines = 1, style = TextStyle(color = ColorProvider(Color.White), fontSize = 13.sp))
        }
        Spacer(GlanceModifier.height(6.dp))
        Row(GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.End, verticalAlignment = Alignment.CenterVertically) {
            snapshot?.let { Text(syncLabel(it), style = TextStyle(color = ColorProvider(if (it.offline) Color(0xFFFBBF24) else Color(0xFF94A3B8)), fontSize = 11.sp)) }
            Spacer(GlanceModifier.width(10.dp))
            Text("전체보기", modifier = GlanceModifier.padding(vertical = 5.dp, horizontal = 8.dp).clickable(openBoard), style = TextStyle(color = ColorProvider(Color(0xFF6EE7B7)), fontSize = 13.sp, fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
private fun BoardRowView(row: BoardRow) {
    Row(GlanceModifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(row.time, modifier = GlanceModifier.width(52.dp), style = TextStyle(color = ColorProvider(Color(0xFF7DD3FC)), fontSize = 14.sp, fontWeight = FontWeight.Bold))
        Column {
            Text("${row.venue} · ${row.title}", maxLines = 1, style = TextStyle(color = ColorProvider(Color.White), fontSize = 14.sp, fontWeight = FontWeight.Medium))
            if (row.people != null) Text("${row.eventName} · ${row.people}명", maxLines = 1, style = TextStyle(color = ColorProvider(Color(0xFFCBD5E1)), fontSize = 12.sp))
        }
    }
}

class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val repository = BanquetBoardRepository(context)
        try {
            repository.refresh()
        } catch (error: Exception) {
            // refresh() persists the failure; logging keeps the stack trace visible during development.
            Log.e("BanquetBoardWidget", "Manual refresh failed", error)
        }
        BanquetBoardWidget().update(context, glanceId)
    }
}

class BanquetBoardWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BanquetBoardWidget()
}

private fun dateLabel(value: String?): String = runCatching {
    LocalDate.parse(value ?: LocalDate.now(ZoneId.of("Asia/Seoul")).toString()).format(DateTimeFormatter.ofPattern("M월 d일 EEEE"))
}.getOrDefault("오늘")
private fun shortDate(value: String): String = runCatching { LocalDate.parse(value).format(DateTimeFormatter.ofPattern("M/d")) }.getOrDefault(value)
private fun syncLabel(snapshot: BoardSnapshot): String {
    val time = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Seoul")).format(Instant.ofEpochMilli(snapshot.syncedAt))
    return if (snapshot.offline) "오프라인 · $time" else "동기화 $time"
}
