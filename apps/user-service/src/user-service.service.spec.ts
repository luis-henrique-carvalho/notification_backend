import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RpcException } from '@nestjs/microservices';
import { UserServiceService } from './user-service.service';
import { DRIZZLE } from './database/drizzle.provider';
import { RpcErrorCode } from '@app/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal user row as returned by the DB. */
const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'uuid-123',
    name: 'Alice',
    email: 'alice@example.com',
    password: '$2a$10$hashedPasswordHash', // placeholder hash
    role: 'user',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
});

/** Builds a chainable Drizzle query mock that resolves to `rows`. */
const buildDrizzleMock = (rows: unknown[] = []) => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('UserServiceService', () => {
    let service: UserServiceService;
    let jwtService: JwtService;

    // We replace the drizzle mock between tests via a factory approach.
    // `mockDb` holds the current mock; we re-create it per test when needed.
    let mockDb: ReturnType<typeof buildDrizzleMock>;

    beforeEach(async () => {
        // Default mock: empty DB (no existing user)
        mockDb = buildDrizzleMock([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserServiceService,
                {
                    provide: DRIZZLE,
                    useValue: mockDb,
                },
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn().mockReturnValue('mock.jwt.token'),
                    },
                },
            ],
        }).compile();

        service = module.get<UserServiceService>(UserServiceService);
        jwtService = module.get<JwtService>(JwtService);
    });

    // -------------------------------------------------------------------------
    // register()
    // -------------------------------------------------------------------------

    describe('register()', () => {
        const registerDto = {
            name: 'Alice',
            email: 'alice@example.com',
            password: 'secret123',
        };

        it('should register a new user and return an access token with user data', async () => {
            // select returns [] (no existing user), insert/returning returns new row
            const newUser = makeUser();
            mockDb.limit.mockResolvedValueOnce([]); // duplicate-check query
            mockDb.returning.mockResolvedValueOnce([newUser]);

            const result = await service.register(registerDto);

            expect(result.accessToken).toBe('mock.jwt.token');
            expect(result.user.id).toBe(newUser.id);
            expect(result.user.email).toBe(newUser.email);
            // Password must NOT be exposed
            expect((result.user as unknown as Record<string, unknown>)['password']).toBeUndefined();
        });

        it('should hash the password before storing it', async () => {
            const newUser = makeUser();
            mockDb.limit.mockResolvedValueOnce([]);
            mockDb.returning.mockResolvedValueOnce([newUser]);

            const hashSpy = jest.spyOn(bcrypt, 'hash');

            await service.register(registerDto);

            expect(hashSpy).toHaveBeenCalledWith(registerDto.password, 10);
        });

        it('should throw CONFLICT RpcException when email is already registered', async () => {
            const existingUser = makeUser();
            mockDb.limit.mockResolvedValueOnce([existingUser]); // duplicate found

            await expect(service.register(registerDto)).rejects.toMatchObject({
                error: {
                    code: RpcErrorCode.CONFLICT,
                    message: expect.stringContaining(registerDto.email),
                },
            });
        });

        it('should call jwtService.sign with correct payload after registration', async () => {
            const newUser = makeUser();
            mockDb.limit.mockResolvedValueOnce([]);
            mockDb.returning.mockResolvedValueOnce([newUser]);

            await service.register(registerDto);

            expect(jwtService.sign).toHaveBeenCalledWith({
                sub: newUser.id,
                email: newUser.email,
                role: newUser.role,
            });
        });
    });

    // -------------------------------------------------------------------------
    // login()
    // -------------------------------------------------------------------------

    describe('login()', () => {
        const loginDto = { email: 'alice@example.com', password: 'secret123' };

        it('should return access token and user data for valid credentials', async () => {
            const hashedPassword = await bcrypt.hash(loginDto.password, 10);
            const existingUser = makeUser({ password: hashedPassword });
            mockDb.limit.mockResolvedValueOnce([existingUser]);

            const result = await service.login(loginDto);

            expect(result.accessToken).toBe('mock.jwt.token');
            expect(result.user.email).toBe(existingUser.email);
            expect((result.user as unknown as Record<string, unknown>)['password']).toBeUndefined();
        });

        it('should throw UNAUTHORIZED when email is not found', async () => {
            mockDb.limit.mockResolvedValueOnce([]); // user not found

            await expect(service.login(loginDto)).rejects.toMatchObject({
                error: {
                    code: RpcErrorCode.UNAUTHORIZED,
                    message: 'Invalid credentials',
                },
            });
        });

        it('should throw UNAUTHORIZED when password is wrong', async () => {
            const hashedPassword = await bcrypt.hash('differentPassword', 10);
            const existingUser = makeUser({ password: hashedPassword });
            mockDb.limit.mockResolvedValueOnce([existingUser]);

            await expect(service.login(loginDto)).rejects.toMatchObject({
                error: {
                    code: RpcErrorCode.UNAUTHORIZED,
                    message: 'Invalid credentials',
                },
            });
        });

        it('should NOT reveal whether the email or the password was wrong', async () => {
            // Both email-not-found and wrong-password must throw identical messages
            mockDb.limit.mockResolvedValueOnce([]);
            const errorNoEmail = await service.login(loginDto).catch((e: RpcException) => e);

            const hashedPassword = await bcrypt.hash('wrongPassword', 10);
            mockDb.limit.mockResolvedValueOnce([makeUser({ password: hashedPassword })]);
            const errorBadPw = await service.login(loginDto).catch((e: RpcException) => e);

            // Both should contain the same generic "Invalid credentials" message
            expect((errorNoEmail as RpcException).getError()).toEqual(
                (errorBadPw as RpcException).getError(),
            );
        });
    });

    // -------------------------------------------------------------------------
    // findById()
    // -------------------------------------------------------------------------

    describe('findById()', () => {
        it('should return user data without password for an existing user', async () => {
            const existingUser = makeUser();
            mockDb.limit.mockResolvedValueOnce([existingUser]);

            const result = await service.findById(existingUser.id);

            expect(result.id).toBe(existingUser.id);
            expect(result.name).toBe(existingUser.name);
            expect(result.email).toBe(existingUser.email);
            expect(result.role).toBe(existingUser.role);
            expect((result as unknown as Record<string, unknown>)['password']).toBeUndefined();
        });

        it('should throw NOT_FOUND RpcException for a non-existent user id', async () => {
            mockDb.limit.mockResolvedValueOnce([]); // no user returned

            await expect(service.findById('non-existent-uuid')).rejects.toMatchObject({
                error: {
                    code: RpcErrorCode.NOT_FOUND,
                    message: expect.stringContaining('non-existent-uuid'),
                },
            });
        });

        it('should propagate the requested id in the error message', async () => {
            const targetId = 'some-specific-uuid-456';
            mockDb.limit.mockResolvedValueOnce([]);

            const error = await service.findById(targetId).catch((e: RpcException) => e);

            expect((error as RpcException).getError()).toMatchObject({
                message: expect.stringContaining(targetId),
            });
        });
    });
});
