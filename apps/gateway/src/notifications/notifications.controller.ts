import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NOTIFICATION_PATTERNS, CreateNotificationDto, NotificationPriority } from '@app/shared';
import { Role, Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
    constructor(
        @Inject('NOTIFICATION_CLIENT') private readonly notificationClient: ClientProxy,
    ) { }

    @Post()
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Create a new notification (Admin only)' })
    create(@Body() dto: CreateNotificationDto, @CurrentUser() user: any) {
        return this.notificationClient.send(NOTIFICATION_PATTERNS.CREATE, {
            ...dto,
            senderId: user.id,
        });
    }

    @Get()
    @ApiOperation({ summary: 'Get current user notifications' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
    ) {
        return this.notificationClient.send(NOTIFICATION_PATTERNS.FIND_ALL, {
            userId: user.id,
            page,
            limit,
        });
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Mark a notification as read' })
    markRead(@Param('id') id: string, @CurrentUser() user: any) {
        return this.notificationClient.send(NOTIFICATION_PATTERNS.MARK_READ, {
            notificationId: id,
            userId: user.id,
        });
    }

    @Patch('read-all')
    @ApiOperation({ summary: 'Mark all notifications as read' })
    markAllRead(@CurrentUser() user: any) {
        return this.notificationClient.send(NOTIFICATION_PATTERNS.MARK_ALL_READ, {
            userId: user.id,
        });
    }

    @Post(':id/acknowledge')
    @ApiOperation({ summary: 'Acknowledge a critical notification' })
    acknowledge(@Param('id') id: string, @CurrentUser() user: any) {
        return this.notificationClient.send(NOTIFICATION_PATTERNS.ACKNOWLEDGE, {
            notificationId: id,
            userId: user.id,
        });
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Get unread notification count' })
    unreadCount(@CurrentUser() user: any) {
        return this.notificationClient.send(NOTIFICATION_PATTERNS.UNREAD_COUNT, {
            userId: user.id,
        });
    }
}
