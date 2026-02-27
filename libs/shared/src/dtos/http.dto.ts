import { NotificationType } from '../enums/notification-type.enum';
import { UserRole } from '../enums/user-role.enum';

// ─── Auth DTOs ───────────────────────────────────────────────────────────────

export class LoginDto {
  email: string;
  password: string;
}

export class RegisterDto {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

// ─── Notification DTOs ───────────────────────────────────────────────────────

export class CreateNotificationDto {
  title: string;
  body: string;
  type: NotificationType;
  recipientIds?: string[];
  broadcast?: boolean;
}

export class NotificationResponseDto {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  senderId: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
  delivered: boolean;
  deliveredAt?: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

// ─── User DTOs ───────────────────────────────────────────────────────────────

export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}
