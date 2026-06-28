import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PaginationDto } from '../config/pagination.dto';
import { Roles } from '../config/roles.decorator';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';
import { Employee } from './employee.entity';

// Proyección segura para no-admin (los pickers de "responsable" solo necesitan
// identificación + nombres). Oculta datos sensibles: salario, DPI, fecha de
// nacimiento y datos de contacto. El admin recibe el registro completo.
function publicEmployee(e: Employee) {
  return {
    id: e.id,
    firstName: e.firstName,
    secondName: e.secondName,
    lastName: e.lastName,
    surName: e.surName,
  };
}

// Lectura abierta a cualquier usuario autenticado (se usa como catálogo de
// personas en los formularios); la escritura y los datos sensibles son admin-only.
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    const result = await this.service.findAll(query);
    if (user.roles.includes('admin')) return result;
    return { ...result, items: result.items.map(publicEmployee) };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const employee = await this.service.findOne(id);
    return user.roles.includes('admin') ? employee : publicEmployee(employee);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
