package com.stellarhex.ai

import com.stellarhex.game.GameAction
import com.stellarhex.game.GameReducer
import com.stellarhex.model.*
import com.stellarhex.world.HexCoord
import com.stellarhex.world.HexMath
import java.util.PriorityQueue

/**
 * Server-side AI turn execution. Pure function: takes a game state, returns a new game state
 * after the AI has taken all its actions.
 *
 * Strips all animation/delay logic from the client-side AIService.
 * Applies actions sequentially via GameReducer.reduce().
 */
object AiService {

    /**
     * Execute a full AI turn for [playerId].
     * Returns the updated game state after all AI actions and END_TURN.
     *
     * @param state       Current game state
     * @param playerId    The AI player's ID
     * @param hexLookup   Function to look up hex data by axial coordinates
     */
    fun executeTurn(
        state: GameState,
        playerId: String,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): GameState {
        if (state.gameOver != null) return state
        val player = state.players.find { it.id == playerId } ?: return state
        if (player.eliminated) return state

        var current = state
        current = executeUnitActions(current, playerId, hexLookup)
        current = tryBuild(current, playerId, hexLookup)
        current = tryProduction(current, playerId)
        current = tryResearch(current, playerId)
        current = endTurn(current, playerId, hexLookup)
        return current
    }

    // ── Unit actions (attack / move / collect) ──────────────────────

    private fun executeUnitActions(
        state: GameState,
        playerId: String,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): GameState {
        var current = state
        val processedUnits = mutableSetOf<String>()
        val maxIterations = 20

        for (iteration in 0 until maxIterations) {
            val player = current.players.find { it.id == playerId } ?: break

            // Collect actionable units
            val myUnits = mutableListOf<UnitData>()
            val visibleEnemies = mutableListOf<UnitData>()
            for (u in current.units.values) {
                if (u.ownerId == playerId) {
                    if ((u.movementPoints > 0 || !u.hasAttacked) && u.id !in processedUnits) {
                        myUnits.add(u)
                    }
                } else if (HexMath.hexKey(u.q, u.r) in player.exploredHexes) {
                    visibleEnemies.add(u)
                }
            }

            val visibleEnemyBuildings = current.buildings.values.filter {
                it.ownerId != playerId && HexMath.hexKey(it.q, it.r) in player.exploredHexes
            }

            if (myUnits.isEmpty()) break

            // Sort: combat units first, then scouts, then others
            myUnits.sortBy { u ->
                when {
                    u.weapon != null && u.type != UnitType.SCOUT -> 0
                    u.type == UnitType.SCOUT -> 1
                    else -> 2
                }
            }

            val unit = myUnits[0]
            var acted = false

            // Try attack
            if (unit.weapon != null && !unit.hasAttacked) {
                val attackResult = AiScoring.scoreAttack(
                    unit, visibleEnemies, current.seed + current.turn, visibleEnemyBuildings,
                )
                if (attackResult != null) {
                    val target = current.units[attackResult.targetId]
                    val targetBuilding = if (target == null) current.buildings[attackResult.targetId] else null
                    if (target != null || targetBuilding != null) {
                        val result = GameReducer.attackWithResult(current, unit.id, attackResult.targetId)
                        if (result.combat != null) {
                            current = result.state
                            acted = true
                        }
                    }
                }
            }

            // Try move (if didn't attack or still has MP)
            if (!acted) {
                val freshUnit = current.units[unit.id]
                if (freshUnit != null && freshUnit.movementPoints > 0) {
                    val freshPlayer = current.players.find { it.id == playerId }
                    val moveTarget = if (freshPlayer != null) {
                        findMoveTarget(freshUnit, freshPlayer, current, hexLookup)
                    } else null

                    if (moveTarget != null) {
                        val blockedHexes = mutableSetOf<String>()
                        val targetKey = HexMath.hexKey(moveTarget.q, moveTarget.r)
                        for (u in current.units.values) {
                            if (u.id != freshUnit.id) blockedHexes.add(HexMath.hexKey(u.q, u.r))
                        }
                        for (b in current.buildings.values) {
                            if (b.ownerId != playerId) blockedHexes.add(HexMath.hexKey(b.q, b.r))
                        }
                        blockedHexes.remove(targetKey)

                        val isBlocked: (Int, Int) -> Boolean = { q, r -> HexMath.hexKey(q, r) in blockedHexes }
                        val costOverride = getUnitCostOverride(freshUnit.type)

                        val from = HexMath.toHexCoord(freshUnit.q, freshUnit.r)
                        var path = findPartialPath(from, moveTarget, freshUnit.movementPoints, hexLookup, isBlocked, costOverride)

                        // Don't move onto an occupied hex -- trim if path ends on another unit
                        if (path != null && path.size > 1) {
                            val last = path.last()
                            val occupied = current.units.values.any { it.id != freshUnit.id && it.q == last.q && it.r == last.r }
                            if (occupied) {
                                path = path.dropLast(1)
                            }
                        }

                        if (path != null && path.size > 1) {
                            val cost = pathCost(path, hexLookup, costOverride)
                            current = GameReducer.reduce(
                                current,
                                GameAction.MoveUnit(freshUnit.id, path, cost),
                            )

                            // After moving, try to collect anomaly at destination
                            current = tryCollectAnomaly(current, freshUnit.id, playerId)
                            acted = true
                        }
                    }
                }
            }

            if (!acted) {
                processedUnits.add(unit.id)
            }
        }

        return current
    }

