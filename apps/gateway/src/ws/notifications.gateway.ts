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
            const payload = await this.jwtService.verifyAsync(token, {
                secret,
            });

            client.data.user = payload;

            const userId = payload.sub; // Or payload.id
            client.join(`user:${userId}`);

            this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
        } catch (error: any) {
            this.logger.error(
                `Connection failed: ${client.id} - ${error.message}`,
            );
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @UseGuards(WsJwtGuard)
    @SubscribeMessage('notification:delivered')
    handleNotificationDelivered(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket,
    ) {
        const userId = client.data.user.sub || client.data.user.id;
        this.logger.log(
            `Notification delivered ack from user ${userId}:`,
            data,
        );
    }

    private extractToken(client: Socket): string | null {
        const auth = client.handshake.auth?.token;
        if (auth) return auth;
        const header = client.handshake.headers.authorization;
        if (header && header.startsWith('Bearer ')) {
            return header.substring(7);
        }
        return null;
    }

    emitNotification(userId: string | number, payload: any) {
        this.server.to(`user:${userId}`).emit('notification:new', payload);
    }

    emitUnreadCount(userId: string | number, count: number) {
        this.server
            .to(`user:${userId}`)
            .emit('notification:unread_count', { count });
    }
}
