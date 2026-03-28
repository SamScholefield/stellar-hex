package com.stellarhex.game

import com.stellarhex.model.*
import com.stellarhex.world.HexCoord
import com.stellarhex.world.HexMath
import java.util.UUID
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Result of an attack action, containing both the new state and the combat result.
 */
data class AttackResult(
    val state: GameState,
    val combat: CombatResult?,
)

/**
 * Pure game reducer — no side effects, returns new state.
 * Mirrors the TypeScript gameReducer from game-reducer.ts.
 */
object GameReducer {

    fun reduce(state: GameState, action: GameAction): GameState = when (action) {
        is GameAction.EndTurn -> endTurn(state, action.miningYields, action.impassableHexes)
        is GameAction.MoveUnit -> moveUnit(state, action.unitId, action.path, action.cost)
        is GameAction.Attack -> attack(state, action.attackerId, action.targetId)
        is GameAction.Build -> build(
            state, action.playerId, action.buildingType, action.hex,
            action.hexType, action.adjacentHexTypes, action.nearbyHasPlanet,
        )
        is GameAction.ProduceUnit -> produceUnit(state, action.buildingId, action.unitType)
        is GameAction.QueueResearch -> queueResearch(state, action.buildingId, action.techId)
        is GameAction.DiscoverAnomaly -> discoverAnomaly(state, action.anomaly)
        is GameAction.CollectAnomaly -> collectAnomaly(state, action.anomalyId, action.unitId)
        is GameAction.DiscoverTradeHub -> discoverTradeHub(state, action.tradeHub)
        is GameAction.Trade -> trade(state, action.hubId, action.unitId, action.sell, action.buy, action.sellAmount)
        is GameAction.UndockUnit -> undockUnit(state, action.unitId, action.buildingId, action.impassableHexes)
        is GameAction.AdvanceComets -> advanceComets(state)
        is GameAction.SetHomeBase -> setHomeBase(state, action.playerId, action.buildingId)
        is GameAction.UpdateExplored -> updateExplored(state, action.playerId, action.hexKeys)
    }

    // ── Build ───────────────────────────────────────────────────────

    private fun build(
        state: GameState,
        playerId: String,
        buildingType: BuildingType,
        hex: HexCoord,
        hexType: String,
        adjacentHexTypes: List<String>?,
        nearbyHasPlanet: Boolean?,
    ): GameState {
        val stats = BUILDING_STATS[buildingType] ?: return state

        // Validate hex type
        val stellarType = try { StellarObjectType.fromId(hexType) } catch (_: Exception) { return state }
        if (stellarType !in stats.allowedHexTypes) return state

        // Solar collector requires an adjacent star
        if (buildingType == BuildingType.SOLAR_COLLECTOR) {
            if (adjacentHexTypes == null || "star" !in adjacentHexTypes) return state
        }

        // Validate no duplicate building at this hex
        if (state.buildings.values.any { it.q == hex.q && it.r == hex.r }) return state

        // Validate friendly unit at hex
        val hasUnit = state.units.values.any { it.ownerId == playerId && it.q == hex.q && it.r == hex.r }
        if (!hasUnit) return state

        // Validate player and resources
        val playerIndex = state.players.indexOfFirst { it.id == playerId }
        if (playerIndex == -1) return state
        val player = state.players[playerIndex]
        if (!canAfford(player.resources, stats.cost)) return state

        // Starbase requires a scout at the hex and a planet within range
        if (buildingType == BuildingType.STARBASE) {
            val hasScout = state.units.values.any {
                it.ownerId == playerId && it.type == UnitType.SCOUT && it.q == hex.q && it.r == hex.r
            }
            if (!hasScout) return state
            if (nearbyHasPlanet == false) return state
        }

        // Colony special case: consume colony_ship at hex
        var units = state.units
        if (buildingType == BuildingType.COLONY) {
            val colonyShipEntry = state.units.entries.find {
                it.value.ownerId == playerId && it.value.type == UnitType.COLONY_SHIP &&
                    it.value.q == hex.q && it.value.r == hex.r
            } ?: return state
            units = units.toMutableMap().apply { remove(colonyShipEntry.key) }
        }

        // Add building
        val buildings = state.buildings.toMutableMap()
        val id = "b_${hex.q}_${hex.r}_${UUID.randomUUID().toString().take(8)}"
        val building = BuildingData(
            id = id,
            ownerId = playerId,
            type = buildingType,
            q = hex.q,
            r = hex.r,
            health = stats.maxHealth,
            maxHealth = stats.maxHealth,
            shields = stats.maxShields,
            maxShields = stats.maxShields,
        )
        buildings[id] = building

        // Deduct resources + auto-set home base
        val autoHome = buildingType == BuildingType.STARBASE && player.homeBaseId == null
        val players = state.players.mapIndexed { i, p ->
            if (i != playerIndex) p
            else {
                val updated = p.copy(resources = subtractResources(p.resources, stats.cost))
                if (autoHome) updated.copy(homeBaseId = id) else updated
            }
        }

        return state.copy(players = players, buildings = buildings, units = units)
    }

