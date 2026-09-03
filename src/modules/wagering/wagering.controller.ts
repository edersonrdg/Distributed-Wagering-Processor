import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  type ProcessWagerPayload,
  processWagerSchema,
} from './schemas/process-wager.schema';
import { WageringService } from './wagering.service';

@Controller('wagering/transactions')
export class WageringController {
  constructor(private readonly processWagerService: WageringService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async processWager(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body(new ZodValidationPipe(processWagerSchema)) body: ProcessWagerPayload,
  ) {
    return this.processWagerService.execute({
      idempotencyKey,
      payloadHash: '12312312312',
      ...body,
    });
  }
}
