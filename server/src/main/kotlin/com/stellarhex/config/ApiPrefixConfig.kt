package com.stellarhex.config

import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.method.HandlerTypePredicate
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/**
 * In production (context-path: /), prefix all REST controllers with /api
 * so the Angular SPA can be served at the root while API endpoints remain
 * at /api/...
 *
 * In dev (context-path: /api), this is not needed since the context path
 * already provides the /api prefix.
 */
@Configuration
@Profile("prod")
class ApiPrefixConfig : WebMvcConfigurer {

    override fun configurePathMatch(configurer: PathMatchConfigurer) {
        configurer.addPathPrefix("/api", HandlerTypePredicate.forAnnotation(RestController::class.java))
    }
}
