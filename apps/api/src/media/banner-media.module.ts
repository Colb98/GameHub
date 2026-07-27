import { Module } from '@nestjs/common';
import { BannerMediaController } from './banner-media.controller';
import { BannerMediaService } from './banner-media.service';

@Module({
  controllers: [BannerMediaController],
  providers: [BannerMediaService],
})
export class BannerMediaModule {}
