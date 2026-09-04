import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  type ProcessWagerPayload,
  processWagerSchema,
} from './schemas/process-wager.schema';
import { ProcessWageringService } from './services/process-wagering.service';
import { SearchWageringService } from './services/search-wagering.service';
import { generateHashPayload } from './utils/payload-hash.utils';
import { ProviderAuthGuard } from '../../common/guards/provider-auth.guard';

@Controller()
export class WageringController {
  constructor(
    private readonly processWagerService: ProcessWageringService,
    private readonly searchWageringService: SearchWageringService,
  ) {}

  @Post('wagering/transactions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProviderAuthGuard)
  async processWager(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body(new ZodValidationPipe(processWagerSchema)) body: ProcessWagerPayload,
  ) {
    return this.processWagerService.execute({
      idempotencyKey,
      payloadHash: generateHashPayload(body),
      ...body,
    });
  }

  @Get('wagering/transactions/:transactionId')
  @UseGuards(ProviderAuthGuard)
  async getTransaction(@Param('transactionId') transactionId: string) {
    return await this.searchWageringService.getTransactionById(transactionId);
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  @UseGuards(ProviderAuthGuard)
  async getTransactionByExternal(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return await this.searchWageringService.getTransactionByExternalId(
      providerId,
      externalTransactionId,
    );
  }
}
