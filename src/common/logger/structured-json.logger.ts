import { LoggerService, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class StructuredJsonLogger implements LoggerService {
  constructor(private readonly cls: ClsService) {}

  log(message: any, context?: string) {
    this.print('INFO', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.print('ERROR', message, context, trace);
  }

  warn(message: any, context?: string) {
    this.print('WARN', message, context);
  }

  private print(level: string, message: any, context?: string, trace?: string) {
    const logEntry: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level,
      context,
      correlationId: this.cls.getId(),
      transactionId: this.cls.get('transactionId'),
      walletId: this.cls.get('walletId'),
      providerId: this.cls.get('providerId'),
      messageId: this.cls.get('messageId'),
    };

    if (trace) logEntry.trace = trace;

    if (
      typeof message === 'object' &&
      message !== null &&
      !Array.isArray(message)
    ) {
      const { money, amount, balance, message: msgProp, ...safeData } = message;
      logEntry.message = msgProp || 'Log event';
      Object.assign(logEntry, safeData);
    } else {
      logEntry.message = message;
    }

    console.log(JSON.stringify(logEntry));
  }
}
