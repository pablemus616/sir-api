import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { SectorsModule } from './sectors/sectors.module';
import { PositionAreasModule } from './position-areas/position-areas.module';
import { ContactTypesModule } from './contact-types/contact-types.module';
import { PipelineStagesModule } from './pipeline-stages/pipeline-stages.module';
import { EmployeesModule } from './employees/employees.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { ClientContactsModule } from './client-contacts/client-contacts.module';
import { ContactHistoryModule } from './contact-history/contact-history.module';
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
import { SnakeNamingStrategy } from './config/snake-naming.strategy';
import { JwtTokenService } from './config/jwt.service';
import { JwtAuthGuard } from './config/jwt-auth.guard';
import { RolesGuard } from './config/roles.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
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
    ContactRequestsModule,
    CatalogsModule,
    PermissionsModule,
    RolesModule,
    UsersModule,
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
