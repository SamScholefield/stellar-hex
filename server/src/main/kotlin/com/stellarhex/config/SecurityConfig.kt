package com.stellarhex.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.core.Authentication
import org.springframework.security.core.AuthenticationException
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler
import org.slf4j.LoggerFactory
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Configuration
@EnableWebSecurity
class SecurityConfig {

    private val log = LoggerFactory.getLogger(SecurityConfig::class.java)

    @Value("\${stellarhex.frontend-url:http://localhost:80}")
    private lateinit var frontendUrl: String

    @Value("\${stellarhex.keycloak-logout-url:http://localhost:9090/realms/stellar-hex/protocol/openid-connect/logout}")
    private lateinit var keycloakLogoutUrl: String

    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        clientRegistrationRepository: ClientRegistrationRepository,
    ): SecurityFilterChain {
        http
            .csrf { it.disable() }
            .authorizeHttpRequests { auth ->
                auth
                    .requestMatchers("/health", "/actuator/health").permitAll()
                    .requestMatchers("/auth/me").permitAll()
                    .anyRequest().authenticated()
            }
            .exceptionHandling {
                it.authenticationEntryPoint(Http401EntryPoint())
            }
            .oauth2Login { oauth ->
                oauth.authorizationEndpoint {
                    it.authorizationRequestResolver(
                        KeycloakAuthorizationRequestResolver(clientRegistrationRepository)
                    )
                }
                oauth.failureHandler(AuthenticationFailureHandler { _, response, exception ->
                    log.error("OAuth2 login failed: ${exception.message}", exception)
                    response.sendRedirect("$frontendUrl/auth?error=auth_failed")
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
                    .logoutSuccessHandler(keycloakLogoutHandler())
                    .invalidateHttpSession(true)
                    .clearAuthentication(true)
            }

        return http.build()
    }

    private fun keycloakLogoutHandler() = LogoutSuccessHandler { request, response, authentication ->
        val redirectUri = URLEncoder.encode("$frontendUrl/auth", StandardCharsets.UTF_8)
        val idToken = (authentication?.principal as? OidcUser)?.idToken?.tokenValue
        val logoutUrl = if (idToken != null) {
            "$keycloakLogoutUrl?id_token_hint=$idToken&post_logout_redirect_uri=$redirectUri"
        } else {
            "$keycloakLogoutUrl?post_logout_redirect_uri=$redirectUri"
        }
        response.sendRedirect(logoutUrl)
    }
}

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
