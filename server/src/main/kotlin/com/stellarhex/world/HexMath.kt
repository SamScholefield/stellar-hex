package com.stellarhex.world

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.round
import kotlin.math.sqrt

data class HexCoord(val q: Int, val r: Int, val s: Int = -q - r)

object HexMath {

    private val SQRT3 = sqrt(3.0)

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
}
