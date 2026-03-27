import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Redirects to /auth if not authenticated. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  console.log('[authGuard] checking session...');
  const authenticated = await auth.checkSession();
  console.log('[authGuard] authenticated:', authenticated);
  if (authenticated) return true;

  return router.createUrlTree(['/auth']);
};

/** Redirects to /menu if already authenticated. */
export const publicGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const authenticated = await auth.checkSession();
  if (!authenticated) return true;

  return router.createUrlTree(['/menu']);
};