    // ── SetHomeBase ─────────────────────────────────────────────────

    private fun setHomeBase(state: GameState, playerId: String, buildingId: String): GameState {
        val building = state.buildings[buildingId] ?: return state
        if (building.type != BuildingType.STARBASE || building.ownerId != playerId) return state

        val playerIndex = state.players.indexOfFirst { it.id == playerId }
        if (playerIndex == -1) return state

        val players = state.players.mapIndexed { i, p ->
            if (i == playerIndex) p.copy(homeBaseId = buildingId) else p
        }
        return state.copy(players = players)
    }

    // ── UpdateExplored ──────────────────────────────────────────────

    private fun updateExplored(state: GameState, playerId: String, hexKeys: List<String>): GameState {
        val playerIndex = state.players.indexOfFirst { it.id == playerId }
        if (playerIndex == -1) return state

        val player = state.players[playerIndex]
        val explored = player.exploredHexes.toMutableSet()
        explored.addAll(hexKeys)

        val players = state.players.mapIndexed { i, p ->
            if (i == playerIndex) p.copy(exploredHexes = explored) else p
        }
        return state.copy(players = players)
    }

    // ── ProduceUnit ─────────────────────────────────────────────────

    private fun produceUnit(state: GameState, buildingId: String, unitType: UnitType): GameState {
        val building = state.buildings[buildingId] ?: return state
        if (building.type != BuildingType.STARBASE) return state

        val unitStats = UNIT_STATS[unitType] ?: return state

        val playerIndex = state.players.indexOfFirst { it.id == building.ownerId }
        if (playerIndex == -1) return state
        val player = state.players[playerIndex]
        if (!canAfford(player.resources, unitStats.cost)) return state

        // Deduct resources
        val players = state.players.mapIndexed { i, p ->
            if (i == playerIndex) p.copy(resources = subtractResources(p.resources, unitStats.cost)) else p
        }

        // Add to production queue
        val buildings = state.buildings.toMutableMap()
        val queue = (building.productionQueue ?: emptyList()) +
            ProductionItem(unitType = unitType, turnsRemaining = unitStats.buildTurns)
        buildings[buildingId] = building.copy(productionQueue = queue)

        return state.copy(players = players, buildings = buildings)
    }

    // ── QueueResearch ───────────────────────────────────────────────

    private fun queueResearch(state: GameState, buildingId: String, techId: TechId): GameState {
        val building = state.buildings[buildingId] ?: return state
        if (building.type != BuildingType.RESEARCH_LAB) return state

        val techDef = TECH_TREE[techId] ?: return state

        val playerIndex = state.players.indexOfFirst { it.id == building.ownerId }
        if (playerIndex == -1) return state
        val player = state.players[playerIndex]

        // Check prerequisites
        if (!canResearch(techId, player.researchedTechs)) return state

        // Check not already queued in any research lab
        for (b in state.buildings.values) {
            if (b.ownerId != player.id || b.type != BuildingType.RESEARCH_LAB) continue
            if (b.researchQueue?.any { it.techId == techId } == true) return state
        }

        // Check resources
        if (!canAfford(player.resources, techDef.cost)) return state

        // Deduct resources
        val players = state.players.mapIndexed { i, p ->
            if (i == playerIndex) p.copy(resources = subtractResources(p.resources, techDef.cost)) else p
        }

        // Add to research queue
        val buildings = state.buildings.toMutableMap()
        val queue = (building.researchQueue ?: emptyList()) +
            ResearchItem(techId = techId, turnsRemaining = techDef.researchTurns)
        buildings[buildingId] = building.copy(researchQueue = queue)

        return state.copy(players = players, buildings = buildings)
    }

    // ── Attack ──────────────────────────────────────────────────────

    private fun attack(state: GameState, attackerId: String, targetId: String): GameState =
        attackWithResult(state, attackerId, targetId).state

