import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  NOTIFICATION_PATTERNS,
  SendNotificationResponseDto,
  AdminNotificationSummaryDto,
  AdminNotificationRecipientDto,
} from '@app/shared';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from 'apps/user-service/src/database/schema';
import { firstValueFrom } from 'rxjs';
import { SendNotificationDto } from './send-notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject('NOTIFICATION_CLIENT')
    private readonly notificationClient: ClientProxy,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Send a notification (Admin only)',
    description:
      'Sends a notification to specific users or, when `broadcast` is true, to all registered users.',
  })
  @ApiBody({ type: SendNotificationDto })
  @ApiResponse({
    status: 201,
    description: 'Notification successfully created.',
    type: SendNotificationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request. Validation failed.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  async create(
    @Body() dto: SendNotificationDto,
    @CurrentUser() user: User,
  ): Promise<SendNotificationResponseDto> {
    const userIds = dto.userIds ?? [];

    return firstValueFrom(
      this.notificationClient.send(NOTIFICATION_PATTERNS.CREATE, {
        title: dto.title,
        body: dto.body,
        priority: dto.priority,
        userIds,
        senderId: user.id,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get current user notifications' })
  @ApiResponse({
    status: 200,
    description: 'List of notifications returned successfully.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: User,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.FIND_ALL, {
      userId: user.id,
      page,
      limit,
    });
  }

  @Get('history')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get notification history (Admin only)',
    description:
      'Returns a paginated list of all notifications with summary information.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification history returned successfully.',
    type: [AdminNotificationSummaryDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  findHistory(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.FIND_ALL_ADMIN, {
      page,
      limit,
    });
  }

  @Get(':id/recipients')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get notification recipients (Admin only)',
    description:
      'Returns a list of recipients and their delivery status for a specific notification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recipients returned successfully.',
    type: [AdminNotificationRecipientDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Admin role required.',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found.',
  })
  findRecipients(@Param('id') notificationId: string) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.FIND_RECIPIENTS, {
      notificationId,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  markRead(@Param('id') id: string, @CurrentUser() user: User) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.MARK_READ, {
      notificationId: id,
      userId: user.id,
    });
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read.',
  })
  markAllRead(@CurrentUser() user: User) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.MARK_ALL_READ, {
      userId: user.id,
    });
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a critical notification' })
  @ApiResponse({ status: 200, description: 'Notification acknowledged.' })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  acknowledge(@Param('id') id: string, @CurrentUser() user: User) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.ACKNOWLEDGE, {
      notificationId: id,
      userId: user.id,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count returned successfully.',
  })
  unreadCount(@CurrentUser() user: User) {
    return this.notificationClient.send(NOTIFICATION_PATTERNS.UNREAD_COUNT, {
      userId: user.id,
    });
  }
}
