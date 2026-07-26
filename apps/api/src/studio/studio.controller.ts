import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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

  @Get(':id')
  get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.studio.getGame(p.userId!, id);
  }

  @Post()
  create(@CurrentPrincipal() p: Principal, @Body() dto: CreateGameDto) {
    return this.studio.createGame(p.userId!, dto);
  }

  @Post('import')
  async importPackage(
    @CurrentPrincipal() p: Principal,
    @Req() req: FastifyRequest,
  ) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('Missing package zip file');
    const buffer: Buffer = await file.toBuffer();
    return this.studio.importGamePackage(p.userId!, buffer);
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

  @Post(':id/banner')
  async uploadBanner(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('Missing image file');
    return this.studio.uploadBanner(p.userId!, id, file);
  }

  @Post(':id/screenshots')
  async uploadScreenshot(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('Missing image file');
    return this.studio.uploadScreenshot(p.userId!, id, file);
  }

  @Delete(':id/screenshots/:screenshotId')
  removeScreenshot(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Param('screenshotId') screenshotId: string,
  ) {
    return this.studio.removeScreenshot(p.userId!, id, screenshotId);
  }

  @Post(':id/submit')
  submit(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.studio.submit(p.userId!, id);
  }
}
