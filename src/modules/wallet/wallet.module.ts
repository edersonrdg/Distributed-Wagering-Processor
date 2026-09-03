import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { OpenWalletService } from './services/open-wallet.service';

@Module({
  imports: [],
  providers: [OpenWalletService],
  controllers: [WalletController],
})
export class WalletModule {}
