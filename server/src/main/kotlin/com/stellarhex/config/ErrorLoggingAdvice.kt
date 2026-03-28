package com.stellarhex.config

import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler

@ControllerAdvice
class ErrorLoggingAdvice {

    private val log = LoggerFactory.getLogger(ErrorLoggingAdvice::class.java)

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun handleUnreadableMessage(ex: HttpMessageNotReadableException): ResponseEntity<Map<String, String>> {
        log.error("Failed to deserialize request body: {}", ex.message, ex)
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(mapOf(
                "error" to "Bad Request",
                "message" to (ex.mostSpecificCause.message ?: "Unreadable request body"),
            ))
    }
}
