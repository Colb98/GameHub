import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CurrentPrincipal } from '../common/decorators';
import { Principal } from '../common/types';
import { PlayService } from './play.service';

class SubmitScoreDto {
  @IsInt()
  @Min(0)
  score: number;

  @IsInt()
  @Min(0)
  durationMs: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;
}

@Controller()
export class PlayController {
  constructor(private readonly play: PlayService) {}

  @Post('games/:id/sessions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  startSession(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.play.startSession(id, p);
  }

  @Post('sessions/:id/score')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitScore(
    @Param('id') id: string,
    @Headers('x-session-token') token: string | undefined,
    @Body() dto: SubmitScoreDto,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.play.submitScore(id, token, dto, p);
  }

  @Get('games/:id/leaderboard')
  leaderboard(
    @Param('id') id: string,
    @CurrentPrincipal() p: Principal,
    @Query('period') period: 'all' | 'weekly' | 'daily' = 'all',
    @Query('limit') limit?: string,
  ) {
    return this.play.leaderboard(
      id,
      ['daily', 'weekly'].includes(period) ? period : 'all',
      p,
      limit ? Math.min(Number(limit), 100) : 20,
    );
  }
}
