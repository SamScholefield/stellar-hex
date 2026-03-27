import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface UserInfo {
  username: string;
  displayName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _authenticated = signal(false);
  private readonly _user = signal<UserInfo | null>(null);

  readonly authenticated = this._authenticated.asReadonly();
  readonly user = this._user.asReadonly();

  /** Check if user has an active session with the BFF. Always returns, never throws. */
  async checkSession(): Promise<boolean> {
    try {
      const user = await firstValueFrom(this.http.get<UserInfo | null>('/api/auth/me'));
      if (user) {
        this._authenticated.set(true);
        this._user.set(user);
        return true;
      }
    } catch {
      // Server unavailable — continue as unauthenticated
    }
    this._authenticated.set(false);
    this._user.set(null);
    return false;
  }

  /** Redirect to BFF login endpoint (which redirects to Keycloak). */
  login(): void {
    window.location.href = '/api/auth/login';
  }

  /** Redirect to BFF logout endpoint. */
  logout(): void {
    window.location.href = '/api/auth/logout';
  }
}
