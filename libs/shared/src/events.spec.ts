import { NOTIFICATION_EVENTS } from './events';

describe('NOTIFICATION_EVENTS', () => {
  it('should have CREATED event', () => {
    expect(NOTIFICATION_EVENTS.CREATED).toBe('notification.created');
  });

  it('should have DELIVERED event', () => {
    expect(NOTIFICATION_EVENTS.DELIVERED).toBe('notification.delivered');
  });

  it('should have MARKED_READ event', () => {
    expect(NOTIFICATION_EVENTS.MARKED_READ).toBe('notification.marked_read');
  });

  // Task 1.1 — verify RECIPIENT_UPDATED exists
  it('should have RECIPIENT_UPDATED event', () => {
    expect(NOTIFICATION_EVENTS.RECIPIENT_UPDATED).toBeDefined();
  });

  it('should have RECIPIENT_UPDATED equal to "notification.recipient_updated"', () => {
    expect(NOTIFICATION_EVENTS.RECIPIENT_UPDATED).toBe(
      'notification.recipient_updated',
    );
  });
});
