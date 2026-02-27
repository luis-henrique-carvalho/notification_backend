import { Body, Controller, Post, Request, UseGuards, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Public } from './public.decorator';
import { RegisterDto, LoginDto, USER_PATTERNS } from '@app/shared';
import { firstValueFrom } from 'rxjs';

@Controller('auth')
export class AuthController {
    constructor(
        @Inject('USER_CLIENT') private readonly userClient: ClientProxy,
    ) { }

    @Public()
    @Post('register')
    async register(@Body() registerDto: RegisterDto) {
        const response = await firstValueFrom(
            this.userClient.send(USER_PATTERNS.REGISTER, registerDto)
        );
        return response;
    }

    @Public()
    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        const response = await firstValueFrom(
            this.userClient.send(USER_PATTERNS.LOGIN, loginDto)
        );
        return response;
    }
}
