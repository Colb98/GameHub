import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommentStatus, GameStatus, Role } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentPrincipal, Roles } from '../common/decorators';
import { Principal } from '../common/types';
import { AdminService } from './admin.service';

class RejectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

class FeatureDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  rank?: number;
}

class SetRoleDto {
  @IsIn(['PLAYER', 'DEVELOPER', 'MODERATOR', 'ADMIN'])
  role: Role;
}

class CommentStatusDto {
  @IsIn(['VISIBLE', 'HIDDEN'])
  status: CommentStatus;
}

@Controller('admin')
@Roles(Role.MODERATOR)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('games')
  listGames(@Query('status') status?: GameStatus) {
    return this.admin.listGames(status);
  }

  @Get('games/:id')
  gameDetail(@Param('id') id: string) {
    return this.admin.gameDetail(id);
  }

  @Post('games/:id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string) {
    return this.admin.approve(id);
  }

  @Post('games/:id/reject')
  @Roles(Role.ADMIN)
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.admin.reject(id, dto.reason);
  }

  @Post('games/:id/delist')
  @Roles(Role.ADMIN)
  delist(@Param('id') id: string) {
    return this.admin.delist(id);
  }

  @Post('games/:id/feature')
  @Roles(Role.ADMIN)
  feature(@Param('id') id: string, @Body() dto: FeatureDto) {
    return this.admin.feature(id, dto.rank ?? null);
  }

  @Post('games/:id/versions/:versionId/activate')
  @Roles(Role.ADMIN)
  activateVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.admin.activateVersion(id, versionId);
  }

  @Get('users')
  @Roles(Role.ADMIN)
  listUsers(@Query('q') q?: string) {
    return this.admin.listUsers(q);
  }

  @Patch('users/:id/role')
  @Roles(Role.ADMIN)
  setRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
    return this.admin.setRole(id, dto.role);
  }

  @Get('developer-requests')
  @Roles(Role.ADMIN)
  listDeveloperRequests() {
    return this.admin.listDeveloperRequests();
  }

  @Post('developer-requests/:id/approve')
  @Roles(Role.ADMIN)
  approveDeveloperRequest(
    @Param('id') id: string,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.admin.approveDeveloperRequest(id, p.userId!);
  }

  @Post('developer-requests/:id/reject')
  @Roles(Role.ADMIN)
  rejectDeveloperRequest(
    @Param('id') id: string,
    @Body() dto: RejectDto,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.admin.rejectDeveloperRequest(id, p.userId!, dto.reason);
  }

  @Delete('scores/:id')
  deleteScore(@Param('id') id: string) {
    return this.admin.deleteScore(id);
  }

  @Patch('comments/:id')
  setCommentStatus(@Param('id') id: string, @Body() dto: CommentStatusDto) {
    return this.admin.setCommentStatus(id, dto.status);
  }
}
