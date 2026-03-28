package com.stellarhex.game

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class ActionDeserializationTest {

    private val mapper = jacksonObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    @Test
    fun `deserialize ActionRequest with END_TURN action`() {
        val json = """
        {
          "state": "{\"turn\":1,\"currentPlayerIndex\":0,\"players\":[{\"id\":\"p1\",\"name\":\"Human\",\"color\":\"#00ff00\",\"resources\":{\"energy\":100,\"minerals\":50,\"alloys\":20,\"credits\":10},\"isAI\":false,\"exploredHexes\":[\"0,0\"],\"homeBaseId\":null,\"eliminated\":false,\"researchedTechs\":[]}],\"units\":[],\"buildings\":[],\"dynamicObjects\":[],\"chunkOverrides\":[],\"anomalies\":[],\"tradeHubs\":[],\"tradedThisTurn\":[],\"seed\":1774673184785}",
          "action": {"type": "END_TURN"}
        }
        """.trimIndent()

        val request: ActionRequest = mapper.readValue(json)
        assertNotNull(request)
        assertNotNull(request.action)
        assert(request.action is GameAction.EndTurn)
    }

    @Test
    fun `deserialize ActionRequest with MOVE_UNIT action`() {
        val json = """
        {
          "state": "{\"turn\":1,\"currentPlayerIndex\":0,\"players\":[],\"units\":[],\"buildings\":[],\"dynamicObjects\":[],\"chunkOverrides\":[],\"anomalies\":[],\"tradeHubs\":[],\"tradedThisTurn\":[],\"seed\":1774673184785}",
          "action": {"type": "MOVE_UNIT", "unitId": "u1", "path": [{"q":0,"r":0,"s":0},{"q":1,"r":0,"s":-1}], "cost": 1.0}
        }
        """.trimIndent()

        val request: ActionRequest = mapper.readValue(json)
        assertNotNull(request)
        val action = request.action as GameAction.MoveUnit
        assertEquals("u1", action.unitId)
        assertEquals(2, action.path.size)
        assertEquals(1.0, action.cost)
    }

    @Test
    fun `deserialize ActionRequest with BUILD action`() {
        val json = """
        {
          "state": "{\"turn\":1,\"currentPlayerIndex\":0,\"players\":[],\"units\":[],\"buildings\":[],\"dynamicObjects\":[],\"chunkOverrides\":[],\"anomalies\":[],\"tradeHubs\":[],\"tradedThisTurn\":[],\"seed\":1774673184785}",
          "action": {"type": "BUILD", "playerId": "p1", "buildingType": "mining_station", "hex": {"q":1,"r":2,"s":-3}, "hexType": "asteroid"}
        }
        """.trimIndent()

        val request: ActionRequest = mapper.readValue(json)
        assertNotNull(request)
        val action = request.action as GameAction.Build
        assertEquals("p1", action.playerId)
    }

    @Test
    fun `deserialize ActionRequest with END_TURN and miningYields`() {
        val json = """
        {
          "state": "{\"turn\":1,\"currentPlayerIndex\":0,\"players\":[],\"units\":[],\"buildings\":[],\"dynamicObjects\":[],\"chunkOverrides\":[],\"anomalies\":[],\"tradeHubs\":[],\"tradedThisTurn\":[],\"seed\":1774673184785}",
          "action": {"type": "END_TURN", "miningYields": {"minerals": 3}, "impassableHexes": ["0,1","1,0"]}
        }
        """.trimIndent()

        val request: ActionRequest = mapper.readValue(json)
        assertNotNull(request)
        val action = request.action as GameAction.EndTurn
        assertNotNull(action.miningYields)
        assertEquals(3, action.miningYields!!.minerals)
        assertEquals(0, action.miningYields!!.energy)
    }

    @Test
    fun `deserialize SerializedGameState with full state`() {
        val stateJson = """
        {
          "turn": 5,
          "currentPlayerIndex": 0,
          "players": [{
            "id": "p1", "name": "Human", "color": "#00ff00",
            "resources": {"energy": 100, "minerals": 50, "alloys": 20, "credits": 10},
            "isAI": false, "exploredHexes": ["0,0", "1,0"],
            "homeBaseId": "b1", "eliminated": false, "researchedTechs": ["shields_1"]
          }],
          "units": [["u1", {"id":"u1","name":"SC001","ownerId":"p1","type":"scout","q":0,"r":0,"movementPoints":4,"maxMovementPoints":4,"health":8,"maxHealth":8,"attack":3,"defense":0,"range":2,"sightRange":4,"size":"small","weapon":"laser","armor":0,"shields":0,"maxShields":0,"xp":0,"veteranTier":"standard","hasAttacked":false}]],
          "buildings": [["b1", {"id":"b1","ownerId":"p1","type":"starbase","q":0,"r":0,"health":50,"maxHealth":50,"shields":15,"maxShields":15,"productionQueue":[],"researchQueue":[],"dockedUnits":[]}]],
          "dynamicObjects": [],
          "chunkOverrides": [],
          "anomalies": [],
          "tradeHubs": [],
          "tradedThisTurn": [],
          "seed": 1774673184785,
          "gameOver": null
        }
        """.trimIndent()

        val serialized: SerializedGameState = mapper.readValue(stateJson)
        assertNotNull(serialized)
        assertEquals(5, serialized.turn)
        assertEquals(1, serialized.players.size)
        assertEquals(1, serialized.units.size)
    }

    @Test
    fun `deserialize full game state with units having null weapon`() {
        // Colony ship and mining drone have weapon: null
        val stateJson = """
        {
          "turn": 10,
          "currentPlayerIndex": 0,
          "players": [{
            "id": "p1", "name": "Human", "color": "#00ff00",
            "resources": {"energy": 100, "minerals": 50, "alloys": 20, "credits": 10},
            "isAI": false,
            "exploredHexes": ["0,0", "1,0", "-1,0", "0,1", "0,-1"],
            "homeBaseId": "b1", "eliminated": false, "researchedTechs": ["shields_1", "weapons_1"]
          },{
            "id": "p2", "name": "AI Player", "color": "#ff0000",
            "resources": {"energy": 80, "minerals": 40, "alloys": 15, "credits": 5},
            "isAI": true,
            "exploredHexes": ["5,5"],
            "homeBaseId": "b2", "eliminated": false, "researchedTechs": []
          }],
          "units": [
            ["u1", {"id":"u1","name":"SC001","ownerId":"p1","type":"scout","q":1,"r":0,"movementPoints":4,"maxMovementPoints":4,"health":8,"maxHealth":8,"attack":3,"defense":0,"range":2,"sightRange":4,"size":"small","weapon":"laser","armor":0,"shields":0,"maxShields":0,"xp":0,"veteranTier":"standard","hasAttacked":false}],
            ["u2", {"id":"u2","name":"CO001","ownerId":"p1","type":"colony_ship","q":0,"r":0,"movementPoints":2,"maxMovementPoints":2,"health":12,"maxHealth":12,"attack":0,"defense":0,"range":0,"sightRange":2,"size":"medium","weapon":null,"armor":0,"shields":0,"maxShields":0,"xp":0,"veteranTier":"standard","hasAttacked":false,"dockedAt":"b1"}],
            ["u3", {"id":"u3","name":"MD001","ownerId":"p1","type":"mining_drone","q":2,"r":1,"movementPoints":2,"maxMovementPoints":2,"health":6,"maxHealth":6,"attack":0,"defense":0,"range":0,"sightRange":1,"size":"small","weapon":null,"armor":0,"shields":0,"maxShields":0,"xp":0,"veteranTier":"standard","hasAttacked":false}]
          ],
          "buildings": [
            ["b1", {"id":"b1","ownerId":"p1","type":"starbase","q":0,"r":0,"health":50,"maxHealth":50,"shields":15,"maxShields":15,"productionQueue":[{"unitType":"fighter","turnsRemaining":2}],"researchQueue":[{"techId":"armor_1","turnsRemaining":3}],"dockedUnits":["u2"]}],
            ["b2", {"id":"b2","ownerId":"p2","type":"colony","q":5,"r":5,"health":30,"maxHealth":30,"shields":10,"maxShields":10,"productionQueue":[],"researchQueue":null,"dockedUnits":null}]
          ],
          "dynamicObjects": [
            ["comet1", {"id":"comet1","type":"comet","q":3,"r":4,"velocity":{"q":1,"r":0,"s":-1}}]
          ],
          "chunkOverrides": [
            ["0,0", [{"q":3,"r":4,"change":"destroyed"}]]
          ],
          "anomalies": [
            ["a1", {"id":"a1","type":"derelict_ship","q":4,"r":2}]
          ],
          "tradeHubs": [
            ["th1", {"id":"th1","q":-2,"r":3,"stock":{"energy":45,"minerals":48,"alloys":28,"credits":18}}]
          ],
          "tradedThisTurn": ["th1"],
          "seed": 1774673184785,
          "gameOver": null
        }
        """.trimIndent()

        val serialized: SerializedGameState = mapper.readValue(stateJson)
        assertNotNull(serialized)
        assertEquals(10, serialized.turn)
        assertEquals(2, serialized.players.size)
        assertEquals(3, serialized.units.size)
        assertEquals(2, serialized.buildings.size)
        assertEquals(1, serialized.dynamicObjects.size)
    }

    @Test
    fun `full toGameState conversion with realistic data`() {
        val stateJson = """
        {
          "turn": 10,
          "currentPlayerIndex": 0,
          "players": [{
            "id": "p1", "name": "Human", "color": "#00ff00",
            "resources": {"energy": 100, "minerals": 50, "alloys": 20, "credits": 10},
            "isAI": false,
            "exploredHexes": ["0,0", "1,0"],
            "homeBaseId": "b1", "eliminated": false, "researchedTechs": ["shields_1"]
          }],
          "units": [
            ["u1", {"id":"u1","name":"SC001","ownerId":"p1","type":"scout","q":1,"r":0,"movementPoints":4,"maxMovementPoints":4,"health":8,"maxHealth":8,"attack":3,"defense":0,"range":2,"sightRange":4,"size":"small","weapon":"laser","armor":0,"shields":0,"maxShields":0,"xp":0,"veteranTier":"standard","hasAttacked":false}],
            ["u2", {"id":"u2","name":"CO001","ownerId":"p1","type":"colony_ship","q":0,"r":0,"movementPoints":2,"maxMovementPoints":2,"health":12,"maxHealth":12,"attack":0,"defense":0,"range":0,"sightRange":2,"size":"medium","weapon":null,"armor":0,"shields":0,"maxShields":0,"xp":0,"veteranTier":"standard","hasAttacked":false,"dockedAt":"b1"}]
          ],
          "buildings": [
            ["b1", {"id":"b1","ownerId":"p1","type":"starbase","q":0,"r":0,"health":50,"maxHealth":50,"shields":15,"maxShields":15,"productionQueue":[{"unitType":"fighter","turnsRemaining":2}],"researchQueue":[{"techId":"armor_1","turnsRemaining":3}],"dockedUnits":["u2"]}]
          ],
          "dynamicObjects": [],
          "chunkOverrides": [],
          "anomalies": [],
          "tradeHubs": [],
          "tradedThisTurn": [],
          "seed": 1774673184785,
          "gameOver": null
        }
        """.trimIndent()

        // This mimics the full controller path: parse JSON, then convert to domain model
        val serialized: SerializedGameState = mapper.readValue(stateJson)

        // The controller's toGameState uses mapper.convertValue for the map entries
        // Let's test that the unit with weapon=null can be converted
        val unitEntry = serialized.units[1]
        val unitMap = unitEntry[1]
        val unitData = mapper.convertValue(unitMap, com.stellarhex.model.UnitData::class.java)
        assertNotNull(unitData)
        assertEquals("colony_ship", unitData.type.id)
        assertEquals(null, unitData.weapon)

        // Test building with production/research queues
        val buildingEntry = serialized.buildings[0]
        val buildingMap = buildingEntry[1]
        val buildingData = mapper.convertValue(buildingMap, com.stellarhex.model.BuildingData::class.java)
        assertNotNull(buildingData)
        assertEquals(1, buildingData.productionQueue!!.size)
        assertEquals(1, buildingData.researchQueue!!.size)
    }

    @Test
    fun `deserialize UPDATE_EXPLORED action`() {
        val json = """
        {
          "state": "{\"turn\":1,\"currentPlayerIndex\":0,\"players\":[],\"units\":[],\"buildings\":[],\"dynamicObjects\":[],\"chunkOverrides\":[],\"anomalies\":[],\"tradeHubs\":[],\"tradedThisTurn\":[],\"seed\":1774673184785}",
          "action": {"type": "UPDATE_EXPLORED", "playerId": "p1", "hexKeys": ["0,0","1,0","0,1"]}
        }
        """.trimIndent()

        val request: ActionRequest = mapper.readValue(json)
        assertNotNull(request)
        val action = request.action as GameAction.UpdateExplored
        assertEquals("p1", action.playerId)
        assertEquals(3, action.hexKeys.size)
    }
}
