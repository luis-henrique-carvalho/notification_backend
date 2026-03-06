import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from './notifications.gateway';
import { RecipientUpdatedEventPayload } from '@app/shared';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let mockServer: {
    to: jest.Mock;
  };
  let mockRoom: {
    emit: jest.Mock;
  };

  beforeEach(async () => {
    mockRoom = { emit: jest.fn() };
    mockServer = { to: jest.fn().mockReturnValue(mockRoom) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    // Inject mock server
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('emitAdminNotificationStatsUpdated', () => {
    it('should emit admin:notification_stats_updated to room:admins with notificationId, readCount, unreadCount, recipientCount', () => {
      const notificationId = 'notif-123';
      const readCount = 5;
      const unreadCount = 3;
      const recipientCount = 8;

      gateway.emitAdminNotificationStatsUpdated(
        notificationId,
        readCount,
        unreadCount,
        recipientCount,
      );

      expect(mockServer.to).toHaveBeenCalledWith('room:admins');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'admin:notification_stats_updated',
        { notificationId, readCount, unreadCount, recipientCount },
      );
    });
  });

  describe('emitAdminRecipientUpdated', () => {
    it('should emit admin:recipient_updated to room:admins with complete payload', () => {
      const payload: RecipientUpdatedEventPayload = {
        notificationId: 'notif-456',
        userId: 'user-789',
        status: 'read',
        readAt: new Date('2026-03-05T10:00:00Z'),
        acknowledgedAt: null,
      };

      gateway.emitAdminRecipientUpdated(payload);

      expect(mockServer.to).toHaveBeenCalledWith('room:admins');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'admin:recipient_updated',
        payload,
      );
    });
  });
});
