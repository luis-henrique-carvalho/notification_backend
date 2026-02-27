import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import {
    LoginDto,
    LoginResponseDto,
    RegisterDto,
    UserResponseDto,
    rpcConflict,
    rpcNotFound,
    rpcUnauthorized,
} from '@app/shared';
import { DRIZZLE, DrizzleDB } from './database/drizzle.provider';
import { users } from './database/schema';

@Injectable()
export class UserServiceService {
    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        private readonly jwtService: JwtService,
    ) { }

    /**
     * Registers a new user.
     * Hashes the password, inserts into the DB, and returns an access token.
     */
    async register(dto: RegisterDto): Promise<LoginResponseDto> {
        // Check for duplicate email
        const [existing] = await this.db
            .select()
            .from(users)
            .where(eq(users.email, dto.email))
            .limit(1);

        if (existing) {
            throw rpcConflict(`Email "${dto.email}" is already registered`);
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);

        const [newUser] = await this.db
            .insert(users)
            .values({
                name: dto.name,
                email: dto.email,
                password: hashedPassword,
            })
            .returning();

        const userResponse = this.toUserResponse(newUser);
        const accessToken = this.signToken(newUser);

        return { accessToken, user: userResponse };
    }

    /**
     * Logs in an existing user.
     * Verifies the password and returns a new access token.
     */
    async login(dto: LoginDto): Promise<LoginResponseDto> {
        const [user] = await this.db
            .select()
            .from(users)
            .where(eq(users.email, dto.email))
            .limit(1);

        if (!user) {
            throw rpcUnauthorized('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);

        if (!isPasswordValid) {
            throw rpcUnauthorized('Invalid credentials');
        }

        const userResponse = this.toUserResponse(user);
        const accessToken = this.signToken(user);

        return { accessToken, user: userResponse };
    }

    /**
     * Finds a user by ID and returns their data without the password.
     */
    async findById(id: string): Promise<UserResponseDto> {
        const [user] = await this.db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        if (!user) {
            throw rpcNotFound(`User with id "${id}" not found`);
        }

        return this.toUserResponse(user);
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private signToken(user: { id: string; email: string; role: string }): string {
        return this.jwtService.sign({
            sub: user.id,
            email: user.email,
            role: user.role,
        });
    }

    private toUserResponse(user: {
        id: string;
        name: string;
        email: string;
        role: string;
        createdAt: Date;
        updatedAt: Date;
    }): UserResponseDto {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
}
