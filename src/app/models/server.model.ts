// ── Enums ──────────────────────────────────────────────────────────────────

export enum ProcessStatus {
  New = 0,
  Panding = 1,
  Error = 2,
  Success = 3,
}


// ── Models ─────────────────────────────────────────────────────────────────

export interface Server {
  id: number;
  serverIp: string | null;
  tenant: string | null;
  username: string | null;
  domain: string | null;
  cF_ZONE_ID: string | null;
  cF_API_TOKEN: string | null;
  giT_URL: string | null;
  branch: string | null;
  giT_TOKEN: string | null;
  password: string | null;
  log: string | null;
  processStatus: ProcessStatus;
  createdAt: string;       // ISO date-time
  updatedAt: string | null;
  url: string | null;
  type: number;
  totalSizeGB?: number | null;
  usedSizeGB?: number | null;
}

// ── Requests ───────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateServerRequest {
  serverIp: string | null;
  tenant: string | null;
  username: string | null;
  domain: string | null;
  cF_ZONE_ID: string | null;
  cF_API_TOKEN: string | null;
  giT_URL: string | null;
  branch: string | null;
  giT_TOKEN: string | null;
  password: string | null;
  url: string | null;
  type: number;
}

export interface DeleteServerRequest {
  serverIp: string | null;
  username: string | null;
  password: string | null;
  tenant: string | null;
  domain: string | null;
  cF_ZONE_ID: string | null;
  cF_API_TOKEN: string | null;
}

export interface DeployManagementRequest {
  serverIp: string | null;
  username: string | null;
  domain: string | null;
  cF_ZONE_ID: string | null;
  cF_API_TOKEN: string | null;
  giT_URL: string | null;
  branch: string | null;
  giT_TOKEN: string | null;
  password: string | null;
  url: string | null;
  type: number;
}

// ── Auth response (assumed standard shape) ─────────────────────────────────

export interface LoginResponse {
  token: string;
}
