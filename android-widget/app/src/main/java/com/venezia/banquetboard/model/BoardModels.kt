package com.venezia.banquetboard.model

data class BoardRow(
    val itemKey: String,
    val eventOrderId: String,
    val time: String,
    val venue: String,
    val title: String,
    val eventName: String,
    val people: Int?,
    val type: String,
)

data class NextSetup(val venue: String, val date: String, val eventName: String)

data class BoardSnapshot(
    val date: String,
    val rows: List<BoardRow>,
    val nextSetup: NextSetup?,
    val syncedAt: Long,
    val offline: Boolean = false,
)

