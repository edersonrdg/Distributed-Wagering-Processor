import { Body, Controller, Post } from '@nestjs/common';
import { OpenWalletService } from './services/open-wallet.service';
import {
  type OpenWalletPayload,
  openWalletSchema,
} from './schema/open-wallet.schema';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('wallets')
export class WalletController {
  constructor(private readonly openWalletService: OpenWalletService) {}

  @Post()
  async openWallet(
    @Body(new ZodValidationPipe(openWalletSchema)) body: OpenWalletPayload,
  ) {
    return await this.openWalletService.execute(body);
  }
}
