package com.stellarhex.saves

import com.stellarhex.auth.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

data class SaveRequest(
    val saveName: String? = null,
    val stateJson: String,
    val cameraJson: String? = null,
    val waypointsJson: String? = null,
    val turn: Int = 1,
    val playerName: String? = null,
)

data class SaveSummary(
    val id: Long,
    val saveName: String,
    val playerName: String?,
    val turn: Int,
    val updatedAt: Instant,
)

data class SaveData(
    val id: Long,
    val saveName: String,
    val stateJson: String,
    val cameraJson: String?,
    val waypointsJson: String?,
    val turn: Int,
    val playerName: String?,
    val updatedAt: Instant,
)

@RestController
@RequestMapping("/saves")
class SaveController(
    private val saveRepository: SaveRepository,
    private val userRepository: UserRepository,
) {

    @GetMapping
    fun listSaves(@AuthenticationPrincipal oidcUser: OidcUser): List<SaveSummary> {
        val user = resolveUser(oidcUser)
        return saveRepository.findByUserIdOrderByUpdatedAtDesc(user.id).map { it.toSummary() }
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun createSave(@AuthenticationPrincipal oidcUser: OidcUser, @RequestBody req: SaveRequest): SaveSummary {
        val user = resolveUser(oidcUser)
        val entity = SaveEntity(
            user = user,
            saveName = req.saveName ?: "Autosave",
            stateJson = req.stateJson,
            cameraJson = req.cameraJson,
            waypointsJson = req.waypointsJson,
            turn = req.turn,
            playerName = req.playerName,
        )
        return saveRepository.save(entity).toSummary()
    }

    @GetMapping("/{id}")
    fun loadSave(@AuthenticationPrincipal oidcUser: OidcUser, @PathVariable id: Long): SaveData {
        val user = resolveUser(oidcUser)
        val entity = saveRepository.findById(id).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Save not found")
        }
        if (entity.user.id != user.id) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Save not found")
        }
        return entity.toData()
    }

    @PutMapping("/{id}")
    fun updateSave(
        @AuthenticationPrincipal oidcUser: OidcUser,
        @PathVariable id: Long,
        @RequestBody req: SaveRequest,
    ): SaveSummary {
        val user = resolveUser(oidcUser)
        val entity = saveRepository.findById(id).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Save not found")
        }
        if (entity.user.id != user.id) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Save not found")
        }
        entity.saveName = req.saveName ?: entity.saveName
        entity.stateJson = req.stateJson
        entity.cameraJson = req.cameraJson
        entity.waypointsJson = req.waypointsJson
        entity.turn = req.turn
        entity.playerName = req.playerName
        entity.updatedAt = Instant.now()
        return saveRepository.save(entity).toSummary()
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSave(@AuthenticationPrincipal oidcUser: OidcUser, @PathVariable id: Long) {
        val user = resolveUser(oidcUser)
        val entity = saveRepository.findById(id).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Save not found")
        }
        if (entity.user.id != user.id) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Save not found")
        }
        saveRepository.delete(entity)
    }

    private fun resolveUser(oidcUser: OidcUser) =
        userRepository.findByKeycloakId(oidcUser.subject).orElseThrow {
            ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found")
        }

    private fun SaveEntity.toSummary() = SaveSummary(id, saveName, playerName, turn, updatedAt)

    private fun SaveEntity.toData() = SaveData(id, saveName, stateJson, cameraJson, waypointsJson, turn, playerName, updatedAt)
}