    fun attackWithResult(state: GameState, attackerId: String, targetId: String): AttackResult {
        val attacker = state.units[attackerId] ?: return AttackResult(state, null)

        // Must not have already attacked this turn
        if (attacker.hasAttacked) return AttackResult(state, null)

        // Try unit target first, then building target
        val defender = state.units[targetId]
        val targetBuilding = if (defender == null) state.buildings[targetId] else null

        if (defender == null && targetBuilding == null) return AttackResult(state, null)

        // Cannot attack own entities
        val targetOwnerId = defender?.ownerId ?: targetBuilding!!.ownerId
        if (attacker.ownerId == targetOwnerId) return AttackResult(state, null)

        val targetQ = defender?.q ?: targetBuilding!!.q
        val targetR = defender?.r ?: targetBuilding!!.r

        // Check range
        val dist = HexMath.hexDistance(
            HexMath.toHexCoord(attacker.q, attacker.r),
            HexMath.toHexCoord(targetQ, targetR),
        )
        if (dist > attacker.range) return AttackResult(state, null)

        // Compute influence for combat modifiers (include tech sight bonus)
        val attackerPlayer = state.players.find { it.id == attacker.ownerId }
        val defenderPlayer = state.players.find { it.id == targetOwnerId }
        val attackerSightBonus = if (attackerPlayer != null) computeTechBonuses(attackerPlayer.researchedTechs).sightRange else 0
        val defenderSightBonus = if (defenderPlayer != null) computeTechBonuses(defenderPlayer.researchedTechs).sightRange else 0
        val attackerInfluence = InfluenceService.computeInfluenceForPlayer(state.buildings, attacker.ownerId, attackerSightBonus)
        val defenderInfluence = InfluenceService.computeInfluenceForPlayer(state.buildings, targetOwnerId, defenderSightBonus)

        // --- Building target path ---
        if (targetBuilding != null) {
            var defenderIncomingMul = 1.0
            if (HexMath.hexKey(targetQ, targetR) in defenderInfluence) defenderIncomingMul *= 0.9
            if (HexMath.hexKey(targetQ, targetR) in attackerInfluence) defenderIncomingMul *= 1.1

            val bCombat = CombatResolver.resolveBuildingCombat(attacker, targetBuilding, (state.seed + state.turn).toInt(), defenderIncomingMul)

            val units = state.units.toMutableMap()
            val newXp = attacker.xp + bCombat.attackerXpGain
            units[attackerId] = attacker.copy(
                hasAttacked = true,
                xp = newXp,
                veteranTier = CombatResolver.maybePromote(attacker.veteranTier, newXp),
            )

            val buildings = state.buildings.toMutableMap()
            if (bCombat.destroyed) {
                // Destroy all docked units
                if (targetBuilding.dockedUnits != null) {
                    for (dockedId in targetBuilding.dockedUnits) {
                        units.remove(dockedId)
                    }
                }
                buildings.remove(targetId)
            } else {
                buildings[targetId] = targetBuilding.copy(
                    health = targetBuilding.health - bCombat.hullDamage,
                    shields = max(0, targetBuilding.shields - bCombat.shieldDamage),
                )
            }

            // Map BuildingCombatResult to CombatResult shape
            val combat = CombatResult(
                attackerDamage = 0,
                defenderDamage = bCombat.damage,
                attackerShieldDamage = 0,
                defenderShieldDamage = bCombat.shieldDamage,
                attackerDestroyed = false,
                defenderDestroyed = bCombat.destroyed,
                attackerXpGain = bCombat.attackerXpGain,
                defenderXpGain = 0,
                attackerStrike = bCombat.strike,
                defenderStrike = null,
            )

            // Check elimination and victory immediately
            var players = state.players.map { p ->
                if (p.eliminated) p
                else if (shouldEliminate(p, units, buildings)) p.copy(eliminated = true)
                else p
            }
            val gameOver = checkVictory(players, units, buildings) ?: state.gameOver

            return AttackResult(
                state.copy(units = units, buildings = buildings, players = players, gameOver = gameOver),
                combat,
            )
        }

        // --- Unit target path ---
        val combatOptions = CombatOptions(
            attackerInOwnInfluence = HexMath.hexKey(attacker.q, attacker.r) in attackerInfluence,
            defenderInOwnInfluence = HexMath.hexKey(defender!!.q, defender.r) in defenderInfluence,
            attackerInEnemyInfluence = HexMath.hexKey(attacker.q, attacker.r) in defenderInfluence,
            defenderInEnemyInfluence = HexMath.hexKey(defender.q, defender.r) in attackerInfluence,
        )

        val combat = CombatResolver.resolveCombat(attacker, defender, dist, (state.seed + state.turn).toInt(), combatOptions)

        val units = state.units.toMutableMap()

        if (combat.attackerDestroyed) {
            units.remove(attackerId)
        } else {
            val newXp = attacker.xp + combat.attackerXpGain
            units[attackerId] = attacker.copy(
                health = attacker.health - (combat.defenderStrike?.hullDamage ?: 0),
                shields = max(0, attacker.shields - (combat.defenderStrike?.shieldDamage ?: 0)),
                hasAttacked = true,
                xp = newXp,
                veteranTier = CombatResolver.maybePromote(attacker.veteranTier, newXp),
            )
        }

        if (combat.defenderDestroyed) {
            units.remove(targetId)
        } else {
            val newXp = defender.xp + combat.defenderXpGain
            units[targetId] = defender.copy(
                health = defender.health - combat.attackerStrike.hullDamage,
                shields = max(0, defender.shields - combat.attackerStrike.shieldDamage),
                xp = newXp,
                veteranTier = CombatResolver.maybePromote(defender.veteranTier, newXp),
            )
        }

        // Check elimination and victory immediately
        val buildings = state.buildings
        val players = state.players.map { p ->
            if (p.eliminated) p
            else if (shouldEliminate(p, units, buildings)) p.copy(eliminated = true)
            else p
        }
        val gameOver = checkVictory(players, units, buildings) ?: state.gameOver

        return AttackResult(
            state.copy(units = units, players = players, gameOver = gameOver),
            combat,
        )
    }

