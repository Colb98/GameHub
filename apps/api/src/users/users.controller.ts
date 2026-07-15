import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal } from '../common/decorators';
import { RequireUserGuard } from '../common/guards';
import { Principal } from '../common/types';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(RequireUserGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentPrincipal() p: Principal) {
    return this.users.profile(p.userId!);
  }

  @Get('scores')
  scores(@CurrentPrincipal() p: Principal, @Query('locale') locale = 'en') {
    return this.users.bestScores(p.userId!, locale);
  }

  @Get('history')
  history(@CurrentPrincipal() p: Principal, @Query('locale') locale = 'en') {
    return this.users.history(p.userId!, locale);
  }

  @Get('favorites')
  favorites(@CurrentPrincipal() p: Principal, @Query('locale') locale = 'en') {
    return this.users.favorites(p.userId!, locale);
  }
}
