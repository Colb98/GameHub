import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { PrincipalGuard } from './principal.guard';
import { TokensService } from './tokens.service';
import { RolesGuard } from '../common/guards';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthService,
    TokensService,
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokensService, AuthService],
})
export class AuthModule {}