    // ── EndTurn ─────────────────────────────────────────────────────

    private fun endTurn(
        state: GameState,
        miningYields: Resources?,
        impassableHexes: Set<String>?,
    ): GameState {
        // If game is already over, don't process further turns
        if (state.gameOver != null) return state

        val currentPlayerIndex = state.currentPlayerIndex
        val currentPlayer = state.players[currentPlayerIndex]
        val nextPlayerIndex = (currentPlayerIndex + 1) % state.players.size
        val nextTurn = if (nextPlayerIndex == 0) state.turn + 1 else state.turn

        // Working copies
        var players = state.players
        val units = state.units.toMutableMap()
        var buildings = state.buildings
        var buildingsChanged = false

        if (!currentPlayer.eliminated) {
            val income = addResources(
                EconomyService.computeIncome(state.buildings, currentPlayer.id),
                miningYields ?: ZERO_RESOURCES,
            )

            // Compute upkeep
            val upkeep = EconomyService.computeUpkeep(state.units, currentPlayer.id)

            // Apply income then subtract upkeep
            var newEnergy = currentPlayer.resources.energy + income.energy - upkeep.energy
            var newMinerals = currentPlayer.resources.minerals + income.minerals - upkeep.minerals
            var newAlloys = currentPlayer.resources.alloys + income.alloys - upkeep.alloys
            var newCredits = currentPlayer.resources.credits + income.credits - upkeep.credits

            // Attrition: if any resource is negative, damage all player's units by 2
            val isBankrupt = newEnergy < 0 || newMinerals < 0 || newAlloys < 0 || newCredits < 0

            if (isBankrupt) {
                val toRemove = mutableListOf<String>()
                for ((id, unit) in units) {
                    if (unit.ownerId != currentPlayer.id) continue
                    val newHealth = unit.health - 2
                    if (newHealth <= 0) {
                        toRemove.add(id)
                    } else {
                        units[id] = unit.copy(health = newHealth)
                    }
                }
                toRemove.forEach { units.remove(it) }
            }

            // Clamp resources to 0
            newEnergy = max(0, newEnergy)
            newMinerals = max(0, newMinerals)
            newAlloys = max(0, newAlloys)
            newCredits = max(0, newCredits)
            val newResources = Resources(newEnergy, newMinerals, newAlloys, newCredits)

            players = state.players.mapIndexed { i, p ->
                if (i == currentPlayerIndex) p.copy(resources = newResources) else p
            }

            // Influence regen: +2 HP, +1 shield for units in own influence, not near enemies
            val regenSightBonus = computeTechBonuses(currentPlayer.researchedTechs).sightRange
            val influence = InfluenceService.computeInfluenceForPlayer(state.buildings, currentPlayer.id, regenSightBonus)
            for ((id, unit) in units.toMap()) {
                if (unit.ownerId != currentPlayer.id) continue
                val key = HexMath.hexKey(unit.q, unit.r)
                if (key !in influence) continue
                if (InfluenceService.isNearAnyEnemyUnit(unit.q, unit.r, units, currentPlayer.id)) continue
                val regenHealth = min(unit.health + 2, unit.maxHealth)
                val regenShields = min(unit.shields + 1, unit.maxShields)
                if (regenHealth != unit.health || regenShields != unit.shields) {
                    units[id] = unit.copy(health = regenHealth, shields = regenShields)
                }
            }

            // Building regen: +2 HP, +1 shield for buildings in own influence, not near enemies
            val buildingSource = if (buildingsChanged) buildings else state.buildings
            for ((bId, building) in buildingSource) {
                if (building.ownerId != currentPlayer.id) continue
                val bKey = HexMath.hexKey(building.q, building.r)
                if (bKey !in influence) continue
                if (InfluenceService.isNearAnyEnemyUnit(building.q, building.r, units, currentPlayer.id)) continue
                val bHealth = min(building.health + 2, building.maxHealth)
                val bShields = min(building.shields + 1, building.maxShields)
                if (bHealth != building.health || bShields != building.shields) {
                    if (!buildingsChanged) {
                        buildings = state.buildings.toMutableMap()
                        buildingsChanged = true
                    }
                    (buildings as MutableMap<String, BuildingData>)[bId] =
                        building.copy(health = bHealth, shields = bShields)
                }
            }
        }

        // Process production queues for current player's starbases
        for ((bId, building) in state.buildings) {
            if (building.ownerId != currentPlayer.id) continue
            if (building.productionQueue.isNullOrEmpty()) continue

            if (!buildingsChanged) {
                buildings = state.buildings.toMutableMap()
                buildingsChanged = true
            }

            val newQueue = mutableListOf<ProductionItem>()
            for (item in building.productionQueue) {
                val remaining = item.turnsRemaining - 1
                if (remaining <= 0) {
                    // Spawn unit at adjacent hex
                    val unitStats = UNIT_STATS[item.unitType] ?: continue
                    val techBonus = computeTechBonuses(currentPlayer.researchedTechs)

                    // Find first empty adjacent hex
                    val neighbors = HexMath.hexNeighbors(building.q, building.r)
                    val occupiedKeys = mutableSetOf<String>()
                    for (u in units.values) {
                        if (u.dockedAt == null) occupiedKeys.add(HexMath.hexKey(u.q, u.r))
                    }
                    for (b in (buildings as Map<String, BuildingData>).values) {
                        occupiedKeys.add(HexMath.hexKey(b.q, b.r))
                    }
                    val spawnHex = neighbors.firstOrNull { n ->
                        val nKey = HexMath.hexKey(n.q, n.r)
                        nKey !in occupiedKeys && (impassableHexes == null || nKey !in impassableHexes)
                    } ?: HexCoord(building.q, building.r)

                    val unitId = "u_${building.q}_${building.r}_${UUID.randomUUID().toString().take(8)}"
                    val unitName = generateUnitName(item.unitType, units)
                    units[unitId] = UnitData(
                        id = unitId,
                        name = unitName,
                        ownerId = building.ownerId,
                        type = item.unitType,
                        q = spawnHex.q,
                        r = spawnHex.r,
                        movementPoints = unitStats.maxMovementPoints + techBonus.maxMovementPoints,
                        maxMovementPoints = unitStats.maxMovementPoints + techBonus.maxMovementPoints,
                        health = unitStats.maxHealth,
                        maxHealth = unitStats.maxHealth,
                        attack = unitStats.attack + techBonus.attack,
                        defense = unitStats.defense,
                        range = unitStats.range,
                        sightRange = unitStats.sightRange + techBonus.sightRange,
                        size = unitStats.size,
                        weapon = unitStats.weapon,
                        armor = unitStats.armor + techBonus.armor,
                        shields = unitStats.maxShields + techBonus.shields,
                        maxShields = unitStats.maxShields + techBonus.shields,
                        xp = 0,
                        veteranTier = VeteranTier.STANDARD,
                        hasAttacked = false,
                    )
                } else {
                    newQueue.add(item.copy(turnsRemaining = remaining))
                }
            }
            (buildings as MutableMap<String, BuildingData>)[bId] =
                building.copy(productionQueue = newQueue.ifEmpty { null })
        }

        // Process research queues for current player's research labs
        var researchCompleted = false
        val researchBuildingSource = if (buildingsChanged) buildings else state.buildings
        for ((bId, building) in researchBuildingSource) {
            if (building.ownerId != currentPlayer.id) continue
            if (building.researchQueue.isNullOrEmpty()) continue

            if (!buildingsChanged) {
                buildings = state.buildings.toMutableMap()
                buildingsChanged = true
            }

            val newQueue = mutableListOf<ResearchItem>()
            for (item in building.researchQueue) {
                val remaining = item.turnsRemaining - 1
                if (remaining <= 0) {
                    researchCompleted = true
                } else {
                    newQueue.add(item.copy(turnsRemaining = remaining))
                }
            }
            (buildings as MutableMap<String, BuildingData>)[bId] =
                building.copy(researchQueue = newQueue.ifEmpty { null })
        }

        // If any research completed, update player's researchedTechs and apply bonuses to all units
        if (researchCompleted) {
            val newResearched = currentPlayer.researchedTechs.toMutableSet()
            // Find completed techs from original queues
            for (b in state.buildings.values) {
                if (b.ownerId != currentPlayer.id || b.type != BuildingType.RESEARCH_LAB) continue
                if (b.researchQueue == null) continue
                for (item in b.researchQueue) {
                    if (item.turnsRemaining == 1) {
                        newResearched.add(item.techId)
                    }
                }
            }

            val playerIdx = players.indexOfFirst { it.id == currentPlayer.id }
            players = players.mapIndexed { i, p ->
                if (i == playerIdx) p.copy(researchedTechs = newResearched.toSet()) else p
            }

            // Apply new tech bonuses to all owned units
            val bonus = computeTechBonuses(newResearched)
            for ((id, unit) in units.toMap()) {
                if (unit.ownerId != currentPlayer.id) continue
                val updated = applyTechBonusToUnit(unit, bonus)
                if (updated != unit) units[id] = updated
            }
        }

        // Refresh movement points and regen shields for the next player's units
        val nextPlayerId = state.players[nextPlayerIndex].id
        for ((id, unit) in units.toMap()) {
            if (unit.ownerId == nextPlayerId) {
                units[id] = unit.copy(
                    movementPoints = unit.maxMovementPoints,
                    shields = min(unit.shields + 1, unit.maxShields),
                    hasAttacked = false,
                )
            }
        }

        // Elimination check
        players = players.map { p ->
            if (p.eliminated) p
            else if (shouldEliminate(p, units, buildings)) p.copy(eliminated = true)
            else p
        }

        // Victory check
        val gameOver = checkVictory(players, units, buildings)

        var result = state.copy(
            turn = nextTurn,
            currentPlayerIndex = nextPlayerIndex,
            players = players,
            units = units,
            buildings = buildings,
            tradedThisTurn = emptySet(),
            gameOver = gameOver ?: state.gameOver,
        )

        if (nextPlayerIndex == 0) {
            result = advanceComets(result)

            // Replenish trade hub stock each round
            if (result.tradeHubs.isNotEmpty()) {
                val tradeHubs = result.tradeHubs.toMutableMap()
                for ((id, hub) in tradeHubs.toMap()) {
                    val stock = Resources(
                        energy = min(hub.stock.energy + TRADE_HUB_REPLENISH.energy, TRADE_HUB_MAX_STOCK.energy),
                        minerals = min(hub.stock.minerals + TRADE_HUB_REPLENISH.minerals, TRADE_HUB_MAX_STOCK.minerals),
                        alloys = min(hub.stock.alloys + TRADE_HUB_REPLENISH.alloys, TRADE_HUB_MAX_STOCK.alloys),
                        credits = min(hub.stock.credits + TRADE_HUB_REPLENISH.credits, TRADE_HUB_MAX_STOCK.credits),
                    )
                    tradeHubs[id] = hub.copy(stock = stock)
                }
                result = result.copy(tradeHubs = tradeHubs)
            }
        }

        return result
    }

