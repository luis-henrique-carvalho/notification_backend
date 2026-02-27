import { Controller, Get } from '@nestjs/common';

@Controller()
export class UserServiceController {
  @Get()
  healthCheck(): string {
    return 'user-service ok';
  }
}
