import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { CurrentPrincipal, Roles } from '../common/decorators';
import { Principal } from '../common/types';
import { CreateGameDto, UpdateGameDto } from './dto';
import { StudioService } from './studio.service';

@Controller('studio/games')
@Roles(Role.DEVELOPER)
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Get()
  myGames(@CurrentPrincipal() p: Principal) {
    return this.studio.myGames(p.userId!);
  }

  @Post()
  create(@CurrentPrincipal() p: Principal, @Body() dto: CreateGameDto) {
    return this.studio.createGame(p.userId!, dto);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateGameDto,
  ) {
    return this.studio.updateGame(p.userId!, id, dto);
  }

  @Post(':id/versions')
  async uploadVersion(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Query('semver') semver: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('Missing zip file');
    const buffer: Buffer = await file.toBuffer();
    return this.studio.uploadVersion(p.userId!, id, semver ?? '', buffer);
  }

  @Post(':id/submit')
  submit(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.studio.submit(p.userId!, id);
  }
}