    // ── MoveUnit ────────────────────────────────────────────────────

    private fun moveUnit(state: GameState, unitId: String, path: List<HexCoord>, cost: Double): GameState {
        val unit = state.units[unitId] ?: return state
        if (path.isEmpty()) return state

        val dest = path.last()
        val remaining = unit.movementPoints - cost.toInt()
        if (remaining < 0) return state

        // Cannot move to a hex occupied by an enemy unit or building
        val destKey = HexMath.hexKey(dest.q, dest.r)
        for (u in state.units.values) {
            if (u.id != unitId && u.ownerId != unit.ownerId && HexMath.hexKey(u.q, u.r) == destKey) return state
        }
        for (b in state.buildings.values) {
            if (b.ownerId != unit.ownerId && HexMath.hexKey(b.q, b.r) == destKey) return state
        }

        // Check for friendly starbase at destination — auto-dock
        var dockBuilding: BuildingData? = null
        for (b in state.buildings.values) {
            if (b.type == BuildingType.STARBASE && b.ownerId == unit.ownerId && b.q == dest.q && b.r == dest.r) {
                dockBuilding = b
                break
            }
        }

        val units = state.units.toMutableMap()
        if (dockBuilding != null) {
            // Dock: heal to full, mark as docked
            units[unitId] = unit.copy(
                q = dest.q,
                r = dest.r,
                movementPoints = 0,
                health = unit.maxHealth,
                shields = unit.maxShields,
                dockedAt = dockBuilding.id,
            )
            // Add to building's docked list
            val buildings = state.buildings.toMutableMap()
            val docked = (dockBuilding.dockedUnits ?: emptyList()) + unitId
            buildings[dockBuilding.id] = dockBuilding.copy(dockedUnits = docked)
            return state.copy(units = units, buildings = buildings)
        }

        units[unitId] = unit.copy(
            q = dest.q,
            r = dest.r,
            movementPoints = remaining,
        )

        return state.copy(units = units)
    }

