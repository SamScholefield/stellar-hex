package com.stellarhex.ai

import com.stellarhex.game.CombatResolver
import com.stellarhex.model.*
import com.stellarhex.world.HexCoord
import com.stellarhex.world.HexMath

// ── Result types ────────────────────────────────────────────────────

data class ExploreResult(
    val target: HexCoord,
    val score: Int,
)

data class AttackScoreResult(
    val targetId: String,
    val score: Int,
)

data class BuildScoreResult(
    val buildingType: BuildingType,
    val hex: HexCoord,
    val hexType: String,
    val adjacentHexTypes: List<String>,
    val nearbyHasPlanet: Boolean,
    val score: Int,
)

data class ProductionScoreResult(
    val buildingId: String,
    val unitType: UnitType,
    val score: Int,
)

data class ResearchScoreResult(
    val buildingId: String,
    val techId: TechId,
    val score: Int,
)

/**
 * Pure scoring functions for the AI player.
 * All functions are stateless and deterministic (given the same inputs).
 */
object AiScoring {

    /**
     * Score exploration targets for a unit.
     * Finds the nearest unexplored hex reachable in ~2 turns, preferring
     * directions with clusters of unexplored hexes.
     */
    fun scoreExplore(
        unit: UnitData,
        exploredHexes: Set<String>,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): ExploreResult? {
        val unitCoord = HexMath.toHexCoord(unit.q, unit.r)
        val searchRadius = unit.maxMovementPoints * 2

        var bestTarget: HexCoord? = null
        var bestScore = Int.MIN_VALUE

        for (radius in 1..searchRadius) {
            val ring = hexesInRange(unitCoord, radius)
            for (hex in ring) {
                val key = HexMath.hexKey(hex.q, hex.r)
                if (key in exploredHexes) continue

                // Score by number of unexplored neighbors (cluster bonus) and closeness
                var clusterCount = 0
                for (neighbor in HexMath.hexNeighbors(hex.q, hex.r)) {
                    if (HexMath.hexKey(neighbor.q, neighbor.r) !in exploredHexes) {
                        clusterCount++
                    }
                }

                val dist = HexMath.hexDistance(unitCoord, hex)
                val score = clusterCount * 2 - dist

                if (score > bestScore) {
                    bestScore = score
                    bestTarget = hex
                }
            }
        }

        return bestTarget?.let { ExploreResult(it, bestScore) }
    }

    /**
     * Score attack targets for a unit.
     * Previews combat and returns the best favorable target (units or buildings).
     */
    fun scoreAttack(
        attacker: UnitData,
        enemies: List<UnitData>,
        seed: Int,
        enemyBuildings: List<BuildingData>? = null,
    ): AttackScoreResult? {
        if (attacker.weapon == null || attacker.hasAttacked) return null

        val attackerCoord = HexMath.toHexCoord(attacker.q, attacker.r)
        var bestResult: AttackScoreResult? = null

        for (enemy in enemies) {
            val enemyCoord = HexMath.toHexCoord(enemy.q, enemy.r)
            val dist = HexMath.hexDistance(attackerCoord, enemyCoord)
            if (dist > attacker.range) continue

            val combat = CombatResolver.resolveCombat(attacker, enemy, dist, seed)

            var score = combat.defenderDamage - combat.attackerDamage
            if (combat.defenderDestroyed) score += 20
            if (combat.attackerDestroyed) score -= 30

            // Skip unfavorable attacks
            if (combat.attackerDestroyed) continue
            if (score < 0) continue

            if (bestResult == null || score > bestResult.score) {
                bestResult = AttackScoreResult(enemy.id, score)
            }
        }

        // Score building targets -- no retaliation makes these attractive
        if (enemyBuildings != null) {
            for (building in enemyBuildings) {
                val bCoord = HexMath.toHexCoord(building.q, building.r)
                val dist = HexMath.hexDistance(attackerCoord, bCoord)
                if (dist > attacker.range) continue

                val bCombat = CombatResolver.resolveBuildingCombat(attacker, building, seed)
                var score = bCombat.damage + 5
                if (bCombat.destroyed) score += 25

                if (bestResult == null || score > bestResult.score) {
                    bestResult = AttackScoreResult(building.id, score)
                }
            }
        }

        return bestResult
    }

