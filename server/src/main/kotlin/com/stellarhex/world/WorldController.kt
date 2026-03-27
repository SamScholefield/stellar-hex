package com.stellarhex.world

import com.stellarhex.model.ChunkResponseDto
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class WorldController(
    private val worldGenerator: WorldGeneratorService,
) {
    private val cache = ChunkCache()

    @GetMapping("/world/chunks")
    fun getChunks(
        @RequestParam seed: Long,
        @RequestParam coords: String,
    ): ChunkResponseDto {
        val seedInt = seed.toInt()
        val chunkCoords = coords.split(";").map { pair ->
            val (cx, cy) = pair.split(",").map { it.trim().toInt() }
            Pair(cx, cy)
        }

        val chunks = chunkCoords.map { (cx, cy) ->
            cache.get(seedInt, cx, cy)
                ?: worldGenerator.generate(seedInt, cx, cy).also { cache.put(seedInt, cx, cy, it) }
        }

        return ChunkResponseDto(chunks = chunks)
    }
}
