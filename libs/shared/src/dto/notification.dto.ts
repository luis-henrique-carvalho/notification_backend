import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
    @ApiProperty({ description: 'The title of the notification', example: 'System Update' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ description: 'The body content of the notification', example: 'The system will undergo maintenance.' })
    @IsString()
    @IsNotEmpty()
    body: string;

    @ApiPropertyOptional({ enum: NotificationPriority, default: NotificationPriority.MEDIUM, description: 'Priority level of the notification' })
    @IsEnum(NotificationPriority)
    @IsOptional()
    priority?: NotificationPriority = NotificationPriority.MEDIUM;

    @ApiProperty({ description: 'The ID of the user the notification belongs to' })
    @IsUUID()
    userId: string;

    @ApiPropertyOptional({ description: 'Optional type categorization for the notification' })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({ description: 'Additional metadata payload' })
    @IsOptional()
    metadata?: Record<string, unknown>;
}

/**
 * Response DTO representing a notification.
 */
export class NotificationResponseDto {
    @ApiProperty({ description: 'The unique identifier for the notification' })
    id: string;

    @ApiProperty({ description: 'The title of the notification' })
    title: string;

    @ApiProperty({ description: 'The body content of the notification' })
    body: string;

    @ApiProperty({ enum: NotificationPriority, description: 'Priority level of the notification' })
    priority: NotificationPriority;

    @ApiProperty({ description: 'Type categorization for the notification', nullable: true })
    type: string | null;

    @ApiProperty({ description: 'Additional metadata payload', nullable: true })
    metadata: Record<string, unknown> | null;

    @ApiProperty({ description: 'Whether the notification has been read' })
    read: boolean;

    @ApiProperty({ description: 'Date when the notification was read', nullable: true })
    readAt: Date | null;

    @ApiProperty({ description: 'Whether the notification has been acknowledged' })
    acknowledged: boolean;

    @ApiProperty({ description: 'Date when the notification was acknowledged', nullable: true })
    acknowledgedAt: Date | null;

    @ApiProperty({ description: 'Date when the notification was created' })
    createdAt: Date;

    @ApiProperty({ description: 'The ID of the user the notification belongs to' })
    userId: string;
}

/**
 * DTO for marking notifications as read.
 */
export class MarkReadDto {
    @ApiProperty({ description: 'Array of notification IDs to mark as read', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    notificationIds: string[];
}

/**
 * DTO for acknowledging a notification.
 */
export class AcknowledgeDto {
    @ApiProperty({ description: 'The ID of the notification to acknowledge' })
    @IsUUID()
    notificationId: string;
}

/**
 * Response DTO for unread notification count.
 */
export class UnreadCountDto {
    @ApiProperty({ description: 'The number of unread notifications' })
    count: number;

    @ApiProperty({ description: 'The ID of the user' })
    userId: string;
}