    /**
     * Score building placements for the AI player.
     * Checks explored hexes near units/buildings for buildable locations.
     */
    fun scoreBuild(
        player: PlayerState,
        buildings: Map<String, BuildingData>,
        units: Map<String, UnitData>,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): BuildScoreResult? {
        val ownedPositions = mutableListOf<HexCoord>()

        for (unit in units.values) {
            if (unit.ownerId == player.id) {
                ownedPositions.add(HexMath.toHexCoord(unit.q, unit.r))
            }
        }
        for (building in buildings.values) {
            if (building.ownerId == player.id) {
                ownedPositions.add(HexMath.toHexCoord(building.q, building.r))
            }
        }

        val buildingPositions = mutableSetOf<String>()
        for (b in buildings.values) {
            buildingPositions.add(HexMath.hexKey(b.q, b.r))
        }

        var bestResult: BuildScoreResult? = null

        for (pos in ownedPositions) {
            val nearby = hexesInRange(pos, 2)
            for (hex in nearby) {
                val key = HexMath.hexKey(hex.q, hex.r)
                if (key !in player.exploredHexes) continue
                if (key in buildingPositions) continue

                // Require friendly unit at hex
                val hasUnitAtHex = units.values.any {
                    it.ownerId == player.id && it.q == hex.q && it.r == hex.r
                }
                if (!hasUnitAtHex) continue

                val hexData = hexLookup(hex.q, hex.r) ?: continue
                val hexType = hexData.obj?.type ?: "empty"
                var nearbyPlanetChecked = false
                var nearbyPlanetResult = false

                for ((bt, stats) in BUILDING_STATS) {
                    val stellarType = try {
                        StellarObjectType.fromId(hexType)
                    } catch (_: Exception) {
                        continue
                    }
                    if (stellarType !in stats.allowedHexTypes) continue
                    if (!canAfford(player.resources, stats.cost)) continue

                    // Colony requires colony_ship at location
                    if (bt == BuildingType.COLONY) {
                        val hasColonyShip = units.values.any {
                            it.ownerId == player.id && it.type == UnitType.COLONY_SHIP && it.q == hex.q && it.r == hex.r
                        }
                        if (!hasColonyShip) continue
                    }

                    // Starbase requires scout at location + planet within 8 hexes
                    if (bt == BuildingType.STARBASE) {
                        val hasScout = units.values.any {
                            it.ownerId == player.id && it.type == UnitType.SCOUT && it.q == hex.q && it.r == hex.r
                        }
                        if (!hasScout) continue
                        if (!nearbyPlanetChecked) {
                            nearbyPlanetChecked = true
                            nearbyPlanetResult = hexesInRange(hex, 8).any { h ->
                                val hd = hexLookup(h.q, h.r)
                                hd?.obj?.type == "planet"
                            }
                        }
                        if (!nearbyPlanetResult) continue
                    }

                    // Solar collector requires adjacent star
                    if (bt == BuildingType.SOLAR_COLLECTOR) {
                        val hasAdjacentStar = HexMath.hexNeighbors(hex.q, hex.r).any { n ->
                            val hd = hexLookup(n.q, n.r)
                            hd?.obj?.type == "star"
                        }
                        if (!hasAdjacentStar) continue
                    }

                    // Score: yield per cost ratio
                    val totalYield = stats.yield.energy + stats.yield.minerals +
                        stats.yield.alloys + stats.yield.credits
                    val totalCost = stats.cost.energy + stats.cost.minerals +
                        stats.cost.alloys + stats.cost.credits
                    val score = if (totalCost > 0) (totalYield.toDouble() / totalCost * 100).toInt() else 0

                    if (bestResult == null || score > bestResult.score) {
                        if (!nearbyPlanetChecked) {
                            nearbyPlanetChecked = true
                            nearbyPlanetResult = hexesInRange(hex, 8).any { h ->
                                val hd = hexLookup(h.q, h.r)
                                hd?.obj?.type == "planet"
                            }
                        }
                        val adjacentHexTypes = HexMath.hexNeighbors(hex.q, hex.r).map { n ->
                            val hd = hexLookup(n.q, n.r)
                            hd?.obj?.type ?: "empty"
                        }
                        bestResult = BuildScoreResult(
                            buildingType = bt,
                            hex = hex,
                            hexType = hexType,
                            adjacentHexTypes = adjacentHexTypes,
                            nearbyHasPlanet = nearbyPlanetResult,
                            score = score,
                        )
                    }
                }
            }
        }

        return bestResult
    }

