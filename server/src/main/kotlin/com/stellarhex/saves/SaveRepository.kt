package com.stellarhex.saves

import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository

interface SaveRepository : JpaRepository<SaveEntity, Long> {
    fun findByUserIdOrderByUpdatedAtDesc(userId: Long): List<SaveEntity>
    fun findByUserIdOrderByUpdatedAtDesc(userId: Long, pageable: Pageable): Page<SaveEntity>
}
