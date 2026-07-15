import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  displayName: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class GuestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ClaimGuestDto {
  @IsString()
  @IsNotEmpty()
  guestToken: string;
}
