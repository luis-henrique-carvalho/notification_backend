# WebSocket & Real-Time Delivery

This documentation explains how real-time notification delivery is implemented using WebSocket with `Socket.IO` in NestJS.

## WebSocket with Socket.IO in NestJS
NestJS provides the `@nestjs/websockets` module to implement WebSockets effortlessly. We are using the `@nestjs/platform-socket.io` adapter, which allows us to write scalable real-time applications.

In `NotificationsGateway`, we define a WebSocket server using the `@WebSocketGateway()` decorator. It listens to WebSocket connections from clients (like our React frontend or mobile app).

## Bridging RabbitMQ and WebSockets
The Gateway acts as an API proxy and also as the real-time bridge.
1. The **Notification Service** emits domain events (e.g., `notification.created`, `notification.marked_read`) to **RabbitMQ**.
2. The Gateway’s `NotificationEventsController` listens to these events using `@EventPattern()`.
3. Inside the controller, we inject the `NotificationsGateway`. When a RabbitMQ event is consumed, it translates to a `socket.emit()` call.
4. The payload is sent to connected client(s) via WebSocket.

## Rooms for Targeted Messaging
In `handleConnection`, when a user connects via WebSocket and provides a valid JWT token, they are placed in a specific "room" unique to their `userId` using `client.join('user:' + userId)`.

Rooms are a native feature of Socket.IO. When the Gateway needs to broadcast a message (e.g., a new notification delivery), we emit the event exactly to that room:
`this.server.to('user:' + userId).emit('notification:new', payload)`

This ensures the user only receives their own notifications, without broadcasting global traffic to all connected clients.

## Authentication
WebSockets are authenticated via JSON Web Tokens (JWT).
1. **Initial Connection Setup:** In `handleConnection`, we manually validate the token (from `handshake.auth.token` or `headers.authorization`) using `JwtService`. If invalid, the connection is instantly closed.
2. **Subsequent Events:** Incoming messages from clients using `@SubscribeMessage()` are protected with the `@UseGuards(WsJwtGuard)` decorator, ensuring every request has a validated user object attached via the Guard.

## The Complete Flow
1. **Microservice Emits Event**: The `NotificationService` processes a request (like creating a notification) and runs `this.client.emit('notification.created', payload)`.
2. **Messaging Queue Transports**: **RabbitMQ** queues and transports the message robustly.
3. **Gateway Consumes**: `NotificationEventsController` in the Gateway picks up the message using `@EventPattern()`.
4. **Gateway Relays via WS**: The controller calls `NotificationsGateway.emitNotification(...)`.
5. **Client Receives & Updates**: The `NotificationsGateway` emits `notification:new` or `notification:unread_count` specifically to the user's room. Finally, the client UI updates the notification bell badge count and pops an alert.
