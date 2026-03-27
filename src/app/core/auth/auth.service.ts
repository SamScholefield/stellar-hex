import { Injectable, signal, inject } from '@angular/core';
import { Api } from '../../api/api';
import { getSession } from '../../api/fn/auth/get-session';
import { SessionInfo } from '../../api/models/session-info';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);

  private readonly _authenticated = signal(false);
  private readonly _user = signal<SessionInfo | null>(null);

  readonly authenticated = this._authenticated.asReadonly();
  readonly user = this._user.asReadonly();

  /** Check if user has an active session with the BFF. Always returns, never throws. */
  async checkSession(): Promise<boolean> {
    try {
      const session = await this.api.invoke(getSession);
      if (session && session.username) {
        this._authenticated.set(true);
        this._user.set(session);
        return true;
      }
    } catch {
      // Server unavailable or not authenticated
    }
    this._authenticated.set(false);
    this._user.set(null);
    return false;
  }

  /** Redirect to BFF OAuth2 login (which redirects to Keycloak). */
  login(): void {
    window.location.href = '/api/oauth2/authorization/keycloak';
  }

  /** Redirect to BFF OAuth2 flow with Keycloak registration form. */
  register(): void {
    window.location.href = '/api/oauth2/authorization/keycloak?action=register';
  }

  /** Redirect to BFF logout endpoint. */
  logout(): void {
    window.location.href = '/api/auth/logout';
  }
}
