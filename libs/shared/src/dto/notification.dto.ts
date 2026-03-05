import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  @ApiProperty({
    description: 'The title of the notification',
    example: 'System Update',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'The body content of the notification',
    example: 'The system will undergo maintenance.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    enum: NotificationPriority,
    default: NotificationPriority.MEDIUM,
    description: 'Priority level of the notification',
  })
  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority = NotificationPriority.MEDIUM;

  @ApiProperty({
    description: 'The IDs of the users the notification will be sent to',
    example: ['d83c4801-4470-4d8e-9c71-f9c18d022b72'],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  userIds: string[];

  @ApiPropertyOptional({
    description: 'Whether this is a broadcast notification sent to all users',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  broadcast?: boolean = false;

  @ApiPropertyOptional({
    description:
      'The ID of the user who sent the notification (system if null)',
    example: 'd83c4801-4470-4d8e-9c71-f9c18d022b72',
  })
  @IsUUID()
  @IsOptional()
  senderId?: string;

  @ApiPropertyOptional({
    description: 'Optional type categorization for the notification',
  })
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

  @ApiProperty({
    enum: NotificationPriority,
    description: 'Priority level of the notification',
  })
  priority: NotificationPriority;

  @ApiProperty({
    description: 'Type categorization for the notification',
    nullable: true,
  })
  type: string | null;

  @ApiProperty({ description: 'Additional metadata payload', nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ description: 'Whether the notification has been read' })
  read: boolean;

  @ApiProperty({
    description: 'Date when the notification was read',
    nullable: true,
  })
  readAt: Date | null;

  @ApiProperty({
    description: 'Whether the notification has been acknowledged',
  })
  acknowledged: boolean;

  @ApiProperty({
    description: 'Date when the notification was acknowledged',
    nullable: true,
  })
  acknowledgedAt: Date | null;

  @ApiProperty({ description: 'Date when the notification was created' })
  createdAt: Date;

  @ApiProperty({
    description: 'The ID of the user the notification belongs to',
  })
  userId: string;
}

/**
 * DTO for marking notifications as read.
 */
export class MarkReadDto {
  @ApiProperty({
    description: 'The ID of the notification to mark as read',
  })
  @IsUUID()
  notificationId: string;
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

/**
 * Response DTO for a send notification operation.
 */
export class SendNotificationResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the created notification template',
  })
  notificationId: string;

  @ApiProperty({
    description: 'The number of recipients the notification was sent to',
  })
  recipientCount: number;

  @ApiProperty({ description: 'Whether this was a broadcast notification' })
  broadcast: boolean;
}

export type NotificationCreatedEventPayload = NotificationResponseDto & {
  unreadCount?: number;
};

export interface NotificationStateEventPayload {
  userId: string;
  unreadCount?: number;
  notificationId: string;
  readCount: number;
  recipientCount: number;
}

/**
 * Event payload emitted when a single notification recipient's status is updated.
 * Emitted as NOTIFICATION_EVENTS.RECIPIENT_UPDATED.
 */
export interface RecipientUpdatedEventPayload {
  notificationId: string;
  userId: string;
  status: string;
  readAt: Date | null;
  acknowledgedAt: Date | null;
}

/**
 * Response DTO for admin notification history list.
 * Aggregates per-notification delivery statistics.
 */
export class AdminNotificationSummaryDto {
  @ApiProperty({ description: 'The unique identifier of the notification' })
  notificationId: string;

  @ApiProperty({ description: 'The title of the notification' })
  title: string;

  @ApiProperty({ description: 'The body content of the notification' })
  body: string;

  @ApiProperty({
    enum: NotificationPriority,
    description: 'Priority level of the notification',
  })
  priority: NotificationPriority;

  @ApiProperty({ description: 'Whether this was a broadcast notification' })
  broadcast: boolean;

  @ApiProperty({
    description:
      'The ID of the sender, or null for system-generated notifications',
    nullable: true,
  })
  senderId: string | null;

  @ApiProperty({ description: 'Total number of recipients' })
  recipientCount: number;

  @ApiProperty({
    description:
      'Number of recipients who read or acknowledged the notification',
  })
  readCount: number;

  @ApiProperty({
    description: 'Number of recipients who have not read the notification',
  })
  unreadCount: number;

  @ApiProperty({ description: 'Date when the notification was created' })
  createdAt: Date;
}

/**
 * Response DTO for a single recipient entry in the admin recipients drill-down.
 */
export class AdminNotificationRecipientDto {
  @ApiProperty({ description: 'The ID of the recipient user' })
  userId: string;

  @ApiProperty({
    description:
      'Delivery status of the notification for this recipient (created, delivered, read, acknowledged)',
  })
  status: string;

  @ApiProperty({
    description: 'Date when the recipient read the notification, or null',
    nullable: true,
  })
  readAt: Date | null;

  @ApiProperty({
    description:
      'Date when the notification was delivered to the recipient, or null',
    nullable: true,
  })
  deliveredAt: Date | null;

  @ApiProperty({
    description:
      'Date when the recipient acknowledged the notification, or null',
    nullable: true,
  })
  acknowledgedAt: Date | null;
}
