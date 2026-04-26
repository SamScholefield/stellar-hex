package com.stellarhex.game

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.stellarhex.ai.AiService
import com.stellarhex.model.*
import com.stellarhex.world.HexCoord
import com.stellarhex.world.WorldGeneratorService
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

// ── Request / Response DTOs ──────────────────────────────────────────

data class ActionRequest(
    val state: String,   // serialized game state JSON (inner state only)
    val action: GameAction,
)

data class ActionResponse(
    val state: String,   // updated serialized game state JSON
)

data class AiTurnRequest(
    val state: String,   // serialized game state JSON
    val playerId: String,
)

data class AiTurnResponse(
    val state: String,   // updated serialized game state JSON after AI turn
)

// ── Serialized DTOs matching the client JSON format ──────────────────
// The client serializes Maps as [key, value][] tuples and Sets as string[].

@JsonIgnoreProperties(ignoreUnknown = true)
data class SerializedGameState(
    val turn: Int,
    val currentPlayerIndex: Int,
    val players: List<SerializedPlayer>,
    val units: List<List<Any>>,           // [[id, UnitData], ...]
    val buildings: List<List<Any>>,       // [[id, BuildingData], ...]
    val dynamicObjects: List<List<Any>>,  // [[id, DynamicObject], ...]
    val chunkOverrides: List<List<Any>>,  // [[key, HexOverride[]], ...]
    val anomalies: List<List<Any>>,       // [[id, Anomaly], ...]
    val tradeHubs: List<List<Any>>? = null,
    val tradedThisTurn: List<String>? = null,
    val seed: Long,
    val gameOver: SerializedGameOver? = null,
    val spectate: Boolean? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SerializedPlayer(
    val id: String,
    val name: String,
    val color: String,
    val resources: Resources,
    val isAI: Boolean,
    val exploredHexes: List<String>,
    val homeBaseId: String? = null,
    val eliminated: Boolean? = null,
    val researchedTechs: List<String>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class SerializedGameOver(
    val winnerId: String,
    val reason: String,
)

// ── Controller ───────────────────────────────────────────────────────

@RestController
@RequestMapping("/game")
class GameController(
    private val worldGenerator: WorldGeneratorService,
) {

    private val log = org.slf4j.LoggerFactory.getLogger(GameController::class.java)

    private val mapper: ObjectMapper = jacksonObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    private val aiExecutor = Executors.newCachedThreadPool()
    private val AI_TIMEOUT_SECONDS = 10L

    @PostMapping("/action")
    fun dispatchAction(
        @AuthenticationPrincipal oidcUser: OidcUser,
        @RequestBody request: ActionRequest,
    ): ActionResponse {
        log.debug("dispatchAction: received action type={}", request.action::class.simpleName)

        // 1. Parse the client's serialized state JSON into our DTO
        val serialized: SerializedGameState = try {
            mapper.readValue(request.state)
        } catch (e: Exception) {
            log.error("dispatchAction: failed to parse state JSON", e)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid state JSON: ${e.message}")
        }

        // 2. Convert from serialized format to domain GameState
        val gameState = try {
            toGameState(serialized)
        } catch (e: Exception) {
            log.error("dispatchAction: failed to convert serialized state to GameState", e)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "State conversion failed: ${e.message}")
        }

        // 3. Apply the reducer
        val newState = try {
            GameReducer.reduce(gameState, request.action)
        } catch (e: Exception) {
            log.error("dispatchAction: reducer failed for action {}", request.action::class.simpleName, e)
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Action failed: ${e.message}")
        }

        // 4. Convert back to serialized format and return
        val newSerialized = toSerializedState(newState)
        val newStateJson = mapper.writeValueAsString(newSerialized)

        return ActionResponse(state = newStateJson)
    }

    @PostMapping("/ai-turn")
    fun aiTurn(
        @AuthenticationPrincipal oidcUser: OidcUser,
        @RequestBody request: AiTurnRequest,
    ): AiTurnResponse {
        // 1. Parse the client's serialized state JSON
        val serialized: SerializedGameState = try {
            mapper.readValue(request.state)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid state JSON: ${e.message}")
        }

        // 2. Convert to domain GameState
        val gameState = toGameState(serialized)

        // 3. Build a hex lookup backed by WorldGeneratorService
        val chunkCache = mutableMapOf<String, ChunkDataDto>()
        val hexLookup: (Int, Int) -> HexDataDto? = { q, r ->
            val cx = Math.floorDiv(q, 16)
            val cy = Math.floorDiv(r, 16)
            val chunkKey = "$cx,$cy"
            val chunk = chunkCache.getOrPut(chunkKey) {
                worldGenerator.generate(gameState.seed.toInt(), cx, cy)
            }
            chunk.hexes["$q,$r"]
        }

        // 4. Execute the AI turn (with timeout to prevent runaway pathfinding)
        val newState = try {
            val future = aiExecutor.submit<GameState> {
                AiService.executeTurn(gameState, request.playerId, hexLookup)
            }
            future.get(AI_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (e: TimeoutException) {
            log.warn("AI turn timed out after {}s for player {}", AI_TIMEOUT_SECONDS, request.playerId)
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI turn timed out")
        } catch (e: Exception) {
            val cause = e.cause ?: e
            throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "AI turn failed: ${cause.message}")
        }

        // 5. Serialize and return
        val newSerialized = toSerializedState(newState)
        val newStateJson = mapper.writeValueAsString(newSerialized)
        return AiTurnResponse(state = newStateJson)
    }

    // ── Conversion: SerializedGameState → GameState ──────────────────

    private fun toGameState(s: SerializedGameState): GameState {
        return GameState(
            turn = s.turn,
            currentPlayerIndex = s.currentPlayerIndex,
            players = s.players.map { p ->
                PlayerState(
                    id = p.id,
                    name = p.name,
                    color = p.color,
                    resources = p.resources,
                    isAI = p.isAI,
                    exploredHexes = p.exploredHexes.toSet(),
                    homeBaseId = p.homeBaseId,
                    eliminated = p.eliminated ?: false,
                    researchedTechs = (p.researchedTechs ?: emptyList()).map { TechId.fromId(it) }.toSet(),
                )
            },
            units = deserializeMap(s.units) { mapper.convertValue(it, UnitData::class.java) },
            buildings = deserializeMap(s.buildings) { mapper.convertValue(it, BuildingData::class.java) },
            dynamicObjects = deserializeMap(s.dynamicObjects) { mapper.convertValue(it, DynamicObject::class.java) },
            chunkOverrides = deserializeMap(s.chunkOverrides) { value ->
                val list = value as? List<*> ?: emptyList<Any>()
                list.map { mapper.convertValue(it, HexOverride::class.java) }
            },
            anomalies = deserializeMap(s.anomalies) { mapper.convertValue(it, Anomaly::class.java) },
            tradeHubs = deserializeMap(s.tradeHubs ?: emptyList()) { mapper.convertValue(it, TradeHub::class.java) },
            tradedThisTurn = (s.tradedThisTurn ?: emptyList()).toSet(),
            seed = s.seed,
            gameOver = s.gameOver?.let {
                GameOverState(
                    winnerId = it.winnerId,
                    reason = VictoryReason.fromId(it.reason),
                )
            },
            spectate = s.spectate,
        )
    }

    /**
     * Deserialize a list of [key, value] tuples into a Map<String, V>.
     * The client serializes JS Maps as [...map.entries()] = [[k, v], [k, v], ...].
     */
    private fun <V> deserializeMap(entries: List<List<Any>>, convert: (Any) -> V): Map<String, V> {
        val map = mutableMapOf<String, V>()
        for (entry in entries) {
            if (entry.size >= 2) {
                val key = entry[0] as String
                map[key] = convert(entry[1])
            }
        }
        return map
    }

    // ── Conversion: GameState → SerializedGameState ──────────────────

    private fun toSerializedState(state: GameState): SerializedGameState {
        return SerializedGameState(
            turn = state.turn,
            currentPlayerIndex = state.currentPlayerIndex,
            players = state.players.map { p ->
                SerializedPlayer(
                    id = p.id,
                    name = p.name,
                    color = p.color,
                    resources = p.resources,
                    isAI = p.isAI,
                    exploredHexes = p.exploredHexes.toList(),
                    homeBaseId = p.homeBaseId,
                    eliminated = p.eliminated,
                    researchedTechs = p.researchedTechs.map { it.id }.toList(),
                )
            },
            units = serializeMap(state.units),
            buildings = serializeMap(state.buildings),
            dynamicObjects = serializeMap(state.dynamicObjects),
            chunkOverrides = serializeMap(state.chunkOverrides),
            anomalies = serializeMap(state.anomalies),
            tradeHubs = serializeMap(state.tradeHubs),
            tradedThisTurn = state.tradedThisTurn.toList(),
            seed = state.seed,
            gameOver = state.gameOver?.let {
                SerializedGameOver(
                    winnerId = it.winnerId,
                    reason = it.reason.id,
                )
            },
            spectate = state.spectate,
        )
    }

    /**
     * Serialize a Map<String, V> into [[key, value], ...] tuple format
     * matching the client's JS Map serialization.
     */
    private fun <V> serializeMap(map: Map<String, V>): List<List<Any>> {
        return map.entries.map { (k, v) -> listOf(k, v as Any) }
    }
}
