import {
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '../auth/roles.decorator';

import { USER_PATTERNS } from '@app/shared';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(
        @Inject('USER_CLIENT') private readonly userClient: ClientProxy,
    ) {}

    @Get()
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'List all users (Admin only)' })
    @ApiResponse({
        status: 200,
        description: 'List of users returned successfully.',
    })
    @ApiResponse({
        status: 403,
        description: 'Forbidden. Admin role required.',
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    findAll(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
        @Query('search') search?: string,
    ) {
        return this.userClient.send(USER_PATTERNS.FIND_ALL, {
            page,
            limit,
            search,
        });
    }

    @Get(':id')
    @Roles(Role.USER)
    @ApiOperation({ summary: 'Find user by ID' })
    @ApiResponse({
        status: 200,
        description: 'User found and returned successfully.',
    })
    @ApiResponse({ status: 404, description: 'User not found.' })
    @ApiParam({ name: 'id', required: true, type: String })
    findById(@Param('id', new ParseUUIDPipe()) id: string) {
        // Adicione o Pipe aqui
        return this.userClient.send(USER_PATTERNS.FIND_BY_ID, id);
    }
}
