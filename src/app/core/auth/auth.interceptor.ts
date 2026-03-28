import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only attach credentials to API requests
  if (req.url.startsWith('/api') || req.url.includes('localhost:8080')) {
    const authReq = req.clone({ withCredentials: true });
    return next(authReq);
  }
  return next(req);
};
