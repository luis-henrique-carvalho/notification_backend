import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserResponseDto } from '@app/shared';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserResponseDto => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: UserResponseDto }>();

    return request.user;
  },
);
