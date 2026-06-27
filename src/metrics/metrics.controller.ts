import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsFilterDto } from './dto/metrics-filter.dto';
import { Roles } from '../config/roles.decorator';

@Controller('metrics')
@Roles('admin')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  overview() {
    return this.metricsService.overview();
  }

  @Get('commercial')
  commercial(@Query() filter: MetricsFilterDto) {
    return this.metricsService.commercial(filter);
  }

  @Get('pipeline')
  pipeline(@Query() filter: MetricsFilterDto) {
    return this.metricsService.pipeline(filter);
  }

  @Get('contacts')
  contacts(@Query() filter: MetricsFilterDto) {
    return this.metricsService.contacts(filter);
  }

  @Get('requests')
  requests(@Query() filter: MetricsFilterDto) {
    return this.metricsService.requests(filter);
  }

  @Get('recruitment/funnel')
  recruitmentFunnel(@Query() filter: MetricsFilterDto) {
    return this.metricsService.recruitmentFunnel(filter);
  }

  @Get('placements')
  placements(@Query() filter: MetricsFilterDto) {
    return this.metricsService.placements(filter);
  }

  @Get('charts/by-client')
  chartByClient(@Query() filter: MetricsFilterDto) {
    return this.metricsService.chartByClient(filter);
  }

  @Get('charts/by-sector')
  chartBySector(@Query() filter: MetricsFilterDto) {
    return this.metricsService.chartBySector(filter);
  }

  @Get('charts/by-area')
  chartByArea(@Query() filter: MetricsFilterDto) {
    return this.metricsService.chartByArea(filter);
  }
}
