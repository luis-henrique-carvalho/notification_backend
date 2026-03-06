import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from './ws-jwt.guard';
import { RecipientUpdatedEventPayload } from '@app/shared';

interface JwtPayload {
  sub: string | number;
  id?: string | number;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

interface ClientData {
  user: JwtPayload;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error('No token provided');
      }

      const secret = this.configService.get<string>(
        'JWT_SECRET',
        'super-secret',
      );
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      (client.data as ClientData).user = payload;

      const userId = payload.sub; // Or payload.id
      await client.join(`user:${userId}`);

      if (payload.role === 'ADMIN' || payload.role === 'admin') {
        await client.join('room:admins');
        this.logger.log(`Admin client joined room:admins (User: ${userId})`);
      }

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection failed: ${client.id} - ${errorMessage}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('notification:delivered')
  handleNotificationDelivered(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    const clientData = client.data as ClientData;
    const userId = clientData.user.sub || clientData.user.id;
    this.logger.log(`Notification delivered ack from user ${userId}:`, data);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth?.token as string | undefined;
    if (typeof auth === 'string') return auth;
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.substring(7);
    }
    return null;
  }

  emitNotification(userId: string | number, payload: unknown) {
    this.server.to(`user:${userId}`).emit('notification:new', payload);
  }

  emitUnreadCount(userId: string | number, count: number) {
    this.server
      .to(`user:${userId}`)
      .emit('notification:unread_count', { count });
  }

  emitAdminNotificationStatsUpdated(
    notificationId: string,
    readCount: number,
    unreadCount: number,
    recipientCount: number,
  ): void {
    this.logger.log(
      `Emitting admin:notification_stats_updated for notification ${notificationId}`,
    );
    this.server.to('room:admins').emit('admin:notification_stats_updated', {
      notificationId,
      readCount,
      unreadCount,
      recipientCount,
    });
  }

  emitAdminRecipientUpdated(payload: RecipientUpdatedEventPayload): void {
    this.logger.log(
      `Emitting admin:recipient_updated for notification ${payload.notificationId} user ${payload.userId}`,
    );
    this.server.to('room:admins').emit('admin:recipient_updated', payload);
  }
}
