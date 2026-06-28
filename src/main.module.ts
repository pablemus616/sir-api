import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { MetricsModule } from './metrics/metrics.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { SectorsModule } from './sectors/sectors.module';
import { PositionAreasModule } from './position-areas/position-areas.module';
import { ContactTypesModule } from './contact-types/contact-types.module';
import { PipelineStagesModule } from './pipeline-stages/pipeline-stages.module';
import { EmployeesModule } from './employees/employees.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { ClientContactsModule } from './client-contacts/client-contacts.module';
import { ContactHistoryModule } from './contact-history/contact-history.module';
import { CandidateContactsModule } from './candidate-contacts/candidate-contacts.module';
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
import { CandidatesModule } from './candidates/candidates.module';
import { ApplicationsModule } from './applications/applications.module';
import { PlacementsModule } from './placements/placements.module';
import { SnakeNamingStrategy } from './config/snake-naming.strategy';
import { JwtTokenService } from './config/jwt.service';
import { JwtAuthGuard } from './config/jwt-auth.guard';
import { RolesGuard } from './config/roles.guard';

@Module({
  imports: [
    // 20/min era demasiado bajo para una SPA (cada carga dispara muchas queries
    // de catálogos/charts) -> 429 en uso normal. 300/min da margen holgado.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('PG_HOST'),
        username: configService.get('PG_USER'),
        password: configService.get('PG_PASS'),
        database: configService.get('PG_DB'),
        synchronize: configService.get('NODE_ENV') !== 'production',
        migrationsRun: false,
        autoLoadEntities: true,
        namingStrategy: new SnakeNamingStrategy(),
        ssl: { rejectUnauthorized: false },
        logging: ['error', 'warn'],
      }),
    }),
    AuthModule,
    SectorsModule,
    PositionAreasModule,
    ContactTypesModule,
    PipelineStagesModule,
    EmployeesModule,
    ClientsModule,
    ClientContactsModule,
    ContactHistoryModule,
    CandidateContactsModule,
    ContactRequestsModule,
    PermissionsModule,
    RolesModule,
    UsersModule,
    OpportunitiesModule,
    CandidatesModule,
    ApplicationsModule,
    PlacementsModule,
    MetricsModule,
  ],
  controllers: [],
  providers: [
    JwtTokenService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class MainModule {}
