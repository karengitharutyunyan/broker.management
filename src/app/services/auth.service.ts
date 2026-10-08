import { Injectable, signal, computed, inject } from '@angular/core';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { LoginRequest, LoginResponse } from '../models/server.model';
import { AuthService as ApiAuthService } from '../api/api/auth.service';

const TOKEN_KEY = 'mgmt_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiAuth = inject(ApiAuthService);

  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  /** Read-only token signal */
  readonly token = this._token.asReadonly();

  /** True when a JWT is stored */
  readonly isLoggedIn = computed(() => !!this._token());

  login(body: LoginRequest): Observable<LoginResponse> {
    return (this.apiAuth.authLoginPost(body) as Observable<any>).pipe(
      tap((res: any) => {
        const tok = res?.token ?? res?.accessToken ?? res?.jwtToken ?? '';
        this._token.set(tok);
        localStorage.setItem(TOKEN_KEY, tok);
      })
    ) as Observable<LoginResponse>;
  }

  logout(): void {
    this._token.set(null);
    localStorage.removeItem(TOKEN_KEY);
  }
}
