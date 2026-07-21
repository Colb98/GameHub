import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeveloperRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
