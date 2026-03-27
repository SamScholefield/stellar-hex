package com.stellarhex.auth

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "users")
data class UserEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "keycloak_id", nullable = false, unique = true)
    val keycloakId: String,

    @Column(name = "display_name", nullable = false)
    var displayName: String,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),
)
