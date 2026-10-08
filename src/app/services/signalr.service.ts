import { Injectable, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
import { BASE_PATH } from '../api/variables';

export interface DeploymentProgress {
  percentage: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private basePath = inject(BASE_PATH, { optional: true }) ?? 'https://localhost:7001';
  private hubConnection: signalR.HubConnection | null = null;
  private currentTenant: string | null = null;
  
  // Expose progress data reactively using an RxJS Subject
  private progressSubj = new BehaviorSubject<DeploymentProgress | null>(null);
  public progress$: Observable<DeploymentProgress | null> = this.progressSubj.asObservable();

  constructor() {}

  public startConnection(tenantName: string): void {
    // If we are already joined to the requested tenant group, do nothing
    if (this.currentTenant === tenantName) {
      console.log('⚡ Already joined tenant group:', tenantName);
      return;
    }

    const hubUrl = `${this.basePath.replace(/\/$/, '')}/hubs/deployment`;

    // 1. Lazy initialize the hub connection if it does not exist
    if (!this.hubConnection) {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
          skipNegotiation: true,
          transport: signalR.HttpTransportType.WebSockets
        })
        .withAutomaticReconnect() // Auto reconnects if the network drops out
        .build();

      // Listen for targeted progress pushes from the backend
      this.hubConnection.on('ReceiveDeploymentProgress', (percentage: number, message: string) => {
        this.progressSubj.next({ percentage, message });
      });

      // Optional listener for generic platform events
      this.hubConnection.on('ReceiveSystemMessage', (msg: string) => {
        console.log(`[System]: ${msg}`);
      });
    }

    const joinGroup = () => {
      if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
        // If joined to another tenant group previously, leave it first
        const oldTenant = this.currentTenant;
        if (oldTenant) {
          this.hubConnection.invoke('LeaveTenantGroup', oldTenant)
            .catch(err => console.warn('⚠️ Warning leaving group:', err));
        }

        this.currentTenant = tenantName;
        this.hubConnection.invoke('JoinTenantGroup', tenantName)
          .then(() => console.log('⚡ Joined tenant group:', tenantName))
          .catch(err => console.error('❌ Error joining tenant group:', err));
      }
    };

    // 2. Start connection if it is currently disconnected
    if (this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
      this.hubConnection
        .start()
        .then(() => {
          console.log('⚡ SignalR Connection Established to:', hubUrl);
          joinGroup();
        })
        .catch(err => console.error('❌ Error establishing SignalR connection: ', err));
    } else if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      joinGroup();
    } else {
      // If connecting or reconnecting, wait until state changes to Connected
      const checkInterval = setInterval(() => {
        if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
          clearInterval(checkInterval);
          joinGroup();
        } else if (!this.hubConnection || this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
          clearInterval(checkInterval);
        }
      }, 300);
    }
  }

  public stopConnection(tenantName?: string): void {
    const targetTenant = tenantName || this.currentTenant;
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected && targetTenant) {
      this.hubConnection.invoke('LeaveTenantGroup', targetTenant)
        .then(() => {
          console.log('⚡ Left tenant group:', targetTenant);
          if (targetTenant === this.currentTenant) {
            this.currentTenant = null;
            this.progressSubj.next(null);
          }
        })
        .catch(err => {
          console.error('❌ Error leaving group: ', err);
          if (targetTenant === this.currentTenant) {
            this.currentTenant = null;
            this.progressSubj.next(null);
          }
        });
    } else {
      if (targetTenant === this.currentTenant) {
        this.currentTenant = null;
        this.progressSubj.next(null);
      }
    }
  }
}
