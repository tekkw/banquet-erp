package com.venezia.banquetboard

import android.app.Application
import com.venezia.banquetboard.widget.WidgetRefreshWorker

class BanquetBoardApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        WidgetRefreshWorker.schedule(this)
    }
}

