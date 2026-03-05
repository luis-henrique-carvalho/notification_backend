import {
  NotificationStateEventPayload,
  RecipientUpdatedEventPayload,
} from './notification.dto';

// Task 1.3 — Type-level tests for NotificationStateEventPayload
describe('NotificationStateEventPayload', () => {
  it('should accept an object with notificationId, readCount and recipientCount', () => {
    const payload: NotificationStateEventPayload = {
      userId: 'user-1',
      notificationId: 'notification-1',
      readCount: 3,
      recipientCount: 5,
    };
    expect(payload.notificationId).toBe('notification-1');
    expect(payload.readCount).toBe(3);
    expect(payload.recipientCount).toBe(5);
  });

  it('should have notificationId as a string', () => {
    const payload: NotificationStateEventPayload = {
      userId: 'user-1',
      notificationId: 'abc-123',
      readCount: 0,
      recipientCount: 1,
    };
    expect(typeof payload.notificationId).toBe('string');
  });

  it('should have readCount as a number', () => {
    const payload: NotificationStateEventPayload = {
      userId: 'user-1',
      notificationId: 'abc-123',
      readCount: 2,
      recipientCount: 4,
    };
    expect(typeof payload.readCount).toBe('number');
  });

  it('should have recipientCount as a number', () => {
    const payload: NotificationStateEventPayload = {
      userId: 'user-1',
      notificationId: 'abc-123',
      readCount: 1,
      recipientCount: 10,
    };
    expect(typeof payload.recipientCount).toBe('number');
  });
});

// Task 1.5 — Type-level tests for RecipientUpdatedEventPayload
describe('RecipientUpdatedEventPayload', () => {
  it('should accept a full valid payload', () => {
    const payload: RecipientUpdatedEventPayload = {
      notificationId: 'notification-1',
      userId: 'user-1',
      status: 'read',
      readAt: new Date(),
      acknowledgedAt: null,
    };
    expect(payload.notificationId).toBe('notification-1');
    expect(payload.userId).toBe('user-1');
    expect(payload.status).toBe('read');
    expect(payload.readAt).toBeInstanceOf(Date);
    expect(payload.acknowledgedAt).toBeNull();
  });

  it('should allow null for readAt and acknowledgedAt', () => {
    const payload: RecipientUpdatedEventPayload = {
      notificationId: 'notification-2',
      userId: 'user-2',
      status: 'acknowledged',
      readAt: null,
      acknowledgedAt: new Date(),
    };
    expect(payload.readAt).toBeNull();
    expect(payload.acknowledgedAt).toBeInstanceOf(Date);
  });
});
