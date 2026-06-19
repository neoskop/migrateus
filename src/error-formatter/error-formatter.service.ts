import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';

type ErrorLike = Record<string, any>;

@Injectable()
export class ErrorFormatterService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
  ) {}

  public format(error: unknown): Error {
    if (!error || typeof error !== 'object') {
      return new Error(String(error));
    }

    const err = error as ErrorLike;
    const parts = [
      this.formatMainMessage(err),
      this.formatResponse(err.response),
      this.formatCause(err.cause),
    ].filter((part): part is string => !!part);

    return new Error(parts.length > 0 ? parts.join(' — ') : 'Unknown error');
  }

  private formatMainMessage(err: ErrorLike): string | undefined {
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      return err.errors.map((e) => this.formatApiError(e)).join('; ');
    }

    return typeof err.message === 'string' && err.message.length > 0
      ? err.message
      : undefined;
  }

  private formatApiError(error: ErrorLike): string {
    const code = error?.extensions?.code;
    const message = error?.message ?? JSON.stringify(error);
    return code ? `${code}: ${message}` : message;
  }

  private formatResponse(response: ErrorLike | undefined): string | undefined {
    if (!response) {
      return undefined;
    }

    const status = response.status
      ? [response.status, response.statusText].filter(Boolean).join(' ')
      : undefined;
    const meta = [status, response.url].filter(Boolean).join(' ');
    return meta ? `(${meta})` : undefined;
  }

  private formatCause(cause: ErrorLike | undefined): string | undefined {
    if (!cause || !this.logger.isDebugEnabled()) {
      return undefined;
    }

    const message = cause.message ?? String(cause);
    const code = cause.code ?? cause.errno;
    const hostPort = this.formatHostPort(cause);
    const meta = [code, hostPort].filter(Boolean).join(' ');
    return `cause: ${message}${meta ? ` [${meta}]` : ''}`;
  }

  private formatHostPort(cause: ErrorLike): string | undefined {
    const host = cause.hostname || cause.address;
    if (!host) {
      return undefined;
    }
    return cause.port ? `${host}:${cause.port}` : host;
  }
}
