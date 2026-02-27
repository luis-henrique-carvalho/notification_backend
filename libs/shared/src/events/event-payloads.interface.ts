import { NotificationType } from '../enums/notification-type.enum';
import { UserRole } from '../enums/user-role.enum';

// ─── User Events ────────────────────────────────────────────────────────────

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface RegisterSucceededPayload {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface RegisterFailedPayload {
  reason: string;
  email?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginSucceededPayload {
  accessToken: string;
  userId: string;
  role: UserRole;
}

export interface LoginFailedPayload {
  reason: string;
  email?: string;
}

export interface UserListRequestedPayload {
  requestedBy?: string;
}

export interface UserResponsePayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface UserListSucceededPayload {
  users: UserResponsePayload[];
}

// ─── Notification Events ─────────────────────────────────────────────────────

export interface CreateNotificationPayload {
  title: string;
  body: string;
  type: NotificationType;
  senderId: string;
  recipientIds?: string[];
  broadcast?: boolean;
}

export interface NotificationResponsePayload {
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

export interface NotificationCreatedPayload {
  notification: NotificationResponsePayload;
  recipientIds: string[];
}

export interface NotificationCreateFailedPayload {
  reason: string;
}

export interface NotificationListRequestedPayload {
  recipientId: string;
  page?: number;
  limit?: number;
}

export interface NotificationListSucceededPayload {
  notifications: NotificationResponsePayload[];
  total: number;
}

export interface MarkReadRequestedPayload {
  notificationId: string;
  userId: string;
}

export interface MarkReadSucceededPayload {
  notificationId: string;
  userId: string;
  readAt: string;
}

export interface MarkReadFailedPayload {
  notificationId: string;
  reason: string;
}

export interface AcknowledgeRequestedPayload {
  notificationId: string;
  userId: string;
}

export interface AcknowledgeSucceededPayload {
  notificationId: string;
  userId: string;
  acknowledgedAt: string;
}

export interface AcknowledgeFailedPayload {
  notificationId: string;
  reason: string;
}

export interface UnreadCountRequestedPayload {
  userId: string;
}

export interface UnreadCountSucceededPayload {
  userId: string;
  count: number;
}

export interface HistoryRequestedPayload {
  requestedBy: string;
  page?: number;
  limit?: number;
}

export interface NotificationHistoryEntry extends NotificationResponsePayload {
  deliveredCount: number;
  readCount: number;
  acknowledgedCount: number;
}

export interface HistorySucceededPayload {
  notifications: NotificationHistoryEntry[];
  total: number;
}

export interface DeliveredPayload {
  notificationId: string;
  recipientId: string;
  deliveredAt: string;
}

export interface PendingCriticalRequestedPayload {
  userId: string;
}

export interface PendingCriticalSucceededPayload {
  notifications: NotificationResponsePayload[];
}
