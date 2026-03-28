package com.stellarhex.game

import com.stellarhex.model.*

/**
 * Pure economy functions — no Spring annotations, no mutable state.
 * Mirrors the four pure functions from the TypeScript economy service.
 */
object EconomyService {

    /**
     * Compute per-turn resource income from all buildings owned by [playerId].
     * Each building contributes its yield from BUILDING_STATS.
     */
    fun computeIncome(buildings: Map<String, BuildingData>, playerId: String): Resources {
        var energy = 0
        var minerals = 0
        var alloys = 0
        var credits = 0
        for (building in buildings.values) {
            if (building.ownerId != playerId) continue
            val stats = BUILDING_STATS[building.type] ?: continue
            energy += stats.yield.energy
            minerals += stats.yield.minerals
            alloys += stats.yield.alloys
            credits += stats.yield.credits
        }
        return Resources(energy, minerals, alloys, credits)
    }

    /**
     * Compute per-turn resource income from mining drones owned by [playerId].
     * Each mining drone extracts resources from the hex it occupies,
     * based on that hex's resource yield (e.g. asteroids yield minerals).
     */
    fun computeMiningDroneIncome(
        units: Map<String, UnitData>,
        playerId: String,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): Resources {
        var energy = 0
        var minerals = 0
        var alloys = 0
        var credits = 0
        for (unit in units.values) {
            if (unit.ownerId != playerId || unit.type != UnitType.MINING_DRONE) continue
            val hex = hexLookup(unit.q, unit.r) ?: continue
            val res = hex.obj?.resources ?: continue
            energy += res.energy ?: 0
            minerals += res.minerals ?: 0
            alloys += res.alloys ?: 0
            credits += res.credits ?: 0
        }
        return Resources(energy, minerals, alloys, credits)
    }

    /**
     * Compute per-turn resource upkeep for all units owned by [playerId].
     * Scouts and mining drones have no upkeep.
     */
    fun computeUpkeep(units: Map<String, UnitData>, playerId: String): Resources {
        var energy = 0
        var minerals = 0
        var alloys = 0
        var credits = 0
        for (unit in units.values) {
            if (unit.ownerId != playerId) continue
            val cost = UNIT_UPKEEP[unit.type] ?: continue
            energy += cost.energy
            minerals += cost.minerals
            alloys += cost.alloys
            credits += cost.credits
        }
        return Resources(energy, minerals, alloys, credits)
    }

    /**
     * Compute net income (income minus upkeep) for each resource field.
     */
    fun computeNetIncome(income: Resources, upkeep: Resources): Resources = Resources(
        energy = income.energy - upkeep.energy,
        minerals = income.minerals - upkeep.minerals,
        alloys = income.alloys - upkeep.alloys,
        credits = income.credits - upkeep.credits,
    )
}
