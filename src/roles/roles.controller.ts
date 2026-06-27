import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AddRolePermissionDto } from './dto/add-role-permission.dto';
import { PaginationDto } from '../config/pagination.dto';
import { Roles } from '../config/roles.decorator';

@Roles('admin')
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/permissions')
  addPermission(@Param('id', ParseIntPipe) id: number, @Body() dto: AddRolePermissionDto) {
    return this.service.addPermission(id, dto);
  }

  @Delete(':id/permissions/:permId')
  removePermission(@Param('id', ParseIntPipe) id: number, @Param('permId', ParseIntPipe) permId: number) {
    return this.service.removePermission(id, permId);
  }
}
