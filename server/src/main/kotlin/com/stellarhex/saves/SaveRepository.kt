package com.stellarhex.saves

import org.springframework.data.jpa.repository.JpaRepository

interface SaveRepository : JpaRepository<SaveEntity, Long> {
    fun findByUserIdOrderByUpdatedAtDesc(userId: Long): List<SaveEntity>
}
