import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TranslationDto {
  @IsIn(['en', 'vi'])
  locale: 'en' | 'vi';

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(500)
  shortIntro: string;

  @IsString()
  @MaxLength(5000)
  controlsHtml: string;
}

export class CreateGameDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, {
    message: 'slug must be lowercase letters, digits and dashes',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  category: string;

  @IsIn(['LANDSCAPE', 'PORTRAIT', 'BOTH'])
  orientation: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';

  @IsIn(['DESC', 'ASC'])
  scoreOrder: 'DESC' | 'ASC';

  @IsOptional()
  @IsInt()
  @Min(1)
  maxScore?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TranslationDto)
  translations: TranslationDto[];
}

export class UpdateGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsIn(['LANDSCAPE', 'PORTRAIT', 'BOTH'])
  orientation?: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';

  @IsOptional()
  @IsIn(['DESC', 'ASC'])
  scoreOrder?: 'DESC' | 'ASC';

  @IsOptional()
  @IsInt()
  @Min(1)
  maxScore?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationDto)
  translations?: TranslationDto[];
}
