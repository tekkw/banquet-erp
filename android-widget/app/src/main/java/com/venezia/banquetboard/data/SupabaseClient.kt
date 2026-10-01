package com.venezia.banquetboard.data

import com.venezia.banquetboard.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

class SupabaseClient {
    suspend fun select(path: String): JSONArray = withContext(Dispatchers.IO) {
        check(BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) { "Supabase anon key가 설정되지 않았습니다." }
        val connection = URL("${BuildConfig.SUPABASE_URL}/rest/v1/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
            connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) error("Supabase $status: $body")
            JSONArray(body)
        } finally {
            connection.disconnect()
        }
    }
}

