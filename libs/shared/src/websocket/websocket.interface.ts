import { NotificationResponseDto } from '../dtos/http.dto';

export interface ServerToClientEvents {
  'notification:new': (notification: NotificationResponseDto) => void;
  'notification:count': (data: { userId: string; unreadCount: number }) => void;
  'notification:delivered': (data: {
    notificationId: string;
    deliveredCount: number;
    totalRecipients: number;
  }) => void;
}

export interface ClientToServerEvents {
  'notification:markRead': (
    data: { notificationId: string },
    callback?: (response: { success: boolean; error?: string }) => void,
  ) => void;
}
