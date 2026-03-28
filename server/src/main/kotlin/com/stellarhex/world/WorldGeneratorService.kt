package com.stellarhex.world

import com.stellarhex.model.*
import org.springframework.stereotype.Service
import kotlin.math.floor
import kotlin.math.round
import kotlin.math.sqrt

private const val CHUNK_SIZE = 16
private const val SYSTEM_SPACING = 32
private const val NEBULA_NOISE_THRESHOLD = 0.65
private const val SYSTEM_PROBABILITY = 0.4
private const val TRADE_HUB_SPACING = 48

private val STAR_CLASSES = listOf("O", "B", "A", "F", "G", "K", "M")
private val STAR_CLASS_WEIGHTS = listOf(0.02, 0.05, 0.08, 0.15, 0.2, 0.25, 0.25)

private val STAR_SIZES = mapOf("O" to 5, "B" to 4, "A" to 3, "F" to 3, "G" to 2, "K" to 2, "M" to 1)
private val STAR_ENERGY = mapOf("O" to 10, "B" to 8, "A" to 6, "F" to 5, "G" to 4, "K" to 3, "M" to 2)

private val ANOMALY_TYPES = listOf("derelict_ship", "resource_cache", "alien_signal", "wormhole", "ancient_ruins")

data class StarSystemAnchor(
    val center: HexCoord,
    val starClass: String,
    val planetCount: Int,
    val seed: Long,
)

@Service
class WorldGeneratorService {

    fun generate(seed: Int, cx: Int, cy: Int): ChunkDataDto {
        val hexes = mutableMapOf<String, HexDataDto>()
        val baseQ = cx * CHUNK_SIZE
        val baseR = cy * CHUNK_SIZE

        val centerQ = baseQ + CHUNK_SIZE / 2
        val centerR = baseR + CHUNK_SIZE / 2
        val systems = getNearbySystems(seed, centerQ, centerR)

        for (dq in 0 until CHUNK_SIZE) {
            for (dr in 0 until CHUNK_SIZE) {
                val q = baseQ + dq
                val r = baseR + dr
                val key = "$q,$r"
                val hex = HexCoord(q, r)

                val obj = generateHex(hex, systems, seed)
                val anomaly = if (obj == null) generateAnomaly(q, r, seed) else null
                val tradeHub = if (obj == null && anomaly == null) generateTradeHub(q, r, seed) else null

                val (wx, wy) = HexMath.hexToPixel(q, r, 1)
                val nebulaNoise = NoiseGenerator.fbmNoise(wx * 0.025, wy * 0.025, seed + 1000, 3)
                val inNebula = if (nebulaNoise > NEBULA_NOISE_THRESHOLD) true else null

                hexes[key] = HexDataDto(
                    q = q, r = r,
                    obj = obj,
                    anomaly = anomaly,
                    tradeHub = if (tradeHub == true) true else null,
                    inNebula = inNebula,
                )
            }
        }

        return ChunkDataDto(cx = cx, cy = cy, hexes = hexes)
    }

    fun getNearbySystems(seed: Int, q: Int, r: Int): List<StarSystemAnchor> {
        val (x, y) = HexMath.hexToPixel(q, r, 1)
        val coarseX = floor(x / SYSTEM_SPACING).toInt()
        val coarseY = floor(y / SYSTEM_SPACING).toInt()
        val systems = mutableListOf<StarSystemAnchor>()

        for (dx in -2..2) {
            for (dy in -2..2) {
                val cx = coarseX + dx
                val cy = coarseY + dy
                val cellHash = NoiseGenerator.hashCoord(seed, cx, cy)
                val cellRng = NoiseGenerator.seededRNG(cellHash.toInt())

                if (cellRng.next() > SYSTEM_PROBABILITY) continue

                val jitterX = cellRng.next() * SYSTEM_SPACING * 0.6 + SYSTEM_SPACING * 0.2
                val jitterY = cellRng.next() * SYSTEM_SPACING * 0.6 + SYSTEM_SPACING * 0.2
                val worldX = cx * SYSTEM_SPACING + jitterX
                val worldY = cy * SYSTEM_SPACING + jitterY

                val starQ = round((2.0 / 3.0) * worldX).toInt()
                val starR = round((-1.0 / 3.0) * worldX + (sqrt(3.0) / 3.0) * worldY).toInt()

                val starClass = pickStarClass(cellRng.next())
                val planetCount = floor(cellRng.next() * 5).toInt() + 1

                systems.add(
                    StarSystemAnchor(
                        center = HexCoord(starQ, starR),
                        starClass = starClass,
                        planetCount = planetCount,
                        seed = cellHash,
                    )
                )
            }
        }

        return systems
    }

