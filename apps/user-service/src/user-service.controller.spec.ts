import { Test, TestingModule } from '@nestjs/testing';
import { UserServiceController } from './user-service.controller';

describe('UserServiceController', () => {
  let controller: UserServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [UserServiceController],
    }).compile();

    controller = app.get<UserServiceController>(UserServiceController);
  });

  describe('healthCheck', () => {
    it('should return health status', () => {
      expect(controller.healthCheck()).toBe('user-service ok');
    });
  });
});
