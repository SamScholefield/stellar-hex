package com.stellarhex.world

import com.stellarhex.model.ChunkDataDto
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedDeque

private const val MAX_ENTRIES = 500

class ChunkCache {
    private val cache = ConcurrentHashMap<String, ChunkDataDto>()
    private val accessOrder = ConcurrentLinkedDeque<String>()

    fun get(seed: Int, cx: Int, cy: Int): ChunkDataDto? {
        val key = "$seed:$cx,$cy"
        val value = cache[key]
        if (value != null) {
            accessOrder.remove(key)
            accessOrder.addFirst(key)
        }
        return value
    }

    fun put(seed: Int, cx: Int, cy: Int, chunk: ChunkDataDto) {
        val key = "$seed:$cx,$cy"
        cache[key] = chunk
        accessOrder.remove(key)
        accessOrder.addFirst(key)
        evict()
    }

    private fun evict() {
        while (cache.size > MAX_ENTRIES) {
            val oldest = accessOrder.pollLast() ?: break
            cache.remove(oldest)
        }
    }
}
