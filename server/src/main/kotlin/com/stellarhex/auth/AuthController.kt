package com.stellarhex.auth

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class UserInfoResponse(
    val username: String,
    val displayName: String,
)

@RestController
@RequestMapping("/auth")
class AuthController(
    private val userRepository: UserRepository,
) {

    /** Always returns 200. Returns user info if authenticated, null if not. */
    @GetMapping("/me")
    fun me(@AuthenticationPrincipal user: OidcUser?): UserInfoResponse? {
        if (user == null) return null

        val keycloakId = user.subject
        val displayName = user.preferredUsername ?: user.fullName ?: "Player"

        // Auto-create user record on first API call
        val userEntity = userRepository.findByKeycloakId(keycloakId).orElseGet {
            userRepository.save(UserEntity(keycloakId = keycloakId, displayName = displayName))
        }

        return UserInfoResponse(
            username = userEntity.keycloakId,
            displayName = userEntity.displayName,
        )
    }
}
