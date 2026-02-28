// Message & Event patterns
export { USER_PATTERNS, NOTIFICATION_PATTERNS } from './patterns';
export { NOTIFICATION_EVENTS } from './events';

// DTOs
export {
  RegisterDto,
  LoginDto,
  LoginResponseDto,
  UserResponseDto,
} from './dto/user.dto';
export {
  CreateNotificationDto,
  NotificationResponseDto,
  SendNotificationResponseDto,
  MarkReadDto,
  AcknowledgeDto,
  UnreadCountDto,
  NotificationPriority,
  NotificationCreatedEventPayload,
  NotificationStateEventPayload,
} from './dto/notification.dto';

// RPC utilities
export {
  RpcErrorCode,
  RpcErrorPayload,
  rpcNotFound,
  rpcBadRequest,
  rpcUnauthorized,
  rpcConflict,
} from './rpc/rpc-exception.helpers';
export { AllRpcExceptionsFilter } from './rpc/rpc-exception.filter';
export { RpcToHttpInterceptor } from './rpc/rpc-to-http.interceptor';
