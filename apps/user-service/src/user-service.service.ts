import { Inject, Injectable, Logger } from '@nestjs/common';
import * as amqplib from 'amqplib';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import {
  EventEnvelope,
  publishEvent,
  consumeEvents,
  USER_EVENTS,
  RABBITMQ_EXCHANGE,
  RegisterPayload,
  RegisterSucceededPayload,
  RegisterFailedPayload,
  LoginPayload,
  LoginSucceededPayload,
  LoginFailedPayload,
  UserListRequestedPayload,
  UserListSucceededPayload,
  UserResponsePayload,
  JwtPayload,
  UserRole,
} from '@app/shared';
import { userServiceSchema, users, User } from './database';

const USER_SERVICE_QUEUE = 'user-service-queue';
const BCRYPT_ROUNDS = 12;

type UserServiceDb = NodePgDatabase<typeof userServiceSchema>;

@Injectable()
export class UserServiceService {
  private readonly logger = new Logger(UserServiceService.name);

  constructor(@Inject('DRIZZLE') private readonly db: UserServiceDb) {}

  async startConsuming(channel: amqplib.Channel): Promise<void> {
    await consumeEvents<
      RegisterPayload | LoginPayload | UserListRequestedPayload
    >(channel, USER_SERVICE_QUEUE, [], async (envelope) => {
      switch (envelope.eventType) {
        case USER_EVENTS.AUTH_REGISTER_REQUESTED:
          await this.handleRegister(
            channel,
            envelope as EventEnvelope<RegisterPayload>,
          );
          break;
        case USER_EVENTS.AUTH_LOGIN_REQUESTED:
          await this.handleLogin(
            channel,
            envelope as EventEnvelope<LoginPayload>,
          );
          break;
        case USER_EVENTS.LIST_REQUESTED:
          await this.handleListUsers(
            channel,
            envelope as EventEnvelope<UserListRequestedPayload>,
          );
          break;
        default:
          this.logger.warn(`Unknown eventType: ${envelope.eventType}`);
      }
    });
  }

  // ─── Register ─────────────────────────────────────────────────────────────

  async handleRegister(
    channel: amqplib.Channel,
    envelope: EventEnvelope<RegisterPayload>,
  ): Promise<void> {
    const { name, email, password, role } = envelope.payload;

    // Validate required fields
    if (!name || !email || !password) {
      this.publishFailed<RegisterFailedPayload>(
        channel,
        USER_EVENTS.AUTH_REGISTER_FAILED,
        envelope,
        { reason: 'Missing required fields: name, email, password', email },
      );
      return;
    }

    // Check for duplicate email
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      this.publishFailed<RegisterFailedPayload>(
        channel,
        USER_EVENTS.AUTH_REGISTER_FAILED,
        envelope,
        { reason: 'Email already in use', email },
      );
      return;
    }

    // Hash password and persist
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [newUser] = await this.db
      .insert(users)
      .values({
        name,
        email,
        password: hashedPassword,
        role: (role ?? UserRole.USER) as 'admin' | 'user',
      })
      .returning();

    const successPayload: RegisterSucceededPayload = {
      userId: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role as UserRole,
    };

    publishEvent<RegisterSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      USER_EVENTS.AUTH_REGISTER_SUCCEEDED,
      {
        eventType: USER_EVENTS.AUTH_REGISTER_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'user-service',
        payload: successPayload,
      },
    );

    this.logger.log(`Registered user: ${email}`);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async handleLogin(
    channel: amqplib.Channel,
    envelope: EventEnvelope<LoginPayload>,
  ): Promise<void> {
    const { email, password } = envelope.payload;

    if (!email || !password) {
      this.publishFailed<LoginFailedPayload>(
        channel,
        USER_EVENTS.AUTH_LOGIN_FAILED,
        envelope,
        { reason: 'Missing email or password', email },
      );
      return;
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      this.publishFailed<LoginFailedPayload>(
        channel,
        USER_EVENTS.AUTH_LOGIN_FAILED,
        envelope,
        { reason: 'Invalid credentials', email },
      );
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      this.publishFailed<LoginFailedPayload>(
        channel,
        USER_EVENTS.AUTH_LOGIN_FAILED,
        envelope,
        { reason: 'Invalid credentials', email },
      );
      return;
    }

    const jwtPayload: JwtPayload = {
      userId: user.id,
      role: user.role as UserRole,
    };

    const accessToken = jwt.sign(
      jwtPayload,
      process.env.JWT_SECRET ?? 'secret',
      { expiresIn: '7d' },
    );

    publishEvent<LoginSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      USER_EVENTS.AUTH_LOGIN_SUCCEEDED,
      {
        eventType: USER_EVENTS.AUTH_LOGIN_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'user-service',
        payload: { accessToken, userId: user.id, role: user.role as UserRole },
      },
    );

    this.logger.log(`Login succeeded: ${email}`);
  }

  // ─── List Users ───────────────────────────────────────────────────────────

  async handleListUsers(
    channel: amqplib.Channel,
    envelope: EventEnvelope<UserListRequestedPayload>,
  ): Promise<void> {
    const activeUsers: User[] = await this.db
      .select()
      .from(users)
      .where(eq(users.isActive, true));

    const userList: UserResponsePayload[] = activeUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as UserRole,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));

    publishEvent<UserListSucceededPayload>(
      channel,
      RABBITMQ_EXCHANGE,
      USER_EVENTS.LIST_SUCCEEDED,
      {
        eventType: USER_EVENTS.LIST_SUCCEEDED,
        correlationId: envelope.correlationId,
        timestamp: new Date().toISOString(),
        source: 'user-service',
        payload: { users: userList },
      },
    );

    this.logger.log(`Listed ${userList.length} active users`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private publishFailed<T>(
    channel: amqplib.Channel,
    routingKey: string,
    originalEnvelope: EventEnvelope<unknown>,
    payload: T,
  ): void {
    publishEvent<T>(channel, RABBITMQ_EXCHANGE, routingKey, {
      eventType: routingKey,
      correlationId: originalEnvelope.correlationId,
      timestamp: new Date().toISOString(),
      source: 'user-service',
      payload,
    });
  }
}