    // ── DiscoverAnomaly ─────────────────────────────────────────────

    private fun discoverAnomaly(state: GameState, anomaly: Anomaly): GameState {
        if (state.anomalies.containsKey(anomaly.id)) return state
        val anomalies = state.anomalies.toMutableMap()
        anomalies[anomaly.id] = anomaly
        return state.copy(anomalies = anomalies)
    }

    // ── CollectAnomaly ──────────────────────────────────────────────

    private fun collectAnomaly(state: GameState, anomalyId: String, unitId: String): GameState {
        val anomaly = state.anomalies[anomalyId] ?: return state

        val unit = state.units[unitId] ?: return state
        if (unit.type != UnitType.SCOUT) return state
        if (unit.q != anomaly.q || unit.r != anomaly.r) return state

        val info = ANOMALY_REWARDS[anomaly.type] ?: return state

        val playerIndex = state.players.indexOfFirst { it.id == unit.ownerId }
        if (playerIndex == -1) return state

        val players = state.players.mapIndexed { i, p ->
            if (i != playerIndex) p
            else p.copy(resources = addResources(p.resources, info.reward))
        }

        val anomalies = state.anomalies.toMutableMap()
        anomalies.remove(anomalyId)

        // Check victory immediately (anomaly credits could trigger economic victory)
        val gameOver = checkVictory(players, state.units, state.buildings) ?: state.gameOver

        return state.copy(players = players, anomalies = anomalies, gameOver = gameOver)
    }