    /**
     * Score unit production for starbases.
     * If adding a unit's upkeep would push net energy below -5, skip it.
     */
    fun scoreProduction(
        player: PlayerState,
        buildings: Map<String, BuildingData>,
        units: Map<String, UnitData>,
        enemyNearby: Boolean,
        netEnergyIncome: Int? = null,
    ): ProductionScoreResult? {
        var bestResult: ProductionScoreResult? = null

        for ((bId, building) in buildings) {
            if (building.ownerId != player.id) continue
            if (building.type != BuildingType.STARBASE) continue
            if (!building.productionQueue.isNullOrEmpty()) continue

            // Count owned units by type
            var scoutCount = 0
            var combatCount = 0
            var miningDroneCount = 0
            var colonyShipCount = 0
            var colonyCount = 0
            for (u in units.values) {
                if (u.ownerId != player.id) continue
                when (u.type) {
                    UnitType.SCOUT -> scoutCount++
                    UnitType.MINING_DRONE -> miningDroneCount++
                    UnitType.COLONY_SHIP -> colonyShipCount++
                    UnitType.FIGHTER, UnitType.CORVETTE, UnitType.FRIGATE,
                    UnitType.CRUISER, UnitType.BATTLESHIP -> combatCount++
                    else -> {}
                }
            }
            for (b in buildings.values) {
                if (b.ownerId == player.id && b.type == BuildingType.COLONY) colonyCount++
            }

            var unitType: UnitType
            var score: Int

            if (enemyNearby) {
                val bs = UNIT_STATS[UnitType.BATTLESHIP]!!
                val cr = UNIT_STATS[UnitType.CRUISER]!!
                val fr = UNIT_STATS[UnitType.FRIGATE]!!
                val cv = UNIT_STATS[UnitType.CORVETTE]!!
                val fi = UNIT_STATS[UnitType.FIGHTER]!!

                if (canAfford(player.resources, bs.cost) && canSustainUpkeep(UnitType.BATTLESHIP, netEnergyIncome)) {
                    unitType = UnitType.BATTLESHIP; score = 90
                } else if (canAfford(player.resources, cr.cost) && canSustainUpkeep(UnitType.CRUISER, netEnergyIncome)) {
                    unitType = UnitType.CRUISER; score = 85
                } else if (canAfford(player.resources, fr.cost) && canSustainUpkeep(UnitType.FRIGATE, netEnergyIncome)) {
                    unitType = UnitType.FRIGATE; score = 82
                } else if (canAfford(player.resources, cv.cost) && canSustainUpkeep(UnitType.CORVETTE, netEnergyIncome)) {
                    unitType = UnitType.CORVETTE; score = 80
                } else if (canAfford(player.resources, fi.cost) && canSustainUpkeep(UnitType.FIGHTER, netEnergyIncome)) {
                    unitType = UnitType.FIGHTER; score = 78
                } else {
                    continue
                }
            } else if (scoutCount < 2 && canAfford(player.resources, UNIT_STATS[UnitType.SCOUT]!!.cost)) {
                unitType = UnitType.SCOUT; score = 60
            } else if (miningDroneCount < 3 && canAfford(player.resources, UNIT_STATS[UnitType.MINING_DRONE]!!.cost)) {
                unitType = UnitType.MINING_DRONE; score = 55
            } else if (colonyShipCount < 1 && colonyCount < 2 && canAfford(player.resources, UNIT_STATS[UnitType.COLONY_SHIP]!!.cost)) {
                unitType = UnitType.COLONY_SHIP; score = 52
            } else if (combatCount < 3 && canAfford(player.resources, UNIT_STATS[UnitType.CORVETTE]!!.cost) && canSustainUpkeep(UnitType.CORVETTE, netEnergyIncome)) {
                unitType = UnitType.CORVETTE; score = 50
            } else if (combatCount < 3 && canAfford(player.resources, UNIT_STATS[UnitType.FIGHTER]!!.cost) && canSustainUpkeep(UnitType.FIGHTER, netEnergyIncome)) {
                unitType = UnitType.FIGHTER; score = 45
            } else if (canAfford(player.resources, UNIT_STATS[UnitType.FRIGATE]!!.cost) && canSustainUpkeep(UnitType.FRIGATE, netEnergyIncome)) {
                unitType = UnitType.FRIGATE; score = 40
            } else {
                continue
            }

            if (bestResult == null || score > bestResult.score) {
                bestResult = ProductionScoreResult(bId, unitType, score)
            }
        }

        return bestResult
    }

