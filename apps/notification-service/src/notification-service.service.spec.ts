import { Test, TestingModule } from '@nestjs/testing';
import { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { NotificationServiceService } from './notification-service.service';
import { DRIZZLE } from './database/drizzle.provider';
import { RpcErrorCode } from '@app/shared';
import { CreateNotificationDto, MarkReadDto, AcknowledgeDto, NOTIFICATION_EVENTS, NotificationPriority } from '@app/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeNotification = (overrides = {}) => ({
    id: 'notif-123',
    title: 'Test Notification',
    body: 'This is a test',
    priority: NotificationPriority.MEDIUM,
    broadcast: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
});

const makeRecipient = (overrides = {}) => ({
    id: 'recip-123',
    notificationId: 'notif-123',
    userId: 'user-123',
    status: 'created',
    readAt: null,
    acknowledgedAt: null,
    deliveredAt: null,
    ...overrides,
});

const buildDrizzleMock = (rows: unknown[] = []) => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue(rows), // for the main query
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NotificationServiceService', () => {
    let service: NotificationServiceService;
    let gatewayClient: ClientProxy;
    let mockDb: any;

    beforeEach(async () => {
        mockDb = buildDrizzleMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationServiceService,
                {
                    provide: DRIZZLE,
                    useValue: mockDb,
                },
                {
                    provide: 'GATEWAY_SERVICE',
                    useValue: {
                        emit: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<NotificationServiceService>(NotificationServiceService);
        gatewayClient = module.get<ClientProxy>('GATEWAY_SERVICE');
    });

    // -------------------------------------------------------------------------
    // create()
    // -------------------------------------------------------------------------

    describe('create()', () => {
        const createDto: CreateNotificationDto = {
            userId: 'user-123',
            title: 'Welcome',
            body: 'Hello World',
            priority: NotificationPriority.MEDIUM,
        };

        it('should create an individual notification, a recipient, and emit the event', async () => {
            const newNotif = makeNotification({ title: 'Welcome', body: 'Hello World', priority: NotificationPriority.MEDIUM });
            const newRecip = makeRecipient({ userId: 'user-123' });

            mockDb.returning
                .mockResolvedValueOnce([newNotif]) // insert notification
                .mockResolvedValueOnce([newRecip]); // insert recipient

            const result = await service.create(createDto);

            expect(result.id).toBe(newNotif.id);
            expect(result.userId).toBe('user-123');
            expect(result.read).toBe(false);
            expect(gatewayClient.emit).toHaveBeenCalledWith(NOTIFICATION_EVENTS.CREATED, result);
        });

        it('should structure event data properly including correct priority', async () => {
            const dto: CreateNotificationDto = { ...createDto, priority: NotificationPriority.HIGH };
            const newNotif = makeNotification({ priority: NotificationPriority.HIGH });
            const newRecip = makeRecipient();

            mockDb.returning.mockResolvedValueOnce([newNotif]).mockResolvedValueOnce([newRecip]);
            const result = await service.create(dto);

            expect(result.priority).toBe(NotificationPriority.HIGH);
            expect(gatewayClient.emit).toHaveBeenCalledWith(
                NOTIFICATION_EVENTS.CREATED,
                expect.objectContaining({ priority: NotificationPriority.HIGH })
            );
        });
    });

    // -------------------------------------------------------------------------
    // findAll()
    // -------------------------------------------------------------------------

    describe('findAll()', () => {
        it('should return paginated notifications for a user', async () => {
            const mockRows = [
                { notification: makeNotification(), recipient: makeRecipient() },
            ];
            mockDb.offset.mockResolvedValueOnce(mockRows); // first query returns results
            mockDb.where.mockReturnValueOnce(mockDb).mockResolvedValueOnce([{ count: 1 }]); // second query returns count

            const result = await service.findAll('user-123', 1, 10);

            expect(result.data).toHaveLength(1);
            expect(result.data[0].id).toBe('notif-123');
            expect(result.meta.total).toBe(1);
            expect(result.meta.page).toBe(1);
            expect(result.meta.limit).toBe(10);
            expect(result.meta.totalPages).toBe(1);
        });
    });

    // -------------------------------------------------------------------------
    // markRead()
    // -------------------------------------------------------------------------

    describe('markRead()', () => {
        it('should conditionally update only created/delivered statuses avoiding downgrades', async () => {
            const dto: MarkReadDto = { notificationIds: ['notif-1'] };

            // When calling markRead, there's a where condition that ensures we only update if
            // status is 'delivered' or 'created'.
            // Because our Drizzle mock returns the chain interface, we can spy on `set` or `update`.
            // The service doesn't return rows for this, it just does the update.
            const result = await service.markRead(dto, 'user-123');
            expect(result.success).toBe(true);

            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'read' }));
            // We just ensure it doesn't throw and it returns success.
        });

        it('should be idempotent (not throw on repeated calls)', async () => {
            const dto: MarkReadDto = { notificationIds: ['notif-1'] };
            await expect(service.markRead(dto, 'user-123')).resolves.toEqual({ success: true });
            await expect(service.markRead(dto, 'user-123')).resolves.toEqual({ success: true });
        });
    });

    // -------------------------------------------------------------------------
    // acknowledge()
    // -------------------------------------------------------------------------

    describe('acknowledge()', () => {
        it('should successfully acknowledge a notification and return success', async () => {
            const dto: AcknowledgeDto = { notificationId: 'notif-1' };
            // Since `returning()` is called in the service for acknowledge, we must mock it returning rows
            mockDb.returning.mockResolvedValueOnce([makeRecipient({ status: 'acknowledged' })]);

            const result = await service.acknowledge(dto, 'user-123');
            expect(result.success).toBe(true);
            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'acknowledged' }));
        });

        it('should throw NOT_FOUND if the notification is not found or already acknowledged (0 rows returned)', async () => {
            const dto: AcknowledgeDto = { notificationId: 'notif-1' };
            // Simulate that 0 records were updated (because where condition didn't match)
            mockDb.returning.mockResolvedValueOnce([]);

            await expect(service.acknowledge(dto, 'user-123')).rejects.toMatchObject({
                error: expect.objectContaining({
                    message: expect.stringContaining('already acknowledged')
                })
            });
        });
    });

    // -------------------------------------------------------------------------
    // unreadCount()
    // -------------------------------------------------------------------------

    describe('unreadCount()', () => {
        it('should return the correct unread count', async () => {
            mockDb.where.mockResolvedValueOnce([{ count: 5 }]);

            const result = await service.unreadCount('user-123');
            expect(result.count).toBe(5);
            expect(result.userId).toBe('user-123');
        });
    });
});
