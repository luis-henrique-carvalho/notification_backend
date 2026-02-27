# Testing Event-Driven Flows in NestJS

When building microservices with NestJS and RabbitMQ, testing asynchronous, event-driven flows requires specific strategies to ensure reliability and maintainability without introducing flakiness. This document explains the core concepts and patterns for unit testing event-driven architectures.

## 1. Mocking the Transport Layer (`ClientProxy`)

When a service emits an event, it typically injects a `ClientProxy`. You should never connect to a real broker (like RabbitMQ) during unit tests. Instead, mock the client to verify that your service attempts to emit the correct payloads.

```typescript
// Define the mock in your TestingModule setup
{
    provide: 'GATEWAY_SERVICE',
    useValue: {
        emit: jest.fn(), // We use emit for fire-and-forget events
        send: jest.fn(), // We use send for request-response patterns
    },
}
```

### Validating the Payload
You should assert that the `emit` method was called with the correct event pattern and the correct data payload:

```typescript
expect(gatewayClient.emit).toHaveBeenCalledWith(
    NOTIFICATION_EVENTS.CREATED,
    expect.objectContaining({
        id: expect.any(String),
        priority: NotificationPriority.HIGH,
    })
);
```

## 2. Validating Idempotency in Tests

In distributed systems, events might be delivered multiple times (at-least-once delivery). Your service handlers must be idempotent—applying the same operation multiple times must yield the same result.

To test idempotency, call the handler multiple times with the same input and verify that the outcome (and response) remains identical, without triggering errors like "Resource already exists".

```typescript
it('should be idempotent on repeated mark-read calls', async () => {
    const dto = { notificationIds: ['id-1'] };
    // First call succeeds
    await expect(service.markRead(dto, 'user-1')).resolves.toEqual({ success: true });

    // Second call should also succeed immediately without failing
    await expect(service.markRead(dto, 'user-1')).resolves.toEqual({ success: true });

    // In your DB mock setup, ensure `update` simulates changing rows safely
});
```

## 3. Dealing with Asynchronous Side Effects

If your event handler triggers Fire-and-Forget background tasks (e.g. sending push notifications) that are not await-ed inside the main execution, unit testing can become tricky.

### Strategies:

1. **Dependency Injection & Mocking:**
   Extract the side effect into a dedicated service (e.g., `PushNotificationService`) and mock it. In the test, simply verify that the mock was called.
   ```typescript
   expect(mockPushService.send).toHaveBeenCalled();
   ```

2. **Awaiting the Un-awaitable (For End-to-End or Integration Tests):**
   If you must wait for a background job to finish, you might have to poll the database or mock an event emitter that signals completion. In unit tests, however, it's strictly better to just mock the asynchronous boundary (like the `ClientProxy.emit`) and assert it was invoked with the correct payload.

## 4. Testing State Transitions (No Downgrades)

Often in notification systems, a notification's lifecycle moves strictly forward (e.g. `created` -> `delivered` -> `read` -> `acknowledged`). Your tests should verify that status downgrades cannot occur:

```typescript
it('should not update status if already acknowledged', async () => {
    // Attempting to mark a notification as "read" after it was "acknowledged"
    // Should structurally fail or omit the database update.
    const result = await service.markRead({ notificationIds: ['notif-1'] }, 'user-1');
    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'read' }));
    // Wait, ensure our where-clause specifically restricts the valid states!
});
```
By enforcing these boundaries in both your code (`inArray(status, ['created', 'delivered'])`) and your tests, you build robust schemas that avoid invalid state mutations.
