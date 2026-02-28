import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DrizzleProvider } from './database/drizzle.provider';
import { UserServiceController } from './user-service.controller';
import { UserServiceService } from './user-service.service';

@Module({
    imports: [
        JwtModule.register({
            secret:
                process.env.JWT_SECRET ?? 'default-secret-change-in-production',
            signOptions: {
                expiresIn: (process.env.JWT_EXPIRATION ?? '24h') as any,
            },
        }),
    ],
    controllers: [UserServiceController],
    providers: [DrizzleProvider, UserServiceService],
})
export class UserServiceModule {}