    private fun generateHex(hex: HexCoord, systems: List<StarSystemAnchor>, seed: Int): StellarObjectDto? {
        // Check star centers
        for (sys in systems) {
            if (sys.center.q == hex.q && sys.center.r == hex.r) {
                return StellarObjectDto(
                    type = "star",
                    subtype = sys.starClass,
                    size = STAR_SIZES[sys.starClass] ?: 1,
                    resources = ResourcesDto(energy = STAR_ENERGY[sys.starClass] ?: 2),
                )
            }
        }

        // Orbital rings
        for (sys in systems) {
            val dist = HexMath.hexDistance(hex, sys.center)
            if (dist in 2..4) {
                val rng = NoiseGenerator.seededRNG(NoiseGenerator.hash3(sys.seed.toInt(), hex.q, hex.r).toInt())
                val roll = rng.next()

                if (roll < 0.12) {
                    val planetRoll = rng.next()
                    val subtype = when {
                        planetRoll < 0.3 -> "rocky"
                        planetRoll < 0.55 -> "gas_giant"
                        planetRoll < 0.8 -> "ice"
                        else -> "lava"
                    }
                    return StellarObjectDto(
                        type = "planet",
                        subtype = subtype,
                        size = floor(rng.next() * 3).toInt() + 1,
                        resources = ResourcesDto(
                            alloys = floor(rng.next() * 3).toInt() + 1,
                            credits = floor(rng.next() * 2).toInt() + 1,
                        ),
                        orbitAnchor = HexCoordDto(sys.center.q, sys.center.r, sys.center.s),
                    )
                }

                if (roll < 0.16) {
                    return StellarObjectDto(
                        type = "moon",
                        size = 1,
                        resources = ResourcesDto(minerals = 1),
                        orbitAnchor = HexCoordDto(sys.center.q, sys.center.r, sys.center.s),
                    )
                }
            }
        }

        // Nebula
        val (wx, wy) = HexMath.hexToPixel(hex.q, hex.r, 1)
        val nebulaNoise = NoiseGenerator.fbmNoise(wx * 0.025, wy * 0.025, seed + 1000, 3)
        if (nebulaNoise > NEBULA_NOISE_THRESHOLD) {
            return StellarObjectDto(
                type = "nebula",
                subtype = if (nebulaNoise > 0.78) "dense" else "sparse",
                size = 1,
            )
        }

        // Asteroids
        val asteroidNoise = NoiseGenerator.fbmNoise(wx * 0.04, wy * 0.04, seed + 2000, 3)
        if (asteroidNoise > 0.62) {
            val rng = NoiseGenerator.seededRNG(NoiseGenerator.hash3(seed, hex.q, hex.r).toInt())
            if (rng.next() < 0.55) {
                return StellarObjectDto(
                    type = "asteroid_field",
                    size = 1,
                    resources = ResourcesDto(minerals = floor(rng.next() * 3).toInt() + 1),
                )
            }
            if (rng.next() < 0.3) {
                return StellarObjectDto(
                    type = "asteroid",
                    size = 1,
                    resources = ResourcesDto(minerals = floor(rng.next() * 2).toInt() + 1),
                )
            }
        }

        // Comet (~0.3%)
        val cometHash = NoiseGenerator.hash3(seed + 3000, hex.q, hex.r)
        if ((cometHash and 0x3ff) < 3) {
            val rng = NoiseGenerator.seededRNG(cometHash.toInt())
            return StellarObjectDto(
                type = "comet",
                size = 1,
                velocity = HexCoordDto(
                    q = floor(rng.next() * 3).toInt() - 1,
                    r = floor(rng.next() * 3).toInt() - 1,
                ),
            )
        }

        // Black hole (~0.1%)
        val bhHash = NoiseGenerator.hash3(seed + 4000, hex.q, hex.r)
        if ((bhHash and 0x3ff) < 1) {
            return StellarObjectDto(type = "black_hole", size = 2)
        }

        return null
    }

    private fun generateAnomaly(q: Int, r: Int, seed: Int): String? {
        val h = NoiseGenerator.hash3(seed + 5000, q, r)
        if ((h and 0x3ff) >= 15) return null
        val rng = NoiseGenerator.seededRNG(h.toInt())
        return ANOMALY_TYPES[floor(rng.next() * ANOMALY_TYPES.size).toInt()]
    }

    private fun generateTradeHub(q: Int, r: Int, seed: Int): Boolean {
        val coarseX = floor(q.toDouble() / TRADE_HUB_SPACING).toInt()
        val coarseY = floor(r.toDouble() / TRADE_HUB_SPACING).toInt()
        val cellSeed = NoiseGenerator.hash3(seed + 7777, coarseX, coarseY)
        val rng = NoiseGenerator.seededRNG(cellSeed.toInt())
        if (rng.next() > 0.3) return false
        val hubQ = coarseX * TRADE_HUB_SPACING + floor(rng.next() * TRADE_HUB_SPACING * 0.6 + TRADE_HUB_SPACING * 0.2).toInt()
        val hubR = coarseY * TRADE_HUB_SPACING + floor(rng.next() * TRADE_HUB_SPACING * 0.6 + TRADE_HUB_SPACING * 0.2).toInt()
        return q == hubQ && r == hubR
    }

    private fun pickStarClass(roll: Double): String {
        var cumulative = 0.0
        for (i in STAR_CLASSES.indices) {
            cumulative += STAR_CLASS_WEIGHTS[i]
            if (roll < cumulative) return STAR_CLASSES[i]
        }
        return "M"
    }
}
