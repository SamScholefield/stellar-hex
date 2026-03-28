package com.stellarhex.game

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.json.JsonTest
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Tests using Spring's auto-configured ObjectMapper to verify
 * deserialization works identically to what @RequestBody uses.
 */
@JsonTest
class SpringObjectMapperTest {

    @Autowired
    lateinit var mapper: ObjectMapper

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with END_TURN`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "END_TURN"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        assertNotNull(request)
        assert(request.action is GameAction.EndTurn) {
            "Expected EndTurn but got ${request.action::class.simpleName}"
        }
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with MOVE_UNIT`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "MOVE_UNIT", "unitId": "u1", "path": [{"q":0,"r":0,"s":0}], "cost": 1}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.MoveUnit
        assertEquals("u1", action.unitId)
        assertEquals(1.0, action.cost)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with BUILD`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "BUILD", "playerId": "p1", "buildingType": "mining_station", "hex": {"q":1,"r":2,"s":-3}, "hexType": "asteroid"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.Build
        assertEquals("p1", action.playerId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with PRODUCE_UNIT`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "PRODUCE_UNIT", "buildingId": "b1", "unitType": "scout"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.ProduceUnit
        assertEquals("b1", action.buildingId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with ATTACK`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "ATTACK", "attackerId": "u1", "targetId": "u2"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.Attack
        assertEquals("u1", action.attackerId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with QUEUE_RESEARCH`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "QUEUE_RESEARCH", "buildingId": "b1", "techId": "shields_1"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.QueueResearch
        assertEquals("b1", action.buildingId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with DISCOVER_ANOMALY`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "DISCOVER_ANOMALY", "anomaly": {"id": "a1", "type": "derelict_ship", "q": 5, "r": 3}}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.DiscoverAnomaly
        assertEquals("a1", action.anomaly.id)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with COLLECT_ANOMALY`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "COLLECT_ANOMALY", "anomalyId": "a1", "unitId": "u1"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.CollectAnomaly
        assertEquals("a1", action.anomalyId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with DISCOVER_TRADE_HUB`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "DISCOVER_TRADE_HUB", "tradeHub": {"id": "th1", "q": 2, "r": 3, "stock": {"energy": 50, "minerals": 50, "alloys": 30, "credits": 20}}}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.DiscoverTradeHub
        assertEquals("th1", action.tradeHub.id)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with TRADE`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "TRADE", "hubId": "th1", "unitId": "u1", "sell": "energy", "buy": "minerals", "sellAmount": 10}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.Trade
        assertEquals("th1", action.hubId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with UNDOCK_UNIT`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "UNDOCK_UNIT", "unitId": "u1", "buildingId": "b1", "impassableHexes": ["0,1"]}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.UndockUnit
        assertEquals("u1", action.unitId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with ADVANCE_COMETS`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "ADVANCE_COMETS"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        assert(request.action is GameAction.AdvanceComets)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with SET_HOME_BASE`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "SET_HOME_BASE", "playerId": "p1", "buildingId": "b1"}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.SetHomeBase
        assertEquals("p1", action.playerId)
    }

    @Test
    fun `Spring ObjectMapper deserializes ActionRequest with UPDATE_EXPLORED`() {
        val json = """
        {
          "state": "{\"turn\":1}",
          "action": {"type": "UPDATE_EXPLORED", "playerId": "p1", "hexKeys": ["0,0", "1,0"]}
        }
        """.trimIndent()

        val request = mapper.readValue(json, ActionRequest::class.java)
        val action = request.action as GameAction.UpdateExplored
        assertEquals("p1", action.playerId)
        assertEquals(2, action.hexKeys.size)
    }
}
