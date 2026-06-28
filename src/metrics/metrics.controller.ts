import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsFilterDto } from './dto/metrics-filter.dto';
import { Roles } from '../config/roles.decorator';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  private isAdmin(user: AuthUser): boolean {
    return user.roles.includes('admin');
  }

  /**
   * Admin: filtros tal cual (vista global). No-admin: fuerza el scope al propio
   * empleado (responsable de oportunidades + recruiter de placements + autor de
   * contactos) para que solo vea sus propias métricas, ignorando cualquier
   * override de propietario que venga en el query.
   */
  private scope(filter: MetricsFilterDto, user: AuthUser): MetricsFilterDto {
    if (this.isAdmin(user)) return filter;
    return {
      ...filter,
      responsibleEmployeeId: user.employeeId,
      recruiterId: user.employeeId,
    };
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.metricsService.overview(
      this.isAdmin(user) ? undefined : user.employeeId,
    );
  }

  @Get('commercial')
  commercial(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.commercial(this.scope(filter, user));
  }

  @Get('pipeline')
  pipeline(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.pipeline(this.scope(filter, user));
  }

  @Get('contacts')
  contacts(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.contacts(this.scope(filter, user));
  }

  // Estadísticas globales del buzón de solicitudes — solo admin (no per-persona).
  @Get('requests')
  @Roles('admin')
  requests(@Query() filter: MetricsFilterDto) {
    return this.metricsService.requests(filter);
  }

  @Get('recruitment/funnel')
  recruitmentFunnel(
    @Query() filter: MetricsFilterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.metricsService.recruitmentFunnel(this.scope(filter, user));
  }

  @Get('placements')
  placements(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.placements(this.scope(filter, user));
  }

  @Get('charts/by-client')
  chartByClient(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.chartByClient(this.scope(filter, user));
  }

  @Get('charts/by-sector')
  chartBySector(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.chartBySector(this.scope(filter, user));
  }

  @Get('charts/by-area')
  chartByArea(@Query() filter: MetricsFilterDto, @CurrentUser() user: AuthUser) {
    return this.metricsService.chartByArea(this.scope(filter, user));
  }
}
