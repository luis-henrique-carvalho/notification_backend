import { Test, TestingModule } from '@nestjs/testing';
import { NotificationEventsController } from './notification-events.controller';
import { NotificationsGateway } from '../ws/notifications.gateway';
import {
  NotificationStateEventPayload,
  RecipientUpdatedEventPayload,
} from '@app/shared';

describe('NotificationEventsController', () => {
  let controller: NotificationEventsController;
  let mockGateway: {
    emitNotification: jest.Mock;
    emitUnreadCount: jest.Mock;
    emitAdminNotificationStatsUpdated: jest.Mock;
    emitAdminRecipientUpdated: jest.Mock;
  };

  beforeEach(async () => {
    mockGateway = {
      emitNotification: jest.fn(),
      emitUnreadCount: jest.fn(),
      emitAdminNotificationStatsUpdated: jest.fn(),
      emitAdminRecipientUpdated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationEventsController],
      providers: [{ provide: NotificationsGateway, useValue: mockGateway }],
    }).compile();

    controller = module.get<NotificationEventsController>(
      NotificationEventsController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleNotificationMarkedRead', () => {
    it('should call emitAdminNotificationStatsUpdated with correct fields from enriched payload', () => {
      const payload: NotificationStateEventPayload = {
        userId: 'user-1',
        unreadCount: 2,
        notificationId: 'notif-abc',
        readCount: 7,
        recipientCount: 10,
      };

      controller.handleNotificationMarkedRead(payload);

      expect(
        mockGateway.emitAdminNotificationStatsUpdated,
      ).toHaveBeenCalledWith('notif-abc', 7, 2, 10);
    });

    it('should still call emitUnreadCount with userId and count', () => {
      const payload: NotificationStateEventPayload = {
        userId: 'user-1',
        unreadCount: 4,
        notificationId: 'notif-abc',
        readCount: 3,
        recipientCount: 7,
      };

      controller.handleNotificationMarkedRead(payload);

      expect(mockGateway.emitUnreadCount).toHaveBeenCalledWith('user-1', 4);
    });

    it('should not call emitUnreadCount when unreadCount is undefined', () => {
      const payload: NotificationStateEventPayload = {
        userId: 'user-2',
        notificationId: 'notif-def',
        readCount: 1,
        recipientCount: 3,
      };

      controller.handleNotificationMarkedRead(payload);

      expect(mockGateway.emitUnreadCount).not.toHaveBeenCalled();
    });
  });

  describe('handleRecipientUpdated', () => {
    it('should call emitAdminRecipientUpdated with the received payload', () => {
      const payload: RecipientUpdatedEventPayload = {
        notificationId: 'notif-xyz',
        userId: 'user-99',
        status: 'read',
        readAt: new Date('2026-03-05T12:00:00Z'),
        acknowledgedAt: null,
      };

      controller.handleRecipientUpdated(payload);

      expect(mockGateway.emitAdminRecipientUpdated).toHaveBeenCalledWith(
        payload,
      );
    });
  });
});
