import { Module } from '@nestjs/common';
import { UserServiceController } from './user-service.controller';
import { UserServiceService } from './user-service.service';
import { DatabaseModule } from '@app/shared';
import { userServiceSchema } from './database';

@Module({
  imports: [DatabaseModule.forFeature({ schema: userServiceSchema })],
  controllers: [UserServiceController],
  providers: [UserServiceService],
})
export class UserServiceModule {}
