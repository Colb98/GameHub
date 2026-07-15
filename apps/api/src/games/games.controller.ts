import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../common/decorators';
import { Principal } from '../common/types';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(
    @Query('sort') sort?: 'hot' | 'new',
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('locale') locale = 'en',
    @Query('take') take?: string,
  ) {
    return this.games.list({
      sort: sort === 'new' ? 'new' : 'hot',
      category,
      q,
      locale,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('categories')
  categories() {
    return this.games.categories();
  }

  @Get(':slug')
  detail(
    @Param('slug') slug: string,
    @CurrentPrincipal() principal: Principal,
    @Query('locale') locale = 'en',
  ) {
    return this.games.detail(slug, locale, principal);
  }

  @Get(':slug/suggestions')
  suggestions(@Param('slug') slug: string, @Query('locale') locale = 'en') {
    return this.games.suggestions(slug, locale);
  }
}
