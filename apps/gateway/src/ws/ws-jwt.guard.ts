import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WsJwtGuard implements CanActivate {
    private readonly logger = new Logger(WsJwtGuard.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const client: Socket = context.switchToWs().getClient<Socket>();
            const token = this.extractTokenFromSocket(client);
            if (!token) {
                throw new WsException('Unauthorized');
            }

            const secret = this.configService.get<string>('JWT_SECRET', 'super-secret');
            const payload = await this.jwtService.verifyAsync(token, { secret });

            client.data.user = payload;
            return true;
        } catch (err) {
            this.logger.error('WebSocket Authentication error', err);
            throw new WsException('Unauthorized');
        }
    }

    private extractTokenFromSocket(client: Socket): string | null {
        const auth = client.handshake.auth?.token;
        if (auth) {
            return auth;
        }
        const header = client.handshake.headers.authorization;
        if (header && header.split(' ')[0] === 'Bearer') {
            return header.split(' ')[1];
        }
        return null;
    }
}
