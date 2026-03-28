package com.stellarhex.world

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.round
import kotlin.math.sqrt

data class HexCoord(val q: Int, val r: Int, val s: Int = -q - r)

object HexMath {

    private val SQRT3 = sqrt(3.0)

    private val DIRECTIONS = listOf(
        HexCoord(1, 0), HexCoord(1, -1), HexCoord(0, -1),
        HexCoord(-1, 0), HexCoord(-1, 1), HexCoord(0, 1),
    )

    /** Return the six neighbors of a hex in axial coordinates. */
    fun hexNeighbors(q: Int, r: Int): List<HexCoord> =
        DIRECTIONS.map { d -> HexCoord(q + d.q, r + d.r) }

    fun toHexCoord(q: Int, r: Int) = HexCoord(q, r, -q - r)

    /** Flat-top hex: convert axial (q, r) to pixel center. */
    fun hexToPixel(q: Int, r: Int, size: Int = 1): Pair<Double, Double> {
        val x = size * (1.5 * q)
        val y = size * (SQRT3 / 2.0 * q + SQRT3 * r)
        return Pair(x, y)
    }

    /** Manhattan distance in cube coordinates. */
    fun hexDistance(a: HexCoord, b: HexCoord): Int {
        return max(max(abs(a.q - b.q), abs(a.r - b.r)), abs(a.s - b.s))
    }

    /** Canonical hex key string for axial coordinates. */
    fun hexKey(q: Int, r: Int): String = "$q,$r"

    /** All hex keys within `range` steps of center (cq, cr). */
    fun hexKeysInRange(cq: Int, cr: Int, range: Int): List<String> {
        val keys = mutableListOf<String>()
        for (dq in -range..range) {
            val rMin = max(-range, -dq - range)
            val rMax = kotlin.math.min(range, -dq + range)
            for (dr in rMin..rMax) {
                keys.add(hexKey(cq + dq, cr + dr))
            }
        }
        return keys
    }
}
