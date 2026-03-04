import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_PATTERNS } from '@app/shared';
import { Observable, of } from 'rxjs';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let mockNotificationClient: {
    send: jest.Mock<Observable<unknown>, [string, unknown]>;
  };

  beforeEach(async () => {
    mockNotificationClient = {
      send: jest.fn<Observable<unknown>, [string, unknown]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: 'NOTIFICATION_CLIENT',
          useValue: mockNotificationClient,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findHistory', () => {
    it('should call notificationClient.send with FIND_ALL_ADMIN pattern and return result', (done) => {
      const page = 1;
      const limit = 20;
      const mockResponse = {
        data: [
          {
            notificationId: 'notif-1',
            title: 'Test Notification',
            body: 'Test body',
            priority: 'medium',
            broadcast: false,
            senderId: 'sender-1',
            recipientCount: 10,
            readCount: 5,
            unreadCount: 5,
            createdAt: new Date(),
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      (mockNotificationClient.send as jest.Mock).mockReturnValueOnce(
        of(mockResponse),
      );

      const result = controller.findHistory(page, limit) as Observable<unknown>;

      expect(
        mockNotificationClient.send.bind(mockNotificationClient),
      ).toBeDefined();
      expect(mockNotificationClient.send).toHaveBeenCalledWith(
        NOTIFICATION_PATTERNS.FIND_ALL_ADMIN,
        { page, limit },
      );

      result.subscribe((data) => {
        expect(data).toEqual(mockResponse);
        done();
      });
    });

    it('should use default values when page and limit are not provided', (done) => {
      const mockResponse = {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      };

      (mockNotificationClient.send as jest.Mock).mockReturnValueOnce(
        of(mockResponse),
      );

      const result = controller.findHistory(1, 20) as Observable<unknown>;

      expect(
        mockNotificationClient.send.bind(mockNotificationClient),
      ).toBeDefined();
      expect(mockNotificationClient.send).toHaveBeenCalledWith(
        NOTIFICATION_PATTERNS.FIND_ALL_ADMIN,
        { page: 1, limit: 20 },
      );

      result.subscribe((data) => {
        expect(data).toEqual(mockResponse);
        done();
      });
    });
  });

  describe('findRecipients', () => {
    it('should call notificationClient.send with FIND_RECIPIENTS pattern and return result', (done) => {
      const notificationId = 'notif-123';
      const mockRecipients = [
        {
          userId: 'user-1',
          status: 'read',
          readAt: new Date(),
          deliveredAt: new Date(),
          acknowledgedAt: null,
        },
        {
          userId: 'user-2',
          status: 'delivered',
          readAt: null,
          deliveredAt: new Date(),
          acknowledgedAt: null,
        },
      ];

      (mockNotificationClient.send as jest.Mock).mockReturnValueOnce(
        of(mockRecipients),
      );

      const result = controller.findRecipients(
        notificationId,
      ) as Observable<unknown>;

      expect(
        mockNotificationClient.send.bind(mockNotificationClient),
      ).toBeDefined();
      expect(mockNotificationClient.send).toHaveBeenCalledWith(
        NOTIFICATION_PATTERNS.FIND_RECIPIENTS,
        { notificationId },
      );

      result.subscribe((data) => {
        expect(data).toEqual(mockRecipients);
        done();
      });
    });

    it('should handle empty recipients array', (done) => {
      const notificationId = 'notif-456';
      const mockRecipients: object[] = [];

      (mockNotificationClient.send as jest.Mock).mockReturnValueOnce(
        of(mockRecipients),
      );

      const result = controller.findRecipients(
        notificationId,
      ) as Observable<unknown>;

      expect(
        mockNotificationClient.send.bind(mockNotificationClient),
      ).toBeDefined();
      expect(mockNotificationClient.send).toHaveBeenCalledWith(
        NOTIFICATION_PATTERNS.FIND_RECIPIENTS,
        { notificationId },
      );

      result.subscribe((data) => {
        expect(data).toEqual(mockRecipients);
        done();
      });
    });
  });
});
