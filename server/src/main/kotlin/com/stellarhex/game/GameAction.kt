package com.stellarhex.game

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.stellarhex.model.*
import com.stellarhex.world.HexCoord

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(value = GameAction.EndTurn::class, name = "END_TURN"),
    JsonSubTypes.Type(value = GameAction.MoveUnit::class, name = "MOVE_UNIT"),
    JsonSubTypes.Type(value = GameAction.Attack::class, name = "ATTACK"),
    JsonSubTypes.Type(value = GameAction.Build::class, name = "BUILD"),
    JsonSubTypes.Type(value = GameAction.ProduceUnit::class, name = "PRODUCE_UNIT"),
    JsonSubTypes.Type(value = GameAction.QueueResearch::class, name = "QUEUE_RESEARCH"),
    JsonSubTypes.Type(value = GameAction.DiscoverAnomaly::class, name = "DISCOVER_ANOMALY"),
    JsonSubTypes.Type(value = GameAction.CollectAnomaly::class, name = "COLLECT_ANOMALY"),
    JsonSubTypes.Type(value = GameAction.DiscoverTradeHub::class, name = "DISCOVER_TRADE_HUB"),
    JsonSubTypes.Type(value = GameAction.Trade::class, name = "TRADE"),
    JsonSubTypes.Type(value = GameAction.UndockUnit::class, name = "UNDOCK_UNIT"),
    JsonSubTypes.Type(value = GameAction.AdvanceComets::class, name = "ADVANCE_COMETS"),
    JsonSubTypes.Type(value = GameAction.SetHomeBase::class, name = "SET_HOME_BASE"),
    JsonSubTypes.Type(value = GameAction.UpdateExplored::class, name = "UPDATE_EXPLORED"),
)
sealed class GameAction {

    data class EndTurn(
        val miningYields: Resources? = null,
        val impassableHexes: Set<String>? = null,
    ) : GameAction()

    data class MoveUnit(
        val unitId: String,
        val path: List<HexCoord>,
        val cost: Int,
    ) : GameAction()

    data class Attack(
        val attackerId: String,
        val targetId: String,
    ) : GameAction()

    data class Build(
        val playerId: String,
        val buildingType: BuildingType,
        val hex: HexCoord,
        val hexType: String,
        val adjacentHexTypes: List<String>? = null,
        val nearbyHasPlanet: Boolean? = null,
    ) : GameAction()

    data class ProduceUnit(
        val buildingId: String,
        val unitType: UnitType,
    ) : GameAction()

    data class QueueResearch(
        val buildingId: String,
        val techId: TechId,
    ) : GameAction()

    data class DiscoverAnomaly(
        val anomaly: Anomaly,
    ) : GameAction()

    data class CollectAnomaly(
        val anomalyId: String,
        val unitId: String,
    ) : GameAction()

    data class DiscoverTradeHub(
        val tradeHub: TradeHub,
    ) : GameAction()

    data class Trade(
        val hubId: String,
        val unitId: String,
        val sell: ResourceKey,
        val buy: ResourceKey,
        val sellAmount: Int,
    ) : GameAction()

    data class UndockUnit(
        val unitId: String,
        val buildingId: String,
        val impassableHexes: Set<String>? = null,
    ) : GameAction()

    data class AdvanceComets(
        val placeholder: Unit = Unit, // data class needs at least one property
    ) : GameAction()

    data class SetHomeBase(
        val playerId: String,
        val buildingId: String,
    ) : GameAction()

    data class UpdateExplored(
        val playerId: String,
        val hexKeys: List<String>,
    ) : GameAction()
}
