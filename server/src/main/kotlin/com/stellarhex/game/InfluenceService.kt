package com.stellarhex.game

import com.stellarhex.model.*
import com.stellarhex.world.HexMath
import kotlin.math.abs
import kotlin.math.max

/**
 * Pure influence functions — no Spring annotations, no mutable state.
 * Mirrors the two pure functions from the TypeScript influence module.
 */
object InfluenceService {

    /**
     * Compute the set of hex keys within the sphere of influence for a player's buildings.
     * Uses each building's sightRange from BUILDING_STATS plus [sightRangeBonus] as the
     * influence radius.
     */
    fun computeInfluenceForPlayer(
        buildings: Map<String, BuildingData>,
        playerId: String,
        sightRangeBonus: Int = 0,
    ): Set<String> {
        val result = mutableSetOf<String>()
        for (building in buildings.values) {
            if (building.ownerId != playerId) continue
            val stats = BUILDING_STATS[building.type] ?: continue
            val range = stats.sightRange + sightRangeBonus
            result.addAll(HexMath.hexKeysInRange(building.q, building.r, range))
        }
        return result
    }

    /**
     * Check if any enemy unit's sightRange reaches the given hex.
     * Uses cube distance: max(|dq|, |dr|, |dq+dr|) <= unit.sightRange
     */
    fun isNearAnyEnemyUnit(
        q: Int,
        r: Int,
        units: Map<String, UnitData>,
        friendlyPlayerId: String,
    ): Boolean {
        for (unit in units.values) {
            if (unit.ownerId == friendlyPlayerId) continue
            val dq = q - unit.q
            val dr = r - unit.r
            val ds = -dq - dr
            val dist = max(max(abs(dq), abs(dr)), abs(ds))
            if (dist <= unit.sightRange) return true
        }
        return false
    }
}
