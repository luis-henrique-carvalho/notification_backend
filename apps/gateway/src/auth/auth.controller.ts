import { Body, Controller, Post, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import { Public } from './public.decorator';
import {
    RegisterDto,
    LoginDto,
    USER_PATTERNS,
    UserResponseDto,
    LoginResponseDto,
} from '@app/shared';
import { firstValueFrom } from 'rxjs';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        @Inject('USER_CLIENT') private readonly userClient: ClientProxy,
    ) {}

    @Public()
    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({
        status: 201,
        description: 'The user has been successfully created.',
    })
    @ApiResponse({
        status: 400,
        description: 'User already exists or bad request.',
    })
    async register(@Body() registerDto: RegisterDto): Promise<UserResponseDto> {
        const response = await firstValueFrom(
            this.userClient.send<UserResponseDto>(
                USER_PATTERNS.REGISTER,
                registerDto,
            ),
        );

        return response;
    }

    @Public()
    @Post('login')
    @ApiOperation({ summary: 'Login user' })
    @ApiResponse({ status: 200, description: 'User successfully logged in.' })
    @ApiResponse({ status: 401, description: 'Invalid credentials.' })
    async login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
        const response = await firstValueFrom(
            this.userClient.send<LoginResponseDto>(
                USER_PATTERNS.LOGIN,
                loginDto,
            ),
        );
        return response;
    }
}
