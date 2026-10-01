package com.venezia.banquetboard.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.glance.appwidget.updateAll
import com.venezia.banquetboard.data.BanquetBoardRepository
import java.util.concurrent.TimeUnit

class WidgetRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = runCatching {
        BanquetBoardRepository(applicationContext).refresh()
        BanquetBoardWidget().updateAll(applicationContext)
    }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(1, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("banquet-board-widget-refresh", ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
