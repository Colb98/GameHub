import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { FastifyReply } from 'fastify';
import { SkipPrincipal } from '../common/decorators';
import { BannerMediaService } from './banner-media.service';

@Controller('media')
@SkipPrincipal()
export class BannerMediaController {
  constructor(private readonly banners: BannerMediaService) {}

  @Get('banner')
  async banner(
    @Query('path') mediaPath: string | undefined,
    @Query('width') width: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const banner = await this.banners.getBanner(mediaPath, width);
    reply.header('Cache-Control', banner.cacheControl);
    reply.header('Content-Length', banner.contentLength);
    reply.header('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(banner.absolutePath), {
      type: banner.contentType,
    });
  }
}
