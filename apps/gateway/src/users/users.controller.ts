import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, Roles } from '../auth/roles.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(
        @Inject('USER_CLIENT') private readonly userClient: ClientProxy,
    ) { }

    @Get()
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'List all users (Admin only)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    findAll(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
        @Query('search') search?: string,
    ) {
        return this.userClient.send('user.findAll', { page, limit, search });
    }

    @Get(':id')
    @Roles(Role.USER)
    @ApiOperation({ summary: 'Find user by ID' })
    @ApiParam({ name: 'id', required: true, type: String })
    findById(@Param('id') id: string) {
        return this.userClient.send('user.findById', id);
    }
}
