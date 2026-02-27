import { Test, TestingModule } from '@nestjs/testing';
import { UserServiceService } from './user-service.service';
import * as amqplib from 'amqplib';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { USER_EVENTS, RABBITMQ_EXCHANGE, UserRole } from '@app/shared';

type PublishCall = [string, string, Buffer];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnvelope<T>(
  eventType: string,
  payload: T,
  correlationId = 'corr-123',
) {
  return {
    eventType,
    correlationId,
    timestamp: new Date().toISOString(),
    source: 'test',
    payload,
  };
}

function makeChannel(): { channel: amqplib.Channel; publishMock: jest.Mock } {
  const publishMock = jest.fn();
  const channel = { publish: publishMock } as unknown as amqplib.Channel;
  return { channel, publishMock };
}

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockDb = {
  select: mockSelect,
  insert: mockInsert,
};

// Chainable query builder
function chainableSelect(result: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function chainableSelectNoLimit(result: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(result),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function chainableInsert(result: unknown[]) {
  const chain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(result),
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UserServiceService', () => {
  let service: UserServiceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [UserServiceService, { provide: 'DRIZZLE', useValue: mockDb }],
    }).compile();

    service = module.get<UserServiceService>(UserServiceService);
  });

  // ─── handleRegister ───────────────────────────────────────────────────────

  describe('handleRegister', () => {
    it('should register a new user and publish succeeded', async () => {
      const { channel, publishMock } = makeChannel();

      // No existing user
      chainableSelect([]);
      // New user returned by insert
      chainableInsert([
        {
          id: 'user-id-1',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'user',
          isActive: true,
          createdAt: new Date(),
        },
      ]);

      const envelope = makeEnvelope(USER_EVENTS.AUTH_REGISTER_REQUESTED, {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });

      await service.handleRegister(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [exchange, routingKey, buffer] = publishMock.mock
        .calls[0] as PublishCall;
      expect(exchange).toBe(RABBITMQ_EXCHANGE);
      expect(routingKey).toBe(USER_EVENTS.AUTH_REGISTER_SUCCEEDED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        correlationId: string;
        payload: { email: string };
      };
      expect(published.correlationId).toBe('corr-123');
      expect(published.payload.email).toBe('alice@example.com');
    });

    it('should publish failed when email is already in use', async () => {
      const { channel, publishMock } = makeChannel();

      // Existing user found
      chainableSelect([{ id: 'existing-id', email: 'alice@example.com' }]);

      const envelope = makeEnvelope(USER_EVENTS.AUTH_REGISTER_REQUESTED, {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });

      await service.handleRegister(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.AUTH_REGISTER_FAILED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { reason: string };
      };
      expect(published.payload.reason).toBe('Email already in use');
    });

    it('should publish failed when required fields are missing', async () => {
      const { channel, publishMock } = makeChannel();

      const envelope = makeEnvelope(USER_EVENTS.AUTH_REGISTER_REQUESTED, {
        name: '',
        email: 'alice@example.com',
        password: '',
      });

      await service.handleRegister(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.AUTH_REGISTER_FAILED);
    });
  });

  // ─── handleLogin ──────────────────────────────────────────────────────────

  describe('handleLogin', () => {
    it('should login successfully and publish succeeded with JWT', async () => {
      const { channel, publishMock } = makeChannel();
      const plainPassword = 'secret123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      chainableSelect([
        {
          id: 'user-id-1',
          name: 'Bob',
          email: 'bob@example.com',
          password: hashedPassword,
          role: 'admin',
          isActive: true,
        },
      ]);

      const envelope = makeEnvelope(USER_EVENTS.AUTH_LOGIN_REQUESTED, {
        email: 'bob@example.com',
        password: plainPassword,
      });

      await service.handleLogin(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.AUTH_LOGIN_SUCCEEDED);

      const published = JSON.parse((buffer as Buffer).toString()) as {
        correlationId: string;
        payload: { accessToken: string; userId: string; role: string };
      };
      expect(published.correlationId).toBe('corr-123');
      expect(published.payload.accessToken).toBeTruthy();
      expect(published.payload.userId).toBe('user-id-1');
      expect(published.payload.role).toBe('admin');

      // Verify JWT payload contains userId and role
      const decoded = jwt.verify(
        published.payload.accessToken,
        process.env.JWT_SECRET ?? 'secret',
      ) as { userId: string; role: UserRole };
      expect(decoded.userId).toBe('user-id-1');
      expect(decoded.role).toBe('admin');
    });

    it('should publish failed when user not found', async () => {
      const { channel, publishMock } = makeChannel();

      chainableSelect([]);

      const envelope = makeEnvelope(USER_EVENTS.AUTH_LOGIN_REQUESTED, {
        email: 'nobody@example.com',
        password: 'wrongpass',
      });

      await service.handleLogin(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.AUTH_LOGIN_FAILED);
    });

    it('should publish failed when password does not match', async () => {
      const { channel, publishMock } = makeChannel();
      const hashedPassword = await bcrypt.hash('correctpass', 10);

      chainableSelect([
        {
          id: 'user-id-2',
          email: 'carol@example.com',
          password: hashedPassword,
          role: 'user',
          isActive: true,
        },
      ]);

      const envelope = makeEnvelope(USER_EVENTS.AUTH_LOGIN_REQUESTED, {
        email: 'carol@example.com',
        password: 'wrongpass',
      });

      await service.handleLogin(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.AUTH_LOGIN_FAILED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { reason: string };
      };
      expect(published.payload.reason).toBe('Invalid credentials');
    });
  });

  // ─── handleListUsers ──────────────────────────────────────────────────────

  describe('handleListUsers', () => {
    it('should return only active users', async () => {
      const { channel, publishMock } = makeChannel();

      const activeUsers = [
        {
          id: 'u1',
          name: 'User One',
          email: 'one@example.com',
          role: 'user',
          isActive: true,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'u2',
          name: 'User Two',
          email: 'two@example.com',
          role: 'admin',
          isActive: true,
          createdAt: new Date('2024-01-02'),
        },
      ];

      chainableSelectNoLimit(activeUsers);

      const envelope = makeEnvelope(USER_EVENTS.LIST_REQUESTED, {
        requestedBy: 'admin',
      });

      await service.handleListUsers(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.LIST_SUCCEEDED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { users: Array<{ id: string; role: string }> };
      };
      expect(published.payload.users).toHaveLength(2);
      expect(published.payload.users[0].id).toBe('u1');
      expect(published.payload.users[1].role).toBe('admin');
    });

    it('should return empty array when no active users', async () => {
      const { channel, publishMock } = makeChannel();

      chainableSelectNoLimit([]);

      const envelope = makeEnvelope(USER_EVENTS.LIST_REQUESTED, {});

      await service.handleListUsers(channel, envelope);

      expect(publishMock).toHaveBeenCalledTimes(1);
      const [, routingKey, buffer] = publishMock.mock.calls[0] as PublishCall;
      expect(routingKey).toBe(USER_EVENTS.LIST_SUCCEEDED);
      const published = JSON.parse((buffer as Buffer).toString()) as {
        payload: { users: unknown[] };
      };
      expect(published.payload.users).toHaveLength(0);
    });
  });
});
