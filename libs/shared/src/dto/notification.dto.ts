import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

/**
 * Notification priority levels.
 */
export enum NotificationPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
}

/**
 * DTO for creating a notification via notification.create message pattern.
 */
export class CreateNotificationDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    body: string;

    @IsEnum(NotificationPriority)
    @IsOptional()
    priority?: NotificationPriority = NotificationPriority.MEDIUM;

    @IsUUID()
    userId: string;

    @IsString()
    @IsOptional()
    type?: string;

    @IsOptional()
    metadata?: Record<string, unknown>;
}

/**
 * Response DTO representing a notification.
 */
export class NotificationResponseDto {
    id: string;
    title: string;
    body: string;
    priority: NotificationPriority;
    type: string | null;
    metadata: Record<string, unknown> | null;
    read: boolean;
    readAt: Date | null;
    acknowledged: boolean;
    acknowledgedAt: Date | null;
    createdAt: Date;
    userId: string;
}

/**
 * DTO for marking notifications as read.
 */
export class MarkReadDto {
    @IsArray()
    @IsUUID('4', { each: true })
    notificationIds: string[];
}

/**
 * DTO for acknowledging a notification.
 */
export class AcknowledgeDto {
    @IsUUID()
    notificationId: string;
}

/**
 * Response DTO for unread notification count.
 */
export class UnreadCountDto {
    count: number;
    userId: string;
}
