export * from './auth.service';
import { AuthService } from './auth.service';
export * from './manage.service';
import { ManageService } from './manage.service';
export const APIS = [AuthService, ManageService];
