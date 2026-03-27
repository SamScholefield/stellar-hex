package com.stellarhex.saves

import com.stellarhex.auth.UserEntity
import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "game_saves")
data class SaveEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    val user: UserEntity,

    @Column(name = "save_name", nullable = false)
    var saveName: String = "Autosave",

    @Column(name = "state_json", columnDefinition = "jsonb", nullable = false)
    var stateJson: String,

    @Column(name = "camera_json", columnDefinition = "jsonb")
    var cameraJson: String? = null,

    @Column(name = "waypoints_json", columnDefinition = "jsonb")
    var waypointsJson: String? = null,

    @Column(nullable = false)
    var turn: Int = 1,

    @Column(name = "player_name")
    var playerName: String? = null,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