    // ── DiscoverTradeHub ────────────────────────────────────────────

    private fun discoverTradeHub(state: GameState, tradeHub: TradeHub): GameState {
        if (state.tradeHubs.containsKey(tradeHub.id)) return state
        val tradeHubs = state.tradeHubs.toMutableMap()
        tradeHubs[tradeHub.id] = tradeHub
        return state.copy(tradeHubs = tradeHubs)
    }

    // ── Trade ───────────────────────────────────────────────────────

    private fun trade(
        state: GameState,
        hubId: String,
        unitId: String,
        sell: ResourceKey,
        buy: ResourceKey,
        sellAmount: Int,
    ): GameState {
        if (sell == buy) return state
        val hub = state.tradeHubs[hubId] ?: return state

        val unit = state.units[unitId] ?: return state
        if (unit.type != UnitType.SCOUT) return state
        if (unit.q != hub.q || unit.r != hub.r) return state

        val playerIndex = state.players.indexOfFirst { it.id == unit.ownerId }
        if (playerIndex == -1) return state
        val player = state.players[playerIndex]

        // Check once-per-turn limit
        val tradedKey = "${player.id}:$hubId"
        if (tradedKey in state.tradedThisTurn) return state

        // Check rate and affordability
        val rate = TRADE_RATES[sell]?.get(buy) ?: return state
        if (rate <= 0) return state
        if (sellAmount <= 0) return state
        if (getResource(player.resources, sell) < sellAmount) return state

        val buyAmount = floor(sellAmount.toDouble() / rate).toInt()
        if (buyAmount < 1) return state

        // Check hub has enough stock of the buy resource
        if (getResource(hub.stock, buy) < buyAmount) return state

        // Execute trade
        val newResources = adjustResource(adjustResource(player.resources, sell, -sellAmount), buy, buyAmount)
        val newStock = adjustResource(adjustResource(hub.stock, buy, -buyAmount), sell, sellAmount)

        val tradeHubs = state.tradeHubs.toMutableMap()
        tradeHubs[hubId] = hub.copy(stock = newStock)

        val players = state.players.mapIndexed { i, p ->
            if (i == playerIndex) p.copy(resources = newResources) else p
        }

        val tradedThisTurn = state.tradedThisTurn + tradedKey

        val gameOver = checkVictory(players, state.units, state.buildings) ?: state.gameOver

        return state.copy(players = players, tradeHubs = tradeHubs, tradedThisTurn = tradedThisTurn, gameOver = gameOver)
    }

    // ── UndockUnit ──────────────────────────────────────────────────