    // ── Move target selection ───────────────────────────────────────

    private fun findMoveTarget(
        unit: UnitData,
        player: PlayerState,
        state: GameState,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): HexCoord? {
        // Combat units: move toward nearest visible enemy
        if (unit.weapon != null && unit.type != UnitType.SCOUT) {
            val unitCoord = HexMath.toHexCoord(unit.q, unit.r)
            var nearestEnemy: UnitData? = null
            var nearestDist = Int.MAX_VALUE

            for (u in state.units.values) {
                if (u.ownerId == player.id) continue
                if (HexMath.hexKey(u.q, u.r) !in player.exploredHexes) continue
                val dist = HexMath.hexDistance(unitCoord, HexMath.toHexCoord(u.q, u.r))
                if (dist < nearestDist) {
                    nearestDist = dist
                    nearestEnemy = u
                }
            }

            if (nearestEnemy != null) {
                return HexMath.toHexCoord(nearestEnemy.q, nearestEnemy.r)
            }
        }

        // Scouts: prefer moving toward visible anomalies
        if (unit.type == UnitType.SCOUT) {
            val anomalyTarget = findNearestAnomaly(unit, state)
            if (anomalyTarget != null) return anomalyTarget
        }

        // Mining drones: move toward asteroid/asteroid_field hexes
        if (unit.type == UnitType.MINING_DRONE) {
            val target = findResourceHex(unit, player, state, hexLookup, listOf("asteroid", "asteroid_field"))
            if (target != null) return target
        }

        // Colony ships: move toward planet hexes without buildings
        if (unit.type == UnitType.COLONY_SHIP) {
            val target = findResourceHex(unit, player, state, hexLookup, listOf("planet"))
            if (target != null) return target
        }

        // Explore
        val exploreResult = AiScoring.scoreExplore(unit, player.exploredHexes, hexLookup)
        return exploreResult?.target
    }

    private fun findNearestAnomaly(unit: UnitData, state: GameState): HexCoord? {
        val unitCoord = HexMath.toHexCoord(unit.q, unit.r)
        var nearest: HexCoord? = null
        var nearestDist = Int.MAX_VALUE

        for (anomaly in state.anomalies.values) {
            val coord = HexMath.toHexCoord(anomaly.q, anomaly.r)
            val dist = HexMath.hexDistance(unitCoord, coord)
            if (dist < nearestDist) {
                nearestDist = dist
                nearest = coord
            }
        }

        return nearest
    }

    private fun findResourceHex(
        unit: UnitData,
        player: PlayerState,
        state: GameState,
        hexLookup: (Int, Int) -> HexDataDto?,
        targetTypes: List<String>,
    ): HexCoord? {
        val unitCoord = HexMath.toHexCoord(unit.q, unit.r)
        val searchRadius = 12
        var nearest: HexCoord? = null
        var nearestDist = Int.MAX_VALUE

        val occupiedHexes = mutableSetOf<String>()
        for (b in state.buildings.values) {
            occupiedHexes.add(HexMath.hexKey(b.q, b.r))
        }
        if (unit.type == UnitType.MINING_DRONE) {
            for (u in state.units.values) {
                if (u.id != unit.id && u.type == UnitType.MINING_DRONE && u.ownerId == player.id) {
                    occupiedHexes.add(HexMath.hexKey(u.q, u.r))
                }
            }
        }

        val candidates = AiScoring.hexesInRange(unitCoord, searchRadius)
        for (hex in candidates) {
            val key = HexMath.hexKey(hex.q, hex.r)
            if (key !in player.exploredHexes) continue
            if (key in occupiedHexes) continue

            val hexData = hexLookup(hex.q, hex.r) ?: continue
            val hexType = hexData.obj?.type ?: "empty"
            if (hexType !in targetTypes) continue

            val dist = HexMath.hexDistance(unitCoord, hex)
            if (dist < nearestDist) {
                nearestDist = dist
                nearest = hex
            }
        }

        return nearest
    }

