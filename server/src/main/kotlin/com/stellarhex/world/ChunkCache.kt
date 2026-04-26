package com.stellarhex.world

import com.github.benmanes.caffeine.cache.Caffeine
import com.stellarhex.model.ChunkDataDto
import java.util.concurrent.TimeUnit

private const val MAX_ENTRIES = 500L
private const val EXPIRE_MINUTES = 10L

class ChunkCache {
    private val cache = Caffeine.newBuilder()
        .maximumSize(MAX_ENTRIES)
        .expireAfterAccess(EXPIRE_MINUTES, TimeUnit.MINUTES)
        .recordStats()
        .build<String, ChunkDataDto>()

    val hits: Long get() = cache.stats().hitCount()
    val misses: Long get() = cache.stats().missCount()
    val evictions: Long get() = cache.stats().evictionCount()
    val size: Long get() = cache.estimatedSize()

    fun get(seed: Int, cx: Int, cy: Int): ChunkDataDto? {
        val key = "$seed:$cx,$cy"
        return cache.getIfPresent(key)
    }

    fun put(seed: Int, cx: Int, cy: Int, chunk: ChunkDataDto) {
        val key = "$seed:$cx,$cy"
        cache.put(key, chunk)
    }
}
