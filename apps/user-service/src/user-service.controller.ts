import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  USER_PATTERNS,
  UserResponseDto,
} from '@app/shared';
import { UserServiceService } from './user-service.service';

@Controller()
export class UserServiceController {
  constructor(private readonly userService: UserServiceService) {}

  /**
   * Handles user.register messages from the Gateway.
   * Creates a new user and returns a JWT + user data.
   */
  @MessagePattern(USER_PATTERNS.REGISTER)
  async register(@Payload() dto: RegisterDto): Promise<LoginResponseDto> {
    console.log('register', dto);
    return await this.userService.register(dto);
  }

  /**
   * Handles user.login messages from the Gateway.
   * Validates credentials and returns a JWT + user data.
   */
  @MessagePattern(USER_PATTERNS.LOGIN)
  async login(@Payload() dto: LoginDto): Promise<LoginResponseDto> {
    return await this.userService.login(dto);
  }

  /**
   * Handles user.findById messages from the Gateway.
   * Returns user data (without password) by ID.
   */
  @MessagePattern(USER_PATTERNS.FIND_BY_ID)
  async findById(@Payload() id: string): Promise<UserResponseDto> {
    return await this.userService.findById(id);
  }
}
