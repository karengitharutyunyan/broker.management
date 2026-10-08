import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  loading  = signal(false);
  error    = signal<string | null>(null);
  showPass = false;

  submit() {
    if (!this.username.trim() || !this.password.trim()) {
      this.error.set('Введите имя пользователя и пароль');
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    this.auth.login({ username: this.username, password: this.password }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? err?.message ?? 'Ошибка авторизации';
        this.error.set(msg);
      },
    });
  }

  togglePass() { this.showPass = !this.showPass; }
}
