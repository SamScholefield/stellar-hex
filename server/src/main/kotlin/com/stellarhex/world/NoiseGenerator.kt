package com.stellarhex.world

import kotlin.math.floor

/**
 * Seeded random number generator and noise functions.
 * All functions are pure and deterministic.
 * Matches the JavaScript implementation in noise.ts exactly.
 *
 * IMPORTANT: JavaScript uses 32-bit integer overflow via `| 0` and `Math.imul()`.
 * Kotlin Int is 32-bit signed, so arithmetic naturally overflows the same way.
 * `>>> 0` in JS converts to unsigned — we use `ushr()` for unsigned right shift
 * and `toLong() and 0xFFFFFFFFL` to convert to unsigned for division.
 */
object NoiseGenerator {

    /** Mulberry32 PRNG — returns values in [0, 1). */
    class SeededRNG(seed: Int) {
        private var s: Int = seed

        fun next(): Double {
            s = s + 0x6d2b79f5
            var t = (s xor (s ushr 15)) * (1 or s)
            t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
            // (t ^ (t >>> 14)) >>> 0  →  unsigned 32-bit
            val unsigned = (t xor (t ushr 14)).toLong() and 0xFFFFFFFFL
            return unsigned.toDouble() / 4294967296.0
        }
    }

    fun seededRNG(seed: Int): SeededRNG = SeededRNG(seed)

    /** Deterministic hash for a pair of coordinates + seed. Returns unsigned 32-bit as Long. */
    fun hashCoord(seed: Int, cx: Int, cy: Int): Long {
        var h = seed
        h = (h xor cx) * 0x45d9f3b + 0x27d4eb2d
        h = (h xor cy) * 0x45d9f3b + 0x27d4eb2d
        h = h xor (h ushr 16)
        return h.toLong() and 0xFFFFFFFFL
    }

    /** Deterministic hash for seed + two values. Returns unsigned 32-bit as Long. */
    fun hash3(seed: Int, a: Int, b: Int): Long {
        var h = seed
        h = (h xor (a * 374761393)) * 0x85ebca6b.toInt()
        h = (h xor (b * 668265263)) * 0xc2b2ae35.toInt()
        h = h xor (h ushr 16)
        return h.toLong() and 0xFFFFFFFFL
    }

    private fun smoothstep(t: Double): Double = t * t * (3.0 - 2.0 * t)

    private fun valueNoiseHash(ix: Int, iy: Int, seed: Int): Double {
        return (hashCoord(seed, ix, iy) and 0xFFFF).toDouble() / 0xFFFF.toDouble()
    }

    /** Simple 2D value noise in [0, 1]. */
    private fun valueNoise(x: Double, y: Double, seed: Int): Double {
        val ix = floor(x).toInt()
        val iy = floor(y).toInt()
        val fx = smoothstep(x - ix)
        val fy = smoothstep(y - iy)

        val n00 = valueNoiseHash(ix, iy, seed)
        val n10 = valueNoiseHash(ix + 1, iy, seed)
        val n01 = valueNoiseHash(ix, iy + 1, seed)
        val n11 = valueNoiseHash(ix + 1, iy + 1, seed)

        val nx0 = n00 + (n10 - n00) * fx
        val nx1 = n01 + (n11 - n01) * fx
        return nx0 + (nx1 - nx0) * fy
    }

    /** Fractal Brownian Motion layered noise. Returns value roughly in [0, 1]. */
    fun fbmNoise(x: Double, y: Double, seed: Int, octaves: Int = 4): Double {
        var value = 0.0
        var amplitude = 0.5
        var frequency = 1.0
        var maxValue = 0.0

        for (i in 0 until octaves) {
            value += valueNoise(x * frequency, y * frequency, seed + i * 31) * amplitude
            maxValue += amplitude
            amplitude *= 0.5
            frequency *= 2.0
        }

        return value / maxValue
    }
}
