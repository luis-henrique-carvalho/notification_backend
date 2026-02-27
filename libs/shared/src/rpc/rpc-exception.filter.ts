import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { RpcErrorCode, RpcErrorPayload } from './rpc-exception.helpers';

/**
 * Global exception filter for microservices that normalizes all exceptions
 * to a consistent { code, message } structure.
 *
 * Usage: Apply globally in each microservice's bootstrap:
 *   app.useGlobalFilters(new AllRpcExceptionsFilter());
 *
 * - RpcException with structured payload → forwards { code, message } as-is
 * - RpcException with string → wraps in { code: INTERNAL, message }
 * - Unexpected exceptions → { code: INTERNAL, message: 'Internal server error' }
 */
@Catch()
export class AllRpcExceptionsFilter extends BaseRpcExceptionFilter {
    private readonly logger = new Logger(AllRpcExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost): Observable<never> {
        const errorPayload = this.normalizeException(exception);
        this.logger.error(
            `RPC Exception: [${errorPayload.code}] ${errorPayload.message}`,
            exception instanceof Error ? exception.stack : undefined,
        );
        return throwError(() => errorPayload);
    }

    private normalizeException(exception: unknown): RpcErrorPayload {
        if (exception instanceof RpcException) {
            const error = exception.getError();

            // Structured payload: { code, message }
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                'message' in error
            ) {
                return error as RpcErrorPayload;
            }

            // String payload
            if (typeof error === 'string') {
                return { code: RpcErrorCode.INTERNAL, message: error };
            }
        }

        // Unexpected exception
        const message =
            exception instanceof Error
                ? exception.message
                : 'Internal server error';

        return { code: RpcErrorCode.INTERNAL, message };
    }
}
