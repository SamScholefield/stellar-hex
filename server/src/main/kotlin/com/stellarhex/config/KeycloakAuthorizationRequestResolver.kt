package com.stellarhex.config

import jakarta.servlet.http.HttpServletRequest
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest

/**
 * Custom resolver that supports Keycloak registration.
 * When ?action=register is present, swaps the /auth endpoint for /registrations.
 */
class KeycloakAuthorizationRequestResolver(
    clientRegistrationRepository: ClientRegistrationRepository,
) : OAuth2AuthorizationRequestResolver {

    private val delegate = DefaultOAuth2AuthorizationRequestResolver(
        clientRegistrationRepository,
        "/oauth2/authorization",
    )

    override fun resolve(request: HttpServletRequest): OAuth2AuthorizationRequest? {
        return delegate.resolve(request)?.let { customize(it, request) }
    }

    override fun resolve(request: HttpServletRequest, clientRegistrationId: String): OAuth2AuthorizationRequest? {
        return delegate.resolve(request, clientRegistrationId)?.let { customize(it, request) }
    }

    private fun customize(
        authRequest: OAuth2AuthorizationRequest,
        request: HttpServletRequest,
    ): OAuth2AuthorizationRequest {
        val action = request.getParameter("action") ?: return authRequest

        if (action == "register") {
            // Replace /auth with /registrations in the authorization URI
            val registrationUri = authRequest.authorizationUri
                .replace("/protocol/openid-connect/auth", "/protocol/openid-connect/registrations")

            return OAuth2AuthorizationRequest.from(authRequest)
                .authorizationUri(registrationUri)
                .build()
        }

        return authRequest
    }
}
