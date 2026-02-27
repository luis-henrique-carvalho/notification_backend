import { Test, TestingModule } from '@nestjs/testing';
import { NotificationServiceService } from './notification-service.service';
import * as amqplib from 'amqplib';
import {
  NOTIFICATION_EVENTS,
  USER_EVENTS,
  RABBITMQ_EXCHANGE,
  NotificationType,
  UserRole,
} from '@app/shared';

type PublishCall = [string, string, Buffer];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnvelope<T>(
  eventType: string,
  payload: T,
  correlationId = 'corr-123',
) {
  return {
    eventType,
    correlationId,
    timestamp: new Date().toISOString(),
    source: 'test',
    payload,
  };
}

function makeChannel(): { channel: amqplib.Channel; publishMock: jest.Mock } {
  const publishMock = jest.fn();
  const channel = { publish: publishMock } as unknown as amqplib.Channel;
  return { channel, publishMock };
}

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
};

/** Helper: chainable select that ends with .limit() */
function chainableSelect(result: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function chainableInsert() {
  const chain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([
      {
        id: 'notif-id-1',
        title: 'Test',
        body: 'Body',
        type: 'info',
        senderId: 'sender-1',
        createdAt: new Date('2024-01-01'),
      },
    ]),
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

function chainableUpdate() {
  const chain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([]),
  };
  mockUpdate.mockReturnValue(chain);
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationServiceService', () => {
  let service: NotificationServiceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationServiceService,
        { provide: 'DRIZZLE', useValue: mockDb },
      ],
    }).compile();

    service = module.get<NotificationServiceService>(
      NotificationServiceService,
    );
  });

  // ─── handleCreateNotification ─────────────────────────────────────────────

  describe('handleCreateNotification', () => {
    it('should create notification and publish notification.created', async () => {
      const { channel, publishMock } = makeChannel();
      chainableInsert();

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.CREATE_REQUESTED, {
        title: 'Hello',
        body: 'World',
        type: NotificationType.INFO,
        senderId: 'sender-1',
        recipientIds: ['user-1', 'user-2'],
      });

      await service.handleCreateNotification(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [exchange, routingKey, buffer] = publishMock.mock
        .calls[0] as PublishCall;
      expect(exchange).toBe(RABBITMQ_EXCHANGE);
      expect(routingKey).toBe(NOTIFICATION_EVENTS.CREATED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        correlationId: string;
        payload: { recipientIds: string[]; notification: { id: string } };
      };
      expect(published.correlationId).toBe('corr-123');
      expect(published.payload.recipientIds).toEqual(['user-1', 'user-2']);
      expect(published.payload.notification.id).toBe('notif-id-1');
    });

    it('should publish create.failed when required fields are missing', async () => {
      const { channel, publishMock } = makeChannel();

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.CREATE_REQUESTED, {
        title: '',
        body: '',
        type: NotificationType.INFO,
        senderId: 'sender-1',
        recipientIds: ['user-1'],
      });

      await service.handleCreateNotification(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.CREATE_FAILED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { reason: string };
      };
      expect(published.payload.reason).toContain('Missing required fields');
    });

    it('should publish create.failed when no recipients', async () => {
      const { channel, publishMock } = makeChannel();

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.CREATE_REQUESTED, {
        title: 'Hello',
        body: 'World',
        type: NotificationType.INFO,
        senderId: 'sender-1',
        recipientIds: [],
      });

      await service.handleCreateNotification(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.CREATE_FAILED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { reason: string };
      };
      expect(published.payload.reason).toBe('No recipients specified');
    });

    it('broadcast: should publish user.list.requested and create notification on success', async () => {
      const { channel, publishMock } = makeChannel();
      chainableInsert();

      const envelope = makeEnvelope(
        NOTIFICATION_EVENTS.CREATE_REQUESTED,
        {
          title: 'Broadcast',
          body: 'All',
          type: NotificationType.INFO,
          senderId: 'sender-1',
          broadcast: true,
        },
        'broadcast-corr',
      );

      // Simulate broadcast: schedule the user.list.succeeded response
      const createPromise = service.handleCreateNotification(channel, envelope);

      // After a tick, simulate the user-service response arriving
      await Promise.resolve();
      const userListSucceededEnvelope = makeEnvelope(
        USER_EVENTS.LIST_SUCCEEDED,
        {
          users: [
            {
              id: 'u-1',
              name: 'A',
              email: 'a@x.com',
              role: UserRole.USER,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'u-2',
              name: 'B',
              email: 'b@x.com',
              role: UserRole.USER,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        'broadcast-corr',
      );
      service.handleUserListSucceeded(userListSucceededEnvelope);

      await createPromise;

      // First publish: user.list.requested; second: notification.created
      expect(publishMock).toHaveBeenCalledTimes(2);
      const [, rk1] = publishMock.mock.calls[0] as PublishCall;
      const [, rk2, buf2] = publishMock.mock.calls[1] as PublishCall;
      expect(rk1).toBe(USER_EVENTS.LIST_REQUESTED);
      expect(rk2).toBe(NOTIFICATION_EVENTS.CREATED);
      const created = JSON.parse((buf2 as Buffer).toString()) as {
        payload: { recipientIds: string[] };
      };
      expect(created.payload.recipientIds).toEqual(['u-1', 'u-2']);
    });
  });

  // ─── handleMarkRead ───────────────────────────────────────────────────────

  describe('handleMarkRead', () => {
    it('should mark notification as read and publish notification.read', async () => {
      const { channel, publishMock } = makeChannel();

      // First select returns the recipient record
      chainableSelect([
        {
          id: 'rec-1',
          notificationId: 'notif-1',
          recipientId: 'user-1',
          read: false,
          readAt: null,
          delivered: false,
          deliveredAt: null,
          acknowledged: false,
          acknowledgedAt: null,
        },
      ]);
      chainableUpdate();

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.MARKREAD_REQUESTED, {
        notificationId: 'notif-1',
        userId: 'user-1',
      });

      await service.handleMarkRead(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.READ);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { notificationId: string; userId: string; readAt: string };
      };
      expect(published.payload.notificationId).toBe('notif-1');
      expect(published.payload.userId).toBe('user-1');
      expect(published.payload.readAt).toBeTruthy();
    });

    it('should publish markread.failed when recipient not found', async () => {
      const { channel, publishMock } = makeChannel();

      chainableSelect([]);

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.MARKREAD_REQUESTED, {
        notificationId: 'notif-999',
        userId: 'user-1',
      });

      await service.handleMarkRead(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.MARKREAD_FAILED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { reason: string };
      };
      expect(published.payload.reason).toBe('Recipient record not found');
    });
  });

  // ─── handleAcknowledge ────────────────────────────────────────────────────

  describe('handleAcknowledge', () => {
    it('should acknowledge a critical notification', async () => {
      const { channel, publishMock } = makeChannel();

      // First select: notification (critical)
      const selectChain1 = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          {
            id: 'notif-1',
            title: 'Critical',
            body: 'Important',
            type: 'critical',
            senderId: 's-1',
            createdAt: new Date(),
          },
        ]),
      };
      // Second select: recipient
      const selectChain2 = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue([
            { id: 'rec-1', acknowledged: false, acknowledgedAt: null },
          ]),
      };
      mockSelect
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      chainableUpdate();

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.ACKNOWLEDGE_REQUESTED, {
        notificationId: 'notif-1',
        userId: 'user-1',
      });

      await service.handleAcknowledge(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.ACKNOWLEDGED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { acknowledgedAt: string };
      };
      expect(published.payload.acknowledgedAt).toBeTruthy();
    });

    it('should publish acknowledge.failed when notification is not critical', async () => {
      const { channel, publishMock } = makeChannel();

      const selectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          {
            id: 'notif-2',
            title: 'Info',
            body: 'Normal',
            type: 'info',
            senderId: 's-1',
            createdAt: new Date(),
          },
        ]),
      };
      mockSelect.mockReturnValue(selectChain);

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.ACKNOWLEDGE_REQUESTED, {
        notificationId: 'notif-2',
        userId: 'user-1',
      });

      await service.handleAcknowledge(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.ACKNOWLEDGE_FAILED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { reason: string };
      };
      expect(published.payload.reason).toBe(
        'Only critical notifications can be acknowledged',
      );
    });
  });

  // ─── handleUnreadCount ────────────────────────────────────────────────────

  describe('handleUnreadCount', () => {
    it('should return the count of unread notifications for a user', async () => {
      const { channel, publishMock } = makeChannel();

      const selectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: '3' }]),
      };
      mockSelect.mockReturnValue(selectChain);

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.UNREADCOUNT_REQUESTED, {
        userId: 'user-1',
      });

      await service.handleUnreadCount(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.UNREADCOUNT_SUCCEEDED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { userId: string; count: number };
      };
      expect(published.payload.userId).toBe('user-1');
      expect(published.payload.count).toBe(3);
    });
  });

  // ─── handleHistory ────────────────────────────────────────────────────────

  describe('handleHistory', () => {
    it('should return history with stats', async () => {
      const { channel, publishMock } = makeChannel();

      const notif = {
        id: 'notif-1',
        title: 'T',
        body: 'B',
        type: 'info',
        senderId: 's-1',
        createdAt: new Date(),
      };

      // First call: get all notifications
      const selectAllChain = {
        from: jest.fn().mockResolvedValue([notif]),
        where: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([notif]),
      };
      // Second call: get recipients for the notification
      const selectRecipChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          { delivered: true, read: true, acknowledged: false },
          { delivered: true, read: false, acknowledged: false },
        ]),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      mockSelect
        .mockReturnValueOnce(selectAllChain)
        .mockReturnValueOnce(selectRecipChain);

      const envelope = makeEnvelope(NOTIFICATION_EVENTS.HISTORY_REQUESTED, {
        requestedBy: 'admin-1',
      });

      await service.handleHistory(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(NOTIFICATION_EVENTS.HISTORY_SUCCEEDED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: {
          total: number;
          notifications: Array<{
            deliveredCount: number;
            readCount: number;
            acknowledgedCount: number;
          }>;
        };
      };
      expect(published.payload.total).toBe(1);
      expect(published.payload.notifications[0].deliveredCount).toBe(2);
      expect(published.payload.notifications[0].readCount).toBe(1);
      expect(published.payload.notifications[0].acknowledgedCount).toBe(0);
    });
  });
});
