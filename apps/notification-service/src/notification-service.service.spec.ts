import { Test, TestingModule } from '@nestjs/testing';
import { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { NotificationServiceService } from './notification-service.service';
import { DRIZZLE } from './database/drizzle.provider';
import { NotificationPriority } from '@app/shared';

// Type definitions for test data
interface NotificationWithStats {
  id: string;
  title: string;
  body: string;
  priority: string;
  broadcast: boolean;
  senderId: string | null;
  createdAt: Date;
  recipientCount: number;
  readCount: number;
}

interface NotificationListResponse {
  data: Array<{
    notificationId: string;
    title: string;
    body: string;
    priority: NotificationPriority;
    broadcast: boolean;
    senderId: string | null;
    recipientCount: number;
    readCount: number;
    unreadCount: number;
    createdAt: Date;
  }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface NotificationRecipient {
  userId: string;
  status: string;
  readAt: Date | null;
  deliveredAt: Date | null;
  acknowledgedAt: Date | null;
}

interface ServiceWithPrivateMethods extends NotificationServiceService {
  findAllNotifications(
    page: number,
    limit: number,
  ): Promise<NotificationListResponse>;
  findNotificationRecipients(
    notificationId: string,
  ): Promise<NotificationRecipient[]>;
}

interface MockDbChain {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  groupBy: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  execute: jest.Mock;
}

describe('NotificationServiceService', () => {
  let service: ServiceWithPrivateMethods;
  let mockDb: MockDbChain;
  let mockGatewayClient: Partial<ClientProxy>;

  beforeEach(async () => {
    // Mock DrizzleDB with select, from, where, etc.
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    // Mock ClientProxy
    mockGatewayClient = {
      emit: jest.fn(),
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationServiceService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
        {
          provide: 'GATEWAY_SERVICE',
          useValue: mockGatewayClient,
        },
      ],
    }).compile();

    service = module.get<ServiceWithPrivateMethods>(NotificationServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllNotifications', () => {
    it('should return paginated list with recipientCount, readCount, unreadCount correct', async () => {
      // Arrange: Mock fixed rows from Drizzle
      const mockNotifications: NotificationWithStats[] = [
        {
          id: 'notification-1',
          title: 'Test Notification 1',
          body: 'Test Body 1',
          priority: 'medium',
          broadcast: false,
          senderId: 'sender-1',
          createdAt: new Date('2024-01-01'),
          recipientCount: 5,
          readCount: 3,
        },
        {
          id: 'notification-2',
          title: 'Test Notification 2',
          body: 'Test Body 2',
          priority: 'medium',
          broadcast: true,
          senderId: null,
          createdAt: new Date('2024-01-02'),
          recipientCount: 10,
          readCount: 7,
        },
      ];

      const mockCountResult = [{ count: 2 }];

      // Mock the query chain - notifications query returns on first await
      mockDb.limit.mockReturnValueOnce({
        offset: jest.fn().mockResolvedValueOnce(mockNotifications),
      });

      // Mock count query returns on second select().from() chain
      mockDb.select.mockReturnValueOnce(mockDb).mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce(mockCountResult),
      });

      // Act
      const result = await service.findAllNotifications(1, 20);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        notificationId: 'notification-1',
        title: 'Test Notification 1',
        body: 'Test Body 1',
        priority: NotificationPriority.MEDIUM,
        broadcast: false,
        senderId: 'sender-1',
        recipientCount: 5,
        readCount: 3,
        unreadCount: 2, // recipientCount - readCount
        createdAt: expect.any(Date) as Date,
      });
      expect(result.data[1]).toMatchObject({
        notificationId: 'notification-2',
        title: 'Test Notification 2',
        body: 'Test Body 2',
        priority: NotificationPriority.MEDIUM,
        broadcast: true,
        senderId: null,
        recipientCount: 10,
        readCount: 7,
        unreadCount: 3,
        createdAt: expect.any(Date) as Date,
      });
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should return empty data and total 0 when there are no notifications', async () => {
      // Arrange
      const mockEmptyNotifications: NotificationWithStats[] = [];
      const mockCountResult = [{ count: 0 }];

      // Mock the query chain - notifications query returns on first await
      mockDb.limit.mockReturnValueOnce({
        offset: jest.fn().mockResolvedValueOnce(mockEmptyNotifications),
      });

      // Mock count query returns on second select().from() chain
      mockDb.select.mockReturnValueOnce(mockDb).mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce(mockCountResult),
      });

      // Act
      const result = await service.findAllNotifications(1, 20);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('should apply correct offset for page 2 (offset = (page-1) * limit)', async () => {
      // Arrange
      const mockNotifications: NotificationWithStats[] = [
        {
          id: 'notification-3',
          title: 'Page 2 Notification',
          body: 'Page 2 Body',
          priority: 'medium',
          broadcast: false,
          senderId: 'sender-3',
          createdAt: new Date('2024-01-03'),
          recipientCount: 3,
          readCount: 1,
        },
      ];
      const mockCountResult = [{ count: 25 }];

      const page = 2;
      const limit = 10;

      // Mock offset as a spy to verify it was called
      const offsetSpy = jest.fn().mockResolvedValueOnce(mockNotifications);
      mockDb.limit.mockReturnValueOnce({ offset: offsetSpy });

      // Mock count query
      mockDb.select.mockReturnValueOnce(mockDb).mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce(mockCountResult),
      });

      // Act
      await service.findAllNotifications(page, limit);

      // Assert: Verify offset was called with correct value
      expect(offsetSpy).toHaveBeenCalledWith((page - 1) * limit); // (2-1) * 10 = 10
      expect(mockDb.limit).toHaveBeenCalledWith(limit);
    });
  });

  describe('findNotificationRecipients', () => {
    it('should return array of recipients for valid notificationId', async () => {
      // Arrange
      const notificationId = 'notification-1';
      const mockRecipients: NotificationRecipient[] = [
        {
          userId: 'user-1',
          status: 'read',
          readAt: new Date('2024-01-01T10:00:00Z'),
          deliveredAt: new Date('2024-01-01T09:00:00Z'),
          acknowledgedAt: null,
        },
        {
          userId: 'user-2',
          status: 'acknowledged',
          readAt: new Date('2024-01-01T11:00:00Z'),
          deliveredAt: new Date('2024-01-01T09:00:00Z'),
          acknowledgedAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          userId: 'user-3',
          status: 'created',
          readAt: null,
          deliveredAt: null,
          acknowledgedAt: null,
        },
      ];

      // Mock notification exists check
      const mockNotificationExists = [{ id: notificationId }];

      // First query: check notification exists (select().from().where().limit())
      mockDb.where.mockReturnValueOnce({
        limit: jest.fn().mockResolvedValueOnce(mockNotificationExists),
      });

      // Second query: get recipients (select().from().where())
      mockDb.select.mockReturnValueOnce(mockDb).mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce(mockRecipients),
        }),
      });

      // Act
      const result = await service.findNotificationRecipients(notificationId);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        userId: 'user-1',
        status: 'read',
        readAt: expect.any(Date) as Date,
        deliveredAt: expect.any(Date) as Date,
        acknowledgedAt: null,
      });
      expect(result[1]).toMatchObject({
        userId: 'user-2',
        status: 'acknowledged',
        readAt: expect.any(Date) as Date,
        deliveredAt: expect.any(Date) as Date,
        acknowledgedAt: expect.any(Date) as Date,
      });
      expect(result[2]).toMatchObject({
        userId: 'user-3',
        status: 'created',
        readAt: null,
        deliveredAt: null,
        acknowledgedAt: null,
      });
    });

    it('should throw RpcException with status 404 for nonexistent notificationId', async () => {
      // Arrange
      const notificationId = 'nonexistent-notification';

      // Mock notification does not exist
      const mockNotificationNotFound: Array<{ id: string }> = [];
      mockDb.limit.mockReturnValueOnce(mockNotificationNotFound);

      // Act & Assert
      await expect(
        service.findNotificationRecipients(notificationId),
      ).rejects.toThrow(RpcException);

      // Optionally check the error details
      try {
        await service.findNotificationRecipients(notificationId);
      } catch (error) {
        expect(error).toBeInstanceOf(RpcException);
        if (error instanceof RpcException) {
          const errorObj = error.getError();
          expect(errorObj).toMatchObject({
            code: 'NOT_FOUND',
            message: 'Notification not found',
          });
        }
      }
    });

    it('should return empty array for notification without recipients', async () => {
      // Arrange
      const notificationId = 'notification-no-recipients';

      // Mock notification exists but has no recipients
      const mockNotificationExists = [{ id: notificationId }];
      const mockNoRecipients: NotificationRecipient[] = [];

      // First query: check notification exists (select().from().where().limit())
      mockDb.where.mockReturnValueOnce({
        limit: jest.fn().mockResolvedValueOnce(mockNotificationExists),
      });

      // Second query: get recipients (empty) (select().from().where())
      mockDb.select.mockReturnValueOnce(mockDb).mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce(mockNoRecipients),
        }),
      });

      // Act
      const result = await service.findNotificationRecipients(notificationId);

      // Assert
      expect(result).toBeDefined();
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });
});