    private fun undockUnit(state: GameState, unitId: String, buildingId: String, impassableHexes: Set<String>?): GameState {
        val unit = state.units[unitId] ?: return state
        if (unit.dockedAt != buildingId) return state

        // Cannot undock in same turn as docking (MP is 0 after dock, refreshed next turn)
        if (unit.movementPoints <= 0) return state

        val building = state.buildings[buildingId] ?: return state

        // Find adjacent empty hex to undock to
        val neighbors = HexMath.hexNeighbors(building.q, building.r)
        val occupiedKeys = mutableSetOf<String>()
        for (u in state.units.values) {
            if (u.dockedAt == null) occupiedKeys.add(HexMath.hexKey(u.q, u.r))
        }
        for (b in state.buildings.values) {
            occupiedKeys.add(HexMath.hexKey(b.q, b.r))
        }
        val undockHex = neighbors.firstOrNull { n ->
            val nKey = HexMath.hexKey(n.q, n.r)
            nKey !in occupiedKeys && (impassableHexes == null || nKey !in impassableHexes)
        } ?: return state // No space to undock

        val units = state.units.toMutableMap()
        units[unitId] = unit.copy(
            q = undockHex.q,
            r = undockHex.r,
            movementPoints = unit.movementPoints,
            dockedAt = null,
        )

        // Remove from building's docked list
        val buildings = state.buildings.toMutableMap()
        val docked = (building.dockedUnits ?: emptyList()).filter { it != unitId }
        buildings[buildingId] = building.copy(dockedUnits = docked.ifEmpty { null })

        return state.copy(units = units, buildings = buildings)
    }

    // ── AdvanceComets ───────────────────────────────────────────────

    private fun advanceComets(state: GameState): GameState {
        if (state.dynamicObjects.isEmpty()) return state

        val dynamicObjects = state.dynamicObjects.mapValues { (_, obj) ->
            obj.copy(
                q = obj.q + obj.velocity.q,
                r = obj.r + obj.velocity.r,
            )
        }

        return state.copy(dynamicObjects = dynamicObjects)
    }

    // ── Helper Functions ────────────────────────────────────────────

    fun shouldEliminate(player: PlayerState, units: Map<String, UnitData>, buildings: Map<String, BuildingData>): Boolean {
        if (player.eliminated) return false
        if (units.values.any { it.ownerId == player.id }) return false
        if (buildings.values.any { it.ownerId == player.id }) return false
        return true
    }

    fun checkVictory(
        players: List<PlayerState>,
        units: Map<String, UnitData>,
        buildings: Map<String, BuildingData>,
    ): GameOverState? {
        // Economic victory
        for (p in players) {
            if (!p.eliminated && p.resources.credits >= ECONOMIC_VICTORY_CREDITS) {
                return GameOverState(winnerId = p.id, reason = VictoryReason.ECONOMIC)
            }
        }

        // Domination victory
        val alive = players.filter { !it.eliminated }
        if (alive.size == 1) {
            return GameOverState(winnerId = alive[0].id, reason = VictoryReason.DOMINATION)
        }

        return null
    }

    /** Apply cumulative tech bonuses to a unit's stats (based on base stats + bonus). */
    private fun applyTechBonusToUnit(unit: UnitData, bonus: TechBonus): UnitData {
        val base = UNIT_STATS[unit.type] ?: return unit
        val newAttack = base.attack + bonus.attack
        val newArmor = base.armor + bonus.armor
        val newMaxShields = base.maxShields + bonus.shields
        val newSightRange = base.sightRange + bonus.sightRange
        val newMaxMP = base.maxMovementPoints + bonus.maxMovementPoints

        if (unit.attack == newAttack && unit.armor == newArmor &&
            unit.maxShields == newMaxShields && unit.sightRange == newSightRange &&
            unit.maxMovementPoints == newMaxMP
        ) {
            return unit
        }

        return unit.copy(
            attack = newAttack,
            armor = newArmor,
            maxShields = newMaxShields,
            shields = min(unit.shields, newMaxShields),
            sightRange = newSightRange,
            maxMovementPoints = newMaxMP,
        )
    }

    /** Get a resource value by key. */
    private fun getResource(r: Resources, key: ResourceKey): Int = when (key) {
        ResourceKey.ENERGY -> r.energy
        ResourceKey.MINERALS -> r.minerals
        ResourceKey.ALLOYS -> r.alloys
        ResourceKey.CREDITS -> r.credits
    }

    /** Adjust a resource value by key. */
    private fun adjustResource(r: Resources, key: ResourceKey, delta: Int): Resources = when (key) {
        ResourceKey.ENERGY -> r.copy(energy = r.energy + delta)
        ResourceKey.MINERALS -> r.copy(minerals = r.minerals + delta)
        ResourceKey.ALLOYS -> r.copy(alloys = r.alloys + delta)
        ResourceKey.CREDITS -> r.copy(credits = r.credits + delta)
    }
}
