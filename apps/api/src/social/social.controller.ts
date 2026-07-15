import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max as MaxV,
  MaxLength,
  Min as MinV,
} from 'class-validator';
import { CurrentPrincipal } from '../common/decorators';
import { RequireUserGuard } from '../common/guards';
import { Principal } from '../common/types';
import { SocialService } from './social.service';

class CommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}

class RatingDto {
  @IsInt()
  @MinV(1)
  @MaxV(5)
  stars: number;
}

@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('games/:id/comments')
  listComments(
    @Param('id') gameId: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.social.listComments(
      gameId,
      take ? Math.min(Number(take), 50) : 20,
      cursor,
    );
  }

  @Post('games/:id/comments')
  @UseGuards(RequireUserGuard)
  addComment(
    @Param('id') gameId: string,
    @CurrentPrincipal() p: Principal,
    @Body() dto: CommentDto,
  ) {
    return this.social.addComment(gameId, p.userId!, dto.body);
  }

  @Delete('comments/:id')
  @UseGuards(RequireUserGuard)
  deleteComment(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.social.deleteComment(id, p);
  }

  @Put('games/:id/rating')
  @UseGuards(RequireUserGuard)
  rate(
    @Param('id') gameId: string,
    @CurrentPrincipal() p: Principal,
    @Body() dto: RatingDto,
  ) {
    return this.social.rate(gameId, p.userId!, dto.stars);
  }

  @Put('games/:id/favorite')
  @UseGuards(RequireUserGuard)
  favorite(@Param('id') gameId: string, @CurrentPrincipal() p: Principal) {
    return this.social.setFavorite(gameId, p.userId!, true);
  }

  @Delete('games/:id/favorite')
  @UseGuards(RequireUserGuard)
  unfavorite(@Param('id') gameId: string, @CurrentPrincipal() p: Principal) {
    return this.social.setFavorite(gameId, p.userId!, false);
  }
}
