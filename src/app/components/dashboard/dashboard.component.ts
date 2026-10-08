import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SignalrService, DeploymentProgress } from '../../services/signalr.service';
import { Server, ServerProcessStatusEnum, ServerTypeEnum } from '../../api/model/server';
import { CreateServerRequest } from '../../api/model/createServerRequest';
import { ManageService } from '../../api/api/manage.service';
import { PausePlayServerRequest } from '../../api';

export function statusLabel(s: ServerProcessStatusEnum): string {
  switch (s) {
    case ServerProcessStatusEnum.CreationInQueue:
    case ServerProcessStatusEnum.PausingInQueue:
    case ServerProcessStatusEnum.ResumingInQueue:
    case ServerProcessStatusEnum.DeletionInQueue
      : return 'new';
    case ServerProcessStatusEnum.Running
      : return 'success';
    case ServerProcessStatusEnum.Error
      : return 'error';
    case ServerProcessStatusEnum.Creating:
    case ServerProcessStatusEnum.Pausing:
    case ServerProcessStatusEnum.Resuming:
    case ServerProcessStatusEnum.Deleting
      : return 'panding';
    case ServerProcessStatusEnum.Paused
      : return 'paused';
    default: return 'stopped';
  }
}
// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private manageService = inject(ManageService);
  private authService = inject(AuthService);
  private signalrService = inject(SignalrService);
  private router = inject(Router);

  servers = signal<Server[]>([]);
  loading = signal(false);
  apiError = signal<string | null>(null);

  deploymentProgress = signal<DeploymentProgress | null>(null);
  activeTenant: string | null = null;
  pendingQueue: string[] = [];
  private progressSub?: Subscription;

  ProcessStatus = ServerProcessStatusEnum;
  ServerTypeEnum = ServerTypeEnum;
  statusLabel = statusLabel;

  runningCount = computed(() => this.servers().filter(s => s.processStatus === ServerProcessStatusEnum.Running).length);
  pausedCount = computed(() => this.servers().filter(s => s.processStatus === ServerProcessStatusEnum.Paused).length);
  errorCount = computed(() => this.servers().filter(s => s.processStatus === ServerProcessStatusEnum.Error).length);
  pendingCount = computed(() => this.servers().filter(s =>
    s.processStatus === ServerProcessStatusEnum.Creating ||
    s.processStatus === ServerProcessStatusEnum.Pausing ||
    s.processStatus === ServerProcessStatusEnum.Resuming ||
    s.processStatus === ServerProcessStatusEnum.Deleting).length);

  uniqueServerIps = computed(() => [...new Set(this.servers().map(s => s.serverIp).filter(Boolean))]);
  uniqueUsernames = computed(() => [...new Set(this.servers().map(s => s.username).filter(Boolean))]);
  uniqueTenants = computed(() => [...new Set(this.servers().map(s => s.tenant).filter(Boolean))]);
  uniqueDomains = computed(() => [...new Set(this.servers().map(s => s.domain).filter(Boolean))]);
  uniqueBranches = computed(() => [...new Set(this.servers().map(s => s.branch).filter(Boolean))]);
  uniqueGitUrls = computed(() => [...new Set(this.servers().map(s => s.giT_URL).filter(Boolean))]);
  uniqueGitTokens = computed(() => [...new Set(this.servers().map(s => s.giT_TOKEN).filter(Boolean))]);
  uniqueCfZones = computed(() => [...new Set(this.servers().map(s => s.cF_ZONE_ID).filter(Boolean))]);
  uniqueCfTokens = computed(() => [...new Set(this.servers().map(s => s.cF_API_TOKEN).filter(Boolean))]);
  uniqueUrls = computed(() => [...new Set(this.servers().map(s => s.url).filter(Boolean))]);

  serversByTenant = computed(() => {
    const list = this.servers();
    const groups: { tenant: string; servers: Server[] }[] = [];
    const map = new Map<string, Server[]>();
    for (const s of list) {
      const t = s.tenant || 'Unassigned';
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    for (const [tenant, servers] of map.entries()) {
      groups.push({ tenant, servers });
    }
    return groups.sort((a, b) => a.tenant.localeCompare(b.tenant));
  });

  expandedTenants = signal<Set<string>>(new Set<string>());

  toggleTenant(tenant: string) {
    const current = new Set(this.expandedTenants());
    if (current.has(tenant)) {
      current.delete(tenant);
    } else {
      current.add(tenant);
    }
    this.expandedTenants.set(current);
  }

  selectedServer = signal<Server | null>(null);

  selectServer(server: Server) {
    this.selectedServer.set(server);
  }

  closeDetails() {
    this.selectedServer.set(null);
  }

  getStorageUsed(entry: Server): number | null {
    const val = entry.usedSizeGB ?? (entry as any).UsedSizeGB;
    return val !== undefined && val !== null ? val : null;
  }

  getStorageTotal(entry: Server): number | null {
    const val = entry.totalSizeGB ?? (entry as any).TotalSizeGB;
    return val !== undefined && val !== null ? val : null;
  }

  getStoragePercentage(entry: Server): number | null {
    const used = this.getStorageUsed(entry);
    const total = this.getStorageTotal(entry);
    if (used === null || total === null || total <= 0 || used < 0) {
      return null;
    }
    const pct = (used / total) * 100;
    return Math.min(Math.max(pct, 0), 100);
  }

  showModal = false;
  isEdit = false;
  editEntry: Server | null = null;
  formLoading = false;

  emptyForm(): Server {
    return {
      serverIp: '',
      tenant: '',
      username: '',
      domain: '',
      cF_ZONE_ID: '',
      cF_API_TOKEN: '',
      giT_URL: '',
      branch: '',
      giT_TOKEN: '',
      password: '',
      type: ServerTypeEnum.AdminApi,
      url: '',
      processStatus: ServerProcessStatusEnum.CreationInQueue,
      createdAt: '',
      freeUserCount: 0,
      priceByUser: 0,
      balance: 0,
      totalUserCount: 0,

    };
  }
  form: Server = this.emptyForm();

  notification: { message: string; type: 'success' | 'error' | 'info' } | null = null;
  private notifTimer: ReturnType<typeof setTimeout> | null = null;

  get currentUser(): string { return 'Admin'; }

  ngOnInit() {
    this.loadServers();
    this.progressSub = this.signalrService.progress$.subscribe(prog => {
      this.deploymentProgress.set(prog);
      if (prog && (prog.percentage === 100 || prog.percentage < 0)) {
        const finishedTenant = this.activeTenant;
        setTimeout(() => {
          this.deploymentProgress.set(null);
          if (finishedTenant) {
            this.signalrService.stopConnection(finishedTenant);
            this.pendingQueue = this.pendingQueue.filter(t => t !== finishedTenant);
            if (this.activeTenant === finishedTenant) {
              this.activeTenant = null;
            }
          }
          this.loadServers();
        }, 5000);
      }
    });
  }

  ngOnDestroy() {
    if (this.progressSub) {
      this.progressSub.unsubscribe();
    }
    if (this.activeTenant) {
      this.signalrService.stopConnection(this.activeTenant);
    }
  }

  logout() { this.authService.logout(); this.router.navigate(['/login']); }

  loadServers() {
    this.loading.set(true);
    this.apiError.set(null);
    this.manageService.manageServersGet().subscribe({
      next: (data) => {
        this.servers.set(data);
        this.loading.set(false);
        if (this.selectedServer()) {
          const updated = data.find(s => s.id === this.selectedServer()?.id);
          if (updated) {
            this.selectedServer.set(updated);
          } else {
            this.selectedServer.set(null);
          }
        }
        const databasePendingTenants = data
          .filter(s => s.processStatus === ServerProcessStatusEnum.Creating ||
            s.processStatus === ServerProcessStatusEnum.Pausing ||
            s.processStatus === ServerProcessStatusEnum.Resuming ||
            s.processStatus === ServerProcessStatusEnum.Deleting)
          .map(s => s.tenant)
          .filter(Boolean) as string[];

        const newQueue = [...this.pendingQueue];
        for (const t of databasePendingTenants) {
          if (!newQueue.includes(t)) {
            newQueue.push(t);
          }
        }

        // const nonPendingDatabaseTenants = data
        //   .filter(s =>
        //     s.processStatus !== ServerProcessStatusEnum.Creating &&
        //     s.processStatus !== ServerProcessStatusEnum.Pausing &&
        //     s.processStatus !== ServerProcessStatusEnum.Resuming &&
        //     s.processStatus !== ServerProcessStatusEnum.Deleting)
        //   .map(s => s.tenant)
        //   .filter(Boolean) as string[];

        this.pendingQueue = newQueue   //.filter(t => !nonPendingDatabaseTenants.includes(t));
        this.checkQueue();
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? err?.message ?? 'Ошибка загрузки серверов';
        this.apiError.set(msg);
        this.notify(msg, 'error');
      },
    });
  }
  checkQueue() {
    if (this.activeTenant) {
      if (this.pendingQueue.includes(this.activeTenant)) {
        return;
      } else {
        this.signalrService.stopConnection(this.activeTenant);
        this.activeTenant = null;
        this.deploymentProgress.set(null);
      }
    }
    if (this.pendingQueue.length > 0) {
      this.activeTenant = this.pendingQueue[0];
      this.signalrService.startConnection(this.activeTenant);
    }
  }

  openAdd() { this.form = this.emptyForm(); this.isEdit = false; this.editEntry = null; this.showModal = true; }

  openEdit(entry: Server) {
    this.form = {
      serverIp: entry.serverIp ?? '',
      tenant: entry.tenant ?? '',
      username: entry.username ?? '',
      domain: entry.domain ?? '',
      cF_ZONE_ID: entry.cF_ZONE_ID ?? '',
      cF_API_TOKEN: entry.cF_API_TOKEN ?? '',
      giT_URL: entry.giT_URL ?? '',
      branch: entry.branch ?? '',
      giT_TOKEN: entry.giT_TOKEN ?? '',
      password: entry.password ?? '',
      url: entry.url ?? '',
      type: entry.type ?? ServerTypeEnum.AdminApi,
      freeUserCount: entry.freeUserCount ?? 0,
      priceByUser: entry.priceByUser ?? 0,
      balance: entry.balance ?? 0,
      totalUserCount: entry.totalUserCount ?? 0,
      processStatus: entry.processStatus ?? ServerProcessStatusEnum.CreationInQueue,
      createdAt: entry.createdAt ?? '',
      updatedAt: entry.updatedAt ?? '',
    };
    this.isEdit = true; this.editEntry = entry; this.showModal = true;
  }

  closeModal() { this.showModal = false; this.formLoading = false; }

  saveForm() {
    if (!this.form.serverIp?.trim()) { this.notify('IP сервера обязателен!', 'error'); return; }
    const req: CreateServerRequest = {
      serverIp: this.form.serverIp || null,
      tenant: this.form.tenant || null,
      username: this.form.username || null,
      domain: this.form.domain || null,
      cF_ZONE_ID: this.form.cF_ZONE_ID || null,
      cF_API_TOKEN: this.form.cF_API_TOKEN || null,
      giT_URL: this.form.giT_URL || null,
      branch: this.form.branch || null,
      giT_TOKEN: this.form.giT_TOKEN || null,
      password: this.form.password || null,
    };
    this.formLoading = true;
    let call$;
    switch (this.form.type) {
      case ServerTypeEnum.BrokerApi:
        call$ = this.manageService.manageCreateBrokerApiPost(req);
        break;
      case ServerTypeEnum.BrokerWeb:
        call$ = this.manageService.manageCreateBrokerWebPost(req);
        break;
      case ServerTypeEnum.AdminWeb:
        call$ = this.manageService.manageCreateAdminWebPost(req);
        break;
      case ServerTypeEnum.AdminApi:
      default:
        call$ = this.manageService.manageCreateAdminApiPost(req);
        break;
    }

    if (this.form.tenant) {
      if (!this.pendingQueue.includes(this.form.tenant)) {
        this.pendingQueue.push(this.form.tenant);
      }
      this.checkQueue();
    }

    call$.subscribe({
      next: () => {
        this.formLoading = false;
        this.notify(`Сервер "${req.serverIp}" создан`, 'success');
        this.closeModal(); this.loadServers();
      },
      error: (err) => {
        this.formLoading = false;
        const msg = err?.error?.message ?? err?.message ?? 'Ошибка создания';
        this.notify(msg, 'error');
        if (this.form.tenant) {
          this.pendingQueue = this.pendingQueue.filter(t => t !== this.form.tenant);
          this.checkQueue();
        }
      },
    });
  }

  deleteEntry(entry: Server) {
    let call$;
    switch (entry.type) {
      case ServerTypeEnum.BrokerApi:
        call$ = this.manageService.manageDeleteBrokerApiDelete(entry);
        break;
      case ServerTypeEnum.BrokerWeb:
        call$ = this.manageService.manageDeleteBrokerWebDelete(entry);
        break;
      case ServerTypeEnum.AdminWeb:
        call$ = this.manageService.manageDeleteAdminWebDelete(entry);
        break;
      case ServerTypeEnum.AdminApi:
      default:
        call$ = this.manageService.manageDeleteAdminApiDelete(entry);
        break;
    }
    call$.subscribe({
      next: () => { this.notify(`Сервер "${entry.serverIp}" удалён`, 'info'); this.loadServers(); },
      error: (err) => { const msg = err?.error?.message ?? err?.message ?? 'Ошибка удаления'; this.notify(msg, 'error'); },
    });
  }

  deployServer(entry: any) {
    const req: CreateServerRequest = {
      serverIp: entry.serverIp ?? null,
      tenant: entry.tenant ?? null,
      username: entry.username ?? null,
      domain: entry.domain ?? null,
      cF_ZONE_ID: entry.cF_ZONE_ID ?? null,
      cF_API_TOKEN: entry.cF_API_TOKEN ?? null,
      giT_URL: entry.giT_URL ?? null,
      branch: entry.branch ?? null,
      giT_TOKEN: entry.giT_TOKEN ?? null,
      password: entry.password ?? null,
    };
    this.notify(`Деплой "${entry.serverIp}"...`, 'info');

    if (entry.tenant) {
      if (!this.pendingQueue.includes(entry.tenant)) {
        this.pendingQueue.push(entry.tenant);
      }
      this.checkQueue();
    }

    let call$;
    switch (entry.type) {
      case ServerTypeEnum.BrokerApi:
        call$ = this.manageService.manageCreateBrokerApiPost(req);
        break;
      case ServerTypeEnum.BrokerWeb:
        call$ = this.manageService.manageCreateBrokerWebPost(req);
        break;
      case ServerTypeEnum.AdminWeb:
        call$ = this.manageService.manageCreateAdminWebPost(req);
        break;
      case ServerTypeEnum.AdminApi:
      default:
        call$ = this.manageService.manageCreateAdminApiPost(req);
        break;
    }
    call$.subscribe({
      next: () => {
        this.notify(`Деплой "${entry.serverIp}" запущен`, 'success');
        this.loadServers();
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? 'Ошибка деплоя';
        this.notify(msg, 'error');
        if (entry.tenant) {
          this.pendingQueue = this.pendingQueue.filter(t => t !== entry.tenant);
          this.checkQueue();
        }
      },
    });
  }

  pauseServer(entry: Server) {
    this.notify(`${entry.processStatus === ServerProcessStatusEnum.Running ? "Пауза" : "Возобновить"}  "${entry.serverIp}"...`, 'info');
    const req: PausePlayServerRequest = {
      serverIp: entry.serverIp ?? null,
      tenant: entry.tenant ?? null,
      username: entry.username ?? null,
      password: entry.password ?? null,
      command: entry.processStatus === ServerProcessStatusEnum.Paused ? 'play' : entry.processStatus === ServerProcessStatusEnum.Running ? "pause" : "",
      isApi: (entry.type === ServerTypeEnum.AdminWeb || entry.type === ServerTypeEnum.BrokerWeb) ? false : true,
    };
    
    let call$;
    switch (entry.type) {
      case ServerTypeEnum.BrokerApi:
        call$ = this.manageService.managePausePlayBrokerApiPost(req);
        break;
      case ServerTypeEnum.BrokerWeb:
        call$ = this.manageService.managePausePlayBrokerWebPost(req);
        break;
      case ServerTypeEnum.AdminApi:
      case ServerTypeEnum.AdminWeb:
      default:
        call$ = this.manageService.managePlayPauseTenantDelete(req); // Note: Admin uses this unified endpoint currently
        break;
    }

    call$.subscribe({
      next: () => {
        this.notify(`${entry.processStatus === ServerProcessStatusEnum.Running ? "Пауза" : "Возобновить"} "${entry.serverIp}" выполнена`, 'success');
        this.loadServers();
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? 'Ошибка паузы';
        this.notify(msg, 'error');
      },
    });
  }
  private notify(message: string, type: 'success' | 'error' | 'info') {
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.notification = { message, type };
    this.notifTimer = setTimeout(() => (this.notification = null), 3500);
  }

  trackById(_: number, item: Server) { return item.id; }
}
