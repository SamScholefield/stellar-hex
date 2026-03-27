package com.stellarhex.auth

import org.springframework.data.jpa.repository.JpaRepository
import java.util.Optional

interface UserRepository : JpaRepository<UserEntity, Long> {
    fun findByKeycloakId(keycloakId: String): Optional<UserEntity>
}