    private fun tryCollectAnomaly(state: GameState, unitId: String, playerId: String): GameState {
        val unit = state.units[unitId] ?: return state
        if (unit.type != UnitType.SCOUT) return state

        for (anomaly in state.anomalies.values) {
            if (anomaly.q == unit.q && anomaly.r == unit.r) {
                return GameReducer.reduce(
                    state,
                    GameAction.CollectAnomaly(anomalyId = anomaly.id, unitId = unitId),
                )
            }
        }
        return state
    }

    // ── Build / Produce / Research / End turn ───────────────────────

    private fun tryBuild(
        state: GameState,
        playerId: String,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): GameState {
        val player = state.players.find { it.id == playerId } ?: return state
        val buildResult = AiScoring.scoreBuild(player, state.buildings, state.units, hexLookup) ?: return state

        return GameReducer.reduce(
            state,
            GameAction.Build(
                playerId = playerId,
                buildingType = buildResult.buildingType,
                hex = buildResult.hex,
                hexType = buildResult.hexType,
                adjacentHexTypes = buildResult.adjacentHexTypes,
                nearbyHasPlanet = buildResult.nearbyHasPlanet,
            ),
        )
    }

    private fun tryProduction(state: GameState, playerId: String): GameState {
        val player = state.players.find { it.id == playerId } ?: return state
        val enemyNearby = hasEnemyNearby(playerId, state)
        val netEnergy = computeNetEnergyIncome(player, state)
        val prodResult = AiScoring.scoreProduction(
            player, state.buildings, state.units, enemyNearby, netEnergy,
        ) ?: return state

        return GameReducer.reduce(
            state,
            GameAction.ProduceUnit(
                buildingId = prodResult.buildingId,
                unitType = prodResult.unitType,
            ),
        )
    }

    private fun tryResearch(state: GameState, playerId: String): GameState {
        val player = state.players.find { it.id == playerId } ?: return state
        val enemyNearby = hasEnemyNearby(playerId, state)
        val resResult = AiScoring.scoreResearch(player, state.buildings, enemyNearby) ?: return state

        return GameReducer.reduce(
            state,
            GameAction.QueueResearch(
                buildingId = resResult.buildingId,
                techId = resResult.techId,
            ),
        )
    }

    private fun endTurn(
        state: GameState,
        playerId: String,
        hexLookup: (Int, Int) -> HexDataDto?,
    ): GameState {
        // Compute mining yields for END_TURN
        val miningYields = com.stellarhex.game.EconomyService.computeMiningDroneIncome(
            state.units, playerId, hexLookup,
        )
        return GameReducer.reduce(
            state,
            GameAction.EndTurn(miningYields = miningYields),
        )
    }

    // ── Helper functions ────────────────────────────────────────────

    private fun hasEnemyNearby(playerId: String, state: GameState): Boolean {
        val player = state.players.find { it.id == playerId } ?: return false
        for (u in state.units.values) {
            if (u.ownerId == playerId) continue
            if (HexMath.hexKey(u.q, u.r) in player.exploredHexes) return true
        }
        return false
    }

    private fun computeNetEnergyIncome(player: PlayerState, state: GameState): Int {
        var income = 0
        for (b in state.buildings.values) {
            if (b.ownerId != player.id) continue
            val stats = BUILDING_STATS[b.type] ?: continue
            income += stats.yield.energy
        }
        var upkeep = 0
        for (u in state.units.values) {
            if (u.ownerId != player.id) continue
            val cost = UNIT_UPKEEP[u.type] ?: continue
            upkeep += cost.energy
        }
        return income - upkeep
    }

    // ── Pathfinding ─────────────────────────────────────────────────
    // Inline A* implementation for the server (mirrors hex-pathfinder.ts)

    private val MOVEMENT_COSTS: Map<String, Int> = mapOf(
        "star" to Int.MAX_VALUE,
        "black_hole" to Int.MAX_VALUE,
        "nebula" to 2,
    )

    private fun moveCost(hex: HexDataDto?): Int {
        if (hex == null) return 1
        val type = hex.obj?.type ?: return 1
        if (type == "empty") return 1
        return MOVEMENT_COSTS[type] ?: 1
    }

    /** Cost override for mining drones: stars cost 2 MP instead of impassable. */
    private fun miningDroneCostOverride(hex: HexDataDto?): Int? {
        if (hex?.obj?.type == "star") return 2
        return null
    }

    /** Cost override for scouts and colony ships: nebulae cost 1 MP instead of 2. */
    private fun lightUnitCostOverride(hex: HexDataDto?): Int? {
        if (hex?.obj?.type == "nebula") return 1
        return null
    }

