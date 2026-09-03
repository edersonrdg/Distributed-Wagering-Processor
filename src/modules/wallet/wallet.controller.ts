import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { OpenWalletService } from './services/open-wallet.service';
import {
  type OpenWalletPayload,
  openWalletSchema,
} from './schema/open-wallet.schema';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SearchWalletService } from './services/search-wallet.service';
import { ReconciliationService } from './services/reconciliation-wallet.service';

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly openWalletService: OpenWalletService,
    private readonly searchWalletService: SearchWalletService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Post()
  async openWallet(
    @Body(new ZodValidationPipe(openWalletSchema)) body: OpenWalletPayload,
  ) {
    return await this.openWalletService.execute(body);
  }

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    return await this.searchWalletService.getWallet(walletId);
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 50,
  ) {
    return await this.searchWalletService.getLedger(walletId, cursor, limit);
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcileWallet(@Param('walletId') walletId: string) {
    return await this.reconciliationService.execute(walletId);
  }
}
