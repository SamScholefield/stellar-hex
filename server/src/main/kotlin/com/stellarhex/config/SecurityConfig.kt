package com.stellarhex.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.core.AuthenticationException
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler
import org.slf4j.LoggerFactory

@Configuration
@EnableWebSecurity
class SecurityConfig {

    private val log = LoggerFactory.getLogger(SecurityConfig::class.java)

    @Value("\${stellarhex.frontend-url:http://localhost:80}")
    private lateinit var frontendUrl: String

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.disable() }
            .authorizeHttpRequests { auth ->
                auth
                    .requestMatchers("/health", "/actuator/health").permitAll()
                    .requestMatchers("/auth/me").permitAll()
                    .anyRequest().authenticated()
            }
            .exceptionHandling {
                // Return 401 for unauthenticated API calls instead of redirecting
                it.authenticationEntryPoint(Http401EntryPoint())
            }
            .oauth2Login { oauth ->
                oauth.failureHandler(AuthenticationFailureHandler { request, response, exception ->
                    log.error("OAuth2 login failed: ${exception.message}", exception)
                    response.sendRedirect("$frontendUrl/menu?error=auth_failed")
                })
                oauth.successHandler(
                    SimpleUrlAuthenticationSuccessHandler().apply {
                        setDefaultTargetUrl("$frontendUrl/menu")
                        setAlwaysUseDefaultTargetUrl(true)
                    }
                )
            }
            .logout { logout ->
                logout
                    .logoutUrl("/auth/logout")
                    .logoutSuccessUrl("$frontendUrl/menu")
                    .invalidateHttpSession(true)
                    .clearAuthentication(true)
            }

        return http.build()
    }
}

/** Return 401 JSON instead of redirecting to a login page. */
class Http401EntryPoint : AuthenticationEntryPoint {
    override fun commence(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authException: AuthenticationException,
    ) {
        response.status = HttpServletResponse.SC_UNAUTHORIZED
        response.contentType = "application/json"
        response.writer.write("""{"error": "unauthorized"}""")
    }
}