    private fun getUnitCostOverride(type: UnitType): ((HexDataDto?) -> Int?)? = when (type) {
        UnitType.MINING_DRONE -> ::miningDroneCostOverride
        UnitType.SCOUT, UnitType.COLONY_SHIP -> ::lightUnitCostOverride
        else -> null
    }

    /**
     * A* pathfinding without movement-point constraint.
     * Returns the full path from [from] to [to], or null if unreachable.
     */
    private fun findUnboundedPath(
        from: HexCoord,
        to: HexCoord,
        hexLookup: (Int, Int) -> HexDataDto?,
        isBlocked: ((Int, Int) -> Boolean)? = null,
        costOverride: ((HexDataDto?) -> Int?)? = null,
    ): List<HexCoord>? {
        val dist = HexMath.hexDistance(from, to)
        val maxSearch = dist * 2 + 50

        val toKey = HexMath.hexKey(to.q, to.r)
        val startKey = HexMath.hexKey(from.q, from.r)

        val gScore = mutableMapOf(startKey to 0)
        val cameFrom = mutableMapOf<String, HexCoord>()
        val closed = mutableSetOf<String>()

        // Priority queue: (f-score, key, coord)
        val open = PriorityQueue<Triple<Int, String, HexCoord>>(compareBy { it.first })
        open.add(Triple(dist, startKey, from))
        val openSet = mutableSetOf(startKey)

        while (open.isNotEmpty()) {
            val (_, currentKey, currentCoord) = open.poll()
            openSet.remove(currentKey)

            if (currentKey == toKey) {
                return reconstructPath(currentCoord, cameFrom)
            }

            closed.add(currentKey)
            val currentG = gScore[currentKey] ?: Int.MAX_VALUE
            if (currentG > maxSearch) continue

            for (neighbor in HexMath.hexNeighbors(currentCoord.q, currentCoord.r)) {
                val nKey = HexMath.hexKey(neighbor.q, neighbor.r)
                if (nKey in closed) continue

                val hex = hexLookup(neighbor.q, neighbor.r)
                val cost = costOverride?.invoke(hex) ?: moveCost(hex)
                if (cost == Int.MAX_VALUE) continue
                if (isBlocked != null && isBlocked(neighbor.q, neighbor.r)) continue

                val tentativeG = currentG + cost
                if (tentativeG < (gScore[nKey] ?: Int.MAX_VALUE)) {
                    cameFrom[nKey] = currentCoord
                    gScore[nKey] = tentativeG
                    val f = tentativeG + HexMath.hexDistance(neighbor, to)
                    open.add(Triple(f, nKey, neighbor))
                    openSet.add(nKey)
                }
            }
        }

        return null
    }

    /**
     * Find a partial path toward [to] that fits within [movementPoints].
     * Computes the full unbounded path, then walks it hex-by-hex until MP exhausted.
     */
    private fun findPartialPath(
        from: HexCoord,
        to: HexCoord,
        movementPoints: Int,
        hexLookup: (Int, Int) -> HexDataDto?,
        isBlocked: ((Int, Int) -> Boolean)? = null,
        costOverride: ((HexDataDto?) -> Int?)? = null,
    ): List<HexCoord>? {
        val fullPath = findUnboundedPath(from, to, hexLookup, isBlocked, costOverride)
        if (fullPath == null || fullPath.size < 2) return null

        val partial = mutableListOf(fullPath[0])
        var spent = 0

        for (i in 1 until fullPath.size) {
            val hex = hexLookup(fullPath[i].q, fullPath[i].r)
            val cost = costOverride?.invoke(hex) ?: moveCost(hex)
            if (spent + cost > movementPoints) break
            spent += cost
            partial.add(fullPath[i])
        }

        return if (partial.size > 1) partial else null
    }

    /** Compute the total movement cost for a path (skipping the first hex). */
    private fun pathCost(
        path: List<HexCoord>,
        hexLookup: (Int, Int) -> HexDataDto?,
        costOverride: ((HexDataDto?) -> Int?)? = null,
    ): Int {
        var total = 0
        for (i in 1 until path.size) {
            val hex = hexLookup(path[i].q, path[i].r)
            total += costOverride?.invoke(hex) ?: moveCost(hex)
        }
        return total
    }

    private fun reconstructPath(end: HexCoord, cameFrom: Map<String, HexCoord>): List<HexCoord> {
        val path = mutableListOf<HexCoord>()
        var step: HexCoord? = end
        while (step != null) {
            path.add(step)
            val key = HexMath.hexKey(step.q, step.r)
            step = cameFrom[key]
        }
        path.reverse()
        return path
    }
}
