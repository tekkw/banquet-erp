package com.venezia.banquetboard

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.lifecycleScope
import com.venezia.banquetboard.data.BanquetBoardRepository
import com.venezia.banquetboard.widget.BanquetBoardWidget
import com.venezia.banquetboard.widget.WidgetRefreshWorker
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private val repository by lazy { BanquetBoardRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildContent())
        updateStatus()
        refresh()
        WidgetRefreshWorker.schedule(this)
    }

    private fun buildContent() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(48, 72, 48, 48)
        setBackgroundColor(Color.rgb(8, 26, 43))
        addView(TextView(context).apply { text = "Banquet Board Widget"; textSize = 26f; setTextColor(Color.WHITE); gravity = Gravity.CENTER })
        status = TextView(context).apply { textSize = 16f; setTextColor(Color.rgb(191, 219, 254)); gravity = Gravity.CENTER; setPadding(0, 40, 0, 32) }
        addView(status, LinearLayout.LayoutParams(-1, -2))
        addView(Button(context).apply { text = "지금 새로고침"; setOnClickListener { refresh() } }, LinearLayout.LayoutParams(-1, -2))
        addView(Button(context).apply { text = "운영보드 열기"; setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BOARD_URL))) } }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 16 })
        addView(TextView(context).apply { text = "홈 화면을 길게 눌러 위젯에서\n연회 운영보드를 추가하세요."; textSize = 16f; setTextColor(Color.LTGRAY); gravity = Gravity.CENTER; setPadding(0, 48, 0, 0) })
    }

    private fun refresh() {
        status.text = "Supabase 연결 중…"
        lifecycleScope.launch {
            runCatching { repository.refresh() }
                .onSuccess { BanquetBoardWidget().updateAll(this@MainActivity); updateStatus() }
                .onFailure { error ->
                    BanquetBoardWidget().updateAll(this@MainActivity)
                    status.text = "동기화 실패\n${error.message ?: repository.lastError()}"
                }
        }
    }

    private fun updateStatus() {
        val snapshot = repository.cached()
        val error = repository.lastError()
        val formatter = DateTimeFormatter.ofPattern("M월 d일 HH:mm").withZone(ZoneId.of("Asia/Seoul"))
        status.text = when {
            error.isNotBlank() -> "Supabase 연결 상태: 실패\n$error"
            snapshot == null -> "아직 동기화되지 않았습니다."
            else -> "Supabase 연결 상태: 정상\n마지막 동기화: ${formatter.format(Instant.ofEpochMilli(snapshot.syncedAt))}"
        }
    }

    companion object { const val BOARD_URL = "https://banquet-erp.vercel.app/board/" }
}
