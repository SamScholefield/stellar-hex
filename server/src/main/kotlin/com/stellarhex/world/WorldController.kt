package com.stellarhex.world

import com.stellarhex.model.ChunkResponseDto
import org.slf4j.LoggerFactory
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class WorldController(
    private val worldGenerator: WorldGeneratorService,
) {
    private val log = LoggerFactory.getLogger(WorldController::class.java)
    private val cache = ChunkCache()

    @GetMapping("/world/chunks")
    fun getChunks(
        @RequestParam seed: Long,
        @RequestParam coords: String,
    ): ChunkResponseDto {
        val requestStart = System.nanoTime()
        val seedInt = seed.toInt()
        val chunkCoords = coords.split(";").map { pair ->
            val (cx, cy) = pair.split(",").map { it.trim().toInt() }
            Pair(cx, cy)
        }

        var cacheHits = 0
        var generated = 0
        var genTimeNs = 0L

        val chunks = chunkCoords.map { (cx, cy) ->
            val cached = cache.get(seedInt, cx, cy)
            if (cached != null) {
                cacheHits++
                cached
            } else {
                generated++
                val genStart = System.nanoTime()
                val chunk = worldGenerator.generate(seedInt, cx, cy)
                genTimeNs += System.nanoTime() - genStart
                cache.put(seedInt, cx, cy, chunk)
                chunk
            }
        }

        val totalMs = (System.nanoTime() - requestStart) / 1_000_000.0
        val genMs = genTimeNs / 1_000_000.0
        val avgGenMs = if (generated > 0) genMs / generated else 0.0

        log.info(
            "[chunks] {} requested, {} hits, {} generated in {:.1f}ms (gen {:.1f}ms, avg {:.1f}ms/chunk) | cache: {} entries, {}/{} hit/miss total",
            chunkCoords.size, cacheHits, generated, totalMs, genMs, avgGenMs,
            cache.size, cache.hits.get(), cache.misses.get(),
        )

        return ChunkResponseDto(chunks = chunks)
    }

    @GetMapping("/world/perf")
    fun getPerf(): Map<String, Any> = mapOf(
        "cacheSize" to cache.size,
        "cacheHits" to cache.hits.get(),
        "cacheMisses" to cache.misses.get(),
        "cacheEvictions" to cache.evictions.get(),
        "hitRate" to if (cache.hits.get() + cache.misses.get() > 0) {
            "%.1f%%".format(cache.hits.get() * 100.0 / (cache.hits.get() + cache.misses.get()))
        } else "N/A",
    )
}
