package com.stellarhex.world

import com.stellarhex.model.ChunkDataDto
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.atomic.AtomicLong

private const val MAX_ENTRIES = 500

class ChunkCache {
    private val cache = ConcurrentHashMap<String, ChunkDataDto>()
    private val accessOrder = ConcurrentLinkedDeque<String>()

    val hits = AtomicLong(0)
    val misses = AtomicLong(0)
    val evictions = AtomicLong(0)

    val size: Int get() = cache.size

    fun get(seed: Int, cx: Int, cy: Int): ChunkDataDto? {
        val key = "$seed:$cx,$cy"
        val value = cache[key]
        if (value != null) {
            hits.incrementAndGet()
            accessOrder.remove(key)
            accessOrder.addFirst(key)
        } else {
            misses.incrementAndGet()
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
            evictions.incrementAndGet()
        }
    }
}
