package com.stellarhex.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler

@Configuration
@EnableWebSecurity
class SecurityConfig {

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
                    .requestMatchers("/auth/login", "/auth/logout").permitAll()
                    .anyRequest().authenticated()
            }
            .oauth2Login { oauth ->
                oauth
                    .loginPage("/oauth2/authorization/keycloak")
                    .successHandler(
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
