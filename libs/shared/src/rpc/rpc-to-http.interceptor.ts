import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RpcErrorCode, RpcErrorPayload } from './rpc-exception.helpers';

/**
 * Maps RPC error codes to HTTP status codes.
 */
const RPC_TO_HTTP_STATUS: Record<string, HttpStatus> = {
    [RpcErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
    [RpcErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
    [RpcErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
    [RpcErrorCode.CONFLICT]: HttpStatus.CONFLICT,
    [RpcErrorCode.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Interceptor for the Gateway that catches RPC errors from microservices
 * and maps them to HttpException with the correct HTTP status code.
 *
 * Usage: Apply globally in the Gateway or per-controller:
 *   app.useGlobalInterceptors(new RpcToHttpInterceptor());
 *
 * Flow:
 *   Microservice throws RpcException({ code: 'NOT_FOUND', message: '...' })
 *   → AllRpcExceptionsFilter normalizes to { code, message }
 *   → RabbitMQ delivers error payload to Gateway
 *   → This interceptor catches it and throws HttpException(404)
 */
@Injectable()
export class RpcToHttpInterceptor implements NestInterceptor {
    private readonly logger = new Logger(RpcToHttpInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            catchError((error: unknown) => {
                const httpException = this.mapRpcErrorToHttp(error);
                return throwError(() => httpException);
            }),
        );
    }

    private mapRpcErrorToHttp(error: unknown): HttpException {
        // If it's already an HttpException (e.g. from ParseUUIDPipe), just return it
        if (error instanceof HttpException) {
            return error;
        }

        // Structured RPC error payload: { code, message }
        if (this.isRpcErrorPayload(error)) {
            const status =
                RPC_TO_HTTP_STATUS[error.code] || HttpStatus.INTERNAL_SERVER_ERROR;
            return new HttpException(
                { statusCode: status, message: error.message, error: error.code },
                status,
            );
        }

        // String error
        if (typeof error === 'string') {
            return new HttpException(
                { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: error },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        // Unknown error shape
        this.logger.error('Unexpected RPC error shape', error);
        return new HttpException(
            {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Internal server error',
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }

    private isRpcErrorPayload(error: unknown): error is RpcErrorPayload {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'message' in error
        );
    }
}
