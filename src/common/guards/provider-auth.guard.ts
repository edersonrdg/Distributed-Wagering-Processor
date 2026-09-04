import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ProviderAuthGuard implements CanActivate {
  canActivate(
    _: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // const request = context.switchToHttp().getRequest();
    // const authHeader = request.headers.authorization;
    // Lógica de validação do provedor entraria aqui.

    return true; // No-Op: Autenticação desativada para a avaliação técnica
  }
}
