import { RpcException } from '@nestjs/microservices';

/**
 * Standardized RPC error codes that map to HTTP status codes.
 */
export enum RpcErrorCode {
    BAD_REQUEST = 'BAD_REQUEST',
    UNAUTHORIZED = 'UNAUTHORIZED',
    NOT_FOUND = 'NOT_FOUND',
    CONFLICT = 'CONFLICT',
    INTERNAL = 'INTERNAL',
}

/**
 * Standardized RPC error payload structure.
 */
export interface RpcErrorPayload {
    code: RpcErrorCode;
    message: string;
}

/**
 * Throws an RpcException with NOT_FOUND code (→ HTTP 404).
 */
export function rpcNotFound(message: string): never {
    throw new RpcException({ code: RpcErrorCode.NOT_FOUND, message });
}

/**
 * Throws an RpcException with BAD_REQUEST code (→ HTTP 400).
 */
export function rpcBadRequest(message: string): never {
    throw new RpcException({ code: RpcErrorCode.BAD_REQUEST, message });
}

/**
 * Throws an RpcException with UNAUTHORIZED code (→ HTTP 401).
 */
export function rpcUnauthorized(message: string): never {
    throw new RpcException({ code: RpcErrorCode.UNAUTHORIZED, message });
}

/**
 * Throws an RpcException with CONFLICT code (→ HTTP 409).
 */
export function rpcConflict(message: string): never {
    throw new RpcException({ code: RpcErrorCode.CONFLICT, message });
}
