import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { OpenWalletService } from './services/open-wallet.service';
import { SearchWalletService } from './services/search-wallet.service';
import { ReconciliationService } from './services/reconciliation-wallet.service';

@Module({
  imports: [],
  providers: [OpenWalletService, SearchWalletService, ReconciliationService],
  controllers: [WalletController],
})
export class WalletModule {}