    /**
     * Score research options for the AI.
     * Prefers weapons/armor if enemies are visible, systems/drive otherwise.
     */
    fun scoreResearch(
        player: PlayerState,
        buildings: Map<String, BuildingData>,
        enemyNearby: Boolean,
    ): ResearchScoreResult? {
        var bestResult: ResearchScoreResult? = null

        // Collect all techs already queued across all labs
        val queuedTechs = mutableSetOf<TechId>()
        for (b in buildings.values) {
            if (b.ownerId != player.id || b.type != BuildingType.RESEARCH_LAB) continue
            b.researchQueue?.forEach { queuedTechs.add(it.techId) }
        }

        for ((bId, building) in buildings) {
            if (building.ownerId != player.id) continue
            if (building.type != BuildingType.RESEARCH_LAB) continue
            if (!building.researchQueue.isNullOrEmpty()) continue

            for ((techId, def) in TECH_TREE) {
                if (techId in queuedTechs) continue
                if (!canResearch(techId, player.researchedTechs)) continue
                if (!canAfford(player.resources, def.cost)) continue

                val score: Int
                if (enemyNearby) {
                    val branchPriority = mapOf(
                        TechBranch.WEAPONS to 50, TechBranch.ARMOR to 45,
                        TechBranch.SHIELDS to 40, TechBranch.DRIVE to 30, TechBranch.SYSTEMS to 25,
                    )
                    score = (branchPriority[def.branch] ?: 20) + def.tier.level * 5
                } else {
                    val branchPriority = mapOf(
                        TechBranch.SYSTEMS to 50, TechBranch.DRIVE to 45,
                        TechBranch.SHIELDS to 30, TechBranch.WEAPONS to 25, TechBranch.ARMOR to 20,
                    )
                    score = (branchPriority[def.branch] ?: 20) + def.tier.level * 5
                }

                if (bestResult == null || score > bestResult.score) {
                    bestResult = ResearchScoreResult(bId, techId, score)
                }
            }
        }

        return bestResult
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun canSustainUpkeep(unitType: UnitType, netEnergyIncome: Int?): Boolean {
        if (netEnergyIncome == null) return true
        val upkeep = UNIT_UPKEEP[unitType] ?: return true
        return (netEnergyIncome - upkeep.energy) >= -5
    }

    /**
     * All hexes within [range] steps of [center] (inclusive).
     */
    internal fun hexesInRange(center: HexCoord, range: Int): List<HexCoord> {
        val results = mutableListOf<HexCoord>()
        for (dq in -range..range) {
            val rMin = maxOf(-range, -dq - range)
            val rMax = minOf(range, -dq + range)
            for (dr in rMin..rMax) {
                results.add(HexCoord(center.q + dq, center.r + dr))
            }
        }
        return results
    }
}
