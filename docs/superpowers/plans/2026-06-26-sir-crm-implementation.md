# SIR — CRM Outsourcing RRHH — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend del CRM SIR: pipeline comercial unificado (oportunidades) + reclutamiento + auth JWT con RBAC + métricas/dashboard, sobre el esquema Postgres existente.

**Architecture:** NestJS 11 + Fastify, un módulo por subsistema dueño de su entity (TypeORM 1.0, autoLoadEntities). Auth por JWT Bearer (access corto stateless + refresh opaco rotable en sessions) y guards globales por rol. Todas las agregaciones de métricas con QueryBuilder. Implementación faseada (§18 del spec).

**Tech Stack:** NestJS 11, @nestjs/platform-fastify, TypeORM 1.0 + Postgres (pg), class-validator/class-transformer, jsonwebtoken, bcrypt, @nestjs/throttler, jest + supertest, pnpm.

## Global Constraints

- SIN COMENTARIOS en el código (cero comentarios, incluidos los tests).
- SOLO métodos de TypeORM (repository / createQueryBuilder). PROHIBIDO SQL crudo y entityManager.query con strings SQL, incluidas las métricas.
- NestJS 11 + Fastify; TypeORM 1.0 + Postgres. Gestor de paquetes: pnpm.
- Controllers retornan dato crudo; GlobalResponseInterceptor envuelve como { ok, message, data }; GlobalExceptionFilter normaliza errores como { ok:false, message, path }.
- ValidationPipe global (whitelist + forbidNonWhitelisted + transform): cada DTO declara todas sus props.
- Prefijo global /api; ThrottlerGuard global.
- synchronize: NODE_ENV !== 'production'; SnakeNamingStrategy (props camelCase, columnas snake_case).
- PK numérica @PrimaryGeneratedColumn() (number) en todas las entities salvo Session (uuid default uuidv7()).
- Dinero nuevo en numeric(14,2) con ColumnNumericTransformer (number en JS); moneda GTQ por defecto.
- Lista paginada estándar: { items, total, page, limit } (PaginationDto page=1/limit=20).
- contact_history: relación contactType con @JoinColumn({ name: 'contact_type' }); clients conserva columna text sector (legacy) y añade sectorId + relación sectorCatalog.
- Orden APP_GUARD: ThrottlerGuard -> JwtAuthGuard -> RolesGuard.

---


## Fase 1 — Cimientos

### Task 1.1: SnakeNamingStrategy + synchronize por entorno en main.module

**Files:**
- Create: `src/config/snake-naming.strategy.ts`
- Test: `src/config/snake-naming.strategy.spec.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Produces: `class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface` (mapea `firstName <-> first_name`, `employeeId <-> employee_id`, respeta `customName` de `@Column({ name })` / `@JoinColumn({ name })`).
- Consumes (en `main.module.ts`): `ConfigService.get('NODE_ENV')`.

- [ ] **Step 1: Escribe el test que falla** (`src/config/snake-naming.strategy.spec.ts`)
```ts
import { SnakeNamingStrategy } from './snake-naming.strategy';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('convierte el nombre de clase a snake_case cuando no hay customName', () => {
    expect(strategy.tableName('Opportunity', undefined as unknown as string)).toBe('opportunity');
  });

  it('respeta el customName de tabla', () => {
    expect(strategy.tableName('Opportunity', 'opportunities')).toBe('opportunities');
  });

  it('convierte propiedades camelCase a columnas snake_case', () => {
    expect(strategy.columnName('firstName', undefined as unknown as string, [])).toBe('first_name');
    expect(strategy.columnName('employeeId', undefined as unknown as string, [])).toBe('employee_id');
  });

  it('respeta el customName de columna (JoinColumn name)', () => {
    expect(strategy.columnName('contactType', 'contact_type', [])).toBe('contact_type');
  });

  it('genera FKs e índices de join en snake_case', () => {
    expect(strategy.joinColumnName('employee', 'id')).toBe('employee_id');
    expect(strategy.joinTableColumnName('role', 'id')).toBe('role_id');
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**
```bash
pnpm test -- src/config/snake-naming.strategy.spec.ts
```
Esperado: falla en compilación / `Cannot find module './snake-naming.strategy'`.

- [ ] **Step 3: Implementa la estrategia** (`src/config/snake-naming.strategy.ts`)
```ts
import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';

export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName: string): string {
    return customName ? customName : snakeCase(className);
  }

  columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    return (
      snakeCase(embeddedPrefixes.concat('').join('_')) +
      (customName ? customName : snakeCase(propertyName))
    );
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(relationName + '_' + referencedColumnName);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return snakeCase(
      firstTableName +
        '_' +
        firstPropertyName.replace(/\./gi, '_') +
        '_' +
        secondTableName,
    );
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(tableName + '_' + (columnName ? columnName : propertyName));
  }

  classTableInheritanceParentColumnName(
    parentTableName: string,
    parentTableIdPropertyName: string,
  ): string {
    return snakeCase(parentTableName + '_' + parentTableIdPropertyName);
  }

  eagerJoinRelationAlias(alias: string, propertyPath: string): string {
    return alias + '__' + propertyPath.replace('.', '_');
  }
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**
```bash
pnpm test -- src/config/snake-naming.strategy.spec.ts
```
Esperado: `Tests: 5 passed`.

- [ ] **Step 5: Cablea la estrategia y synchronize por entorno en `src/main.module.ts`**
Añade el import bajo los existentes:
```ts
import { SnakeNamingStrategy } from './config/snake-naming.strategy';
```
Reemplaza el bloque `useFactory` por:
```ts
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
        ssl: {
          rejectUnauthorized: false,
        },
        logging: ['error', 'warn'],
      }),
```

- [ ] **Step 6: Verifica que el proyecto compila**
```bash
pnpm build
```
Esperado: build sin errores de TypeScript.

- [ ] **Step 7: Commit**
```bash
git add src/config/snake-naming.strategy.ts src/config/snake-naming.strategy.spec.ts src/main.module.ts
git commit -m "feat(config): add SnakeNamingStrategy and env-based synchronize"
```

### Task 1.2: ColumnNumericTransformer para dinero numeric(14,2)

**Files:**
- Create: `src/config/numeric.transformer.ts`
- Test: `src/config/numeric.transformer.spec.ts`

**Interfaces:**
- Produces: `class ColumnNumericTransformer implements ValueTransformer` con `to(value: number | null | undefined): number | null` y `from(value: string | null | undefined): number | null`. Consumido por las columnas `@Column('numeric', { precision: 14, scale: 2, transformer: new ColumnNumericTransformer() })` de las entities de dinero nuevas (Fase 2+).

- [ ] **Step 1: Escribe el test que falla** (`src/config/numeric.transformer.spec.ts`)
```ts
import { ColumnNumericTransformer } from './numeric.transformer';

describe('ColumnNumericTransformer', () => {
  const transformer = new ColumnNumericTransformer();

  it('from parsea el string de Postgres a number', () => {
    expect(transformer.from('1500.50')).toBe(1500.5);
  });

  it('from devuelve null cuando el valor es null o undefined', () => {
    expect(transformer.from(null)).toBeNull();
    expect(transformer.from(undefined)).toBeNull();
  });

  it('to deja pasar el number hacia la columna', () => {
    expect(transformer.to(2000)).toBe(2000);
  });

  it('to devuelve null cuando el valor es null o undefined', () => {
    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**
```bash
pnpm test -- src/config/numeric.transformer.spec.ts
```
Esperado: falla con `Cannot find module './numeric.transformer'`.

- [ ] **Step 3: Implementa el transformer** (`src/config/numeric.transformer.ts`)
```ts
import { ValueTransformer } from 'typeorm';

export class ColumnNumericTransformer implements ValueTransformer {
  to(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value;
  }

  from(value: string | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return parseFloat(value);
  }
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**
```bash
pnpm test -- src/config/numeric.transformer.spec.ts
```
Esperado: `Tests: 4 passed`.

- [ ] **Step 5: Commit**
```bash
git add src/config/numeric.transformer.ts src/config/numeric.transformer.spec.ts
git commit -m "feat(config): add ColumnNumericTransformer for money columns"
```

### Task 1.3: PaginationDto + Paginated<T> + helper skip/take

**Files:**
- Create: `src/config/pagination.dto.ts`
- Test: `src/config/pagination.dto.spec.ts`

**Interfaces:**
- Produces: `class PaginationDto { page: number = 1; limit: number = 20 }` (con `@Type(() => Number) @IsInt() @Min(1) @IsOptional()`); `interface Paginated<T> { items: T[]; total: number; page: number; limit: number }`; `function getSkipTake(pagination: PaginationDto): { skip: number; take: number }`. Consumido por todos los services con listados paginados (Fases 3-6).

- [ ] **Step 1: Escribe el test que falla** (`src/config/pagination.dto.spec.ts`)
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto, getSkipTake } from './pagination.dto';

describe('PaginationDto', () => {
  it('aplica defaults page=1 limit=20', () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('transforma strings de query a number', async () => {
    const dto = plainToInstance(PaginationDto, { page: '3', limit: '50' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza page menor a 1', async () => {
    const dto = plainToInstance(PaginationDto, { page: '0' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('getSkipTake calcula skip=(page-1)*limit y take=limit', () => {
    expect(getSkipTake(plainToInstance(PaginationDto, { page: '3', limit: '20' }))).toEqual({
      skip: 40,
      take: 20,
    });
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**
```bash
pnpm test -- src/config/pagination.dto.spec.ts
```
Esperado: falla con `Cannot find module './pagination.dto'`.

- [ ] **Step 3: Implementa el DTO, el tipo y el helper** (`src/config/pagination.dto.ts`)
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function getSkipTake(pagination: PaginationDto): {
  skip: number;
  take: number;
} {
  const page = pagination.page ?? 1;
  const limit = pagination.limit ?? 20;
  return { skip: (page - 1) * limit, take: limit };
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**
```bash
pnpm test -- src/config/pagination.dto.spec.ts
```
Esperado: `Tests: 4 passed`.

- [ ] **Step 5: Commit**
```bash
git add src/config/pagination.dto.ts src/config/pagination.dto.spec.ts
git commit -m "feat(config): add PaginationDto, Paginated type and skip/take helper"
```

### Task 1.4: .env.example documentando todas las variables (§15)

**Files:**
- Create: `.env.example`

**Interfaces:**
- Produces: plantilla de entorno con todas las vars de §15. Consumida por `ConfigService` en `main.module.ts` (`PG_*`, `NODE_ENV`) y por Fase 2 (`JWT_*`, `INBOUND_API_KEY`, `SEED_ADMIN_*`).

- [ ] **Step 1: Crea el archivo** (`.env.example`)
```ts
PORT=3000
NODE_ENV=development

PG_HOST=localhost
PG_USER=siradmin
PG_PASS=change_me
PG_DB=sir_dev

JWT_ACCESS_SECRET=change_me_access_secret
JWT_REFRESH_SECRET=change_me_refresh_secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

INBOUND_API_KEY=change_me_inbound_api_key

SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=change_me_admin_password
```

- [ ] **Step 2: Verifica que las vars de §15 estén completas**
```bash
grep -E "^(PORT|NODE_ENV|PG_HOST|PG_USER|PG_PASS|PG_DB|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|JWT_ACCESS_TTL|JWT_REFRESH_TTL|INBOUND_API_KEY|SEED_ADMIN_USERNAME|SEED_ADMIN_PASSWORD)=" .env.example | wc -l
```
Esperado: `13`.

- [ ] **Step 3: Commit**
```bash
git add .env.example
git commit -m "docs(config): add .env.example documenting all environment variables"
```

### Task 1.5: Verificación de arranque no destructivo (logging schema)

**Files:**
- Modify: `src/main.module.ts` (toggle temporal de `logging` a `['schema']`, luego revertir)

**Interfaces:**
- Consumes: `synchronize` por entorno y `SnakeNamingStrategy` ya cableados (Task 1.1). Esta tarea no produce artefactos; valida que `synchronize` con la config nueva NO emite `ALTER`/`DROP` sobre tablas existentes (`roles`, `permissions`, `employees`, `users`, `sessions`, `clients`, `client_contacts`, `contact_types`, `contact_history`, `contact_requests`), solo `CREATE TABLE` de tablas nuevas.

- [ ] **Step 1: Activa temporalmente el logging de schema en `src/main.module.ts`**
Cambia la línea de `logging`:
```ts
        logging: ['schema'],
```

- [ ] **Step 2: Arranca la app en dev y captura los logs de schema**
`NODE_ENV` no está seteado (o es `development`), por lo que `synchronize` es `true`. Comando (fish):
```bash
env NODE_ENV=development pnpm start 2>&1 | tee /tmp/claude-1000/-home-plemus-sir-api/21c56914-f92f-4709-9f77-f5da0ee29e5a/scratchpad/schema-boot.log
```
Esperado: la app levanta (`Nest application successfully started`) sin excepciones de TypeORM.

- [ ] **Step 3: Revisa que NO haya DDL destructivo sobre tablas existentes**
En otra terminal, sobre el log capturado:
```bash
grep -Ei "ALTER TABLE|DROP TABLE|DROP COLUMN|DROP CONSTRAINT" /tmp/claude-1000/-home-plemus-sir-api/21c56914-f92f-4709-9f77-f5da0ee29e5a/scratchpad/schema-boot.log
```
Esperado: SIN coincidencias (exit 1, ninguna línea). Qué revisar: en esta fase aún no hay entities nuevas, por lo que `synchronize` no debe emitir `CREATE TABLE` ni `ALTER`; lo crítico es que el mapeo (`SnakeNamingStrategy`) no genere diffs sobre las tablas existentes. Si aparece algún `ALTER`/`DROP`, indica desalineación de `@JoinColumn`/columnas que se corrige antes de avanzar. Repetir esta misma verificación tras cada lote de entities de la Fase 2.

- [ ] **Step 4: Detén la app y revierte el logging en `src/main.module.ts`**
Vuelve la línea a:
```ts
        logging: ['error', 'warn'],
```

- [ ] **Step 5: Confirma que el árbol queda limpio salvo cambios ya commiteados**
```bash
git status --porcelain src/main.module.ts
```
Esperado: sin salida (sin cambios pendientes en `main.module.ts`).

- [ ] **Step 6: Commit**
```bash
git commit --allow-empty -m "chore(config): verify non-destructive synchronize on first boot"
```

### Task 2.1: Enums de dominio

**Files:**
- Create `src/config/enums.ts`

**Interfaces:**
- Produces `CandidateStatus`, `Seniority`, `OpportunityStatus`, `ApplicationStage`, `PlacementStatus`, `ContactDirection` (enums TS con valores string del §7.7). El `ColumnNumericTransformer` ya existe (Task 1.2); las entities de dinero lo importan de `src/config/numeric.transformer.ts`.

- [ ] **Step 1: Escribe los 6 enums en `src/config/enums.ts`**
```ts
export enum CandidateStatus {
  NEW = 'new',
  ACTIVE = 'active',
  PLACED = 'placed',
  ON_HOLD = 'on_hold',
  DISCARDED = 'discarded',
}

export enum Seniority {
  JUNIOR = 'junior',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
}

export enum OpportunityStatus {
  OPEN = 'open',
  WON = 'won',
  LOST = 'lost',
}

export enum ApplicationStage {
  APPLIED = 'applied',
  SCREENING = 'screening',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  HIRED = 'hired',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

export enum PlacementStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export enum ContactDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}
```

- [ ] **Step 2: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 3: Commit**
  - Comando: `git add src/config/enums.ts && git commit -m "feat(config): add domain enums"`

---

### Task 2.2: Entities sin dependencias (Employee, ContactType, Sector, PositionArea, PipelineStage)

**Files:**
- Create `src/employees/employee.entity.ts`
- Create `src/contact-types/contact-type.entity.ts`
- Create `src/sectors/sector.entity.ts`
- Create `src/position-areas/position-area.entity.ts`
- Create `src/pipeline-stages/pipeline-stage.entity.ts`

**Interfaces:**
- Produces `Employee` (tabla `employees`, PK number, `salary?` legacy `double precision`).
- Produces `ContactType` (tabla `contact_types`).
- Produces `Sector` (tabla `sectors`, `name` unique, `active` default true).
- Produces `PositionArea` (tabla `position_areas`, `name` unique, `active` default true).
- Produces `PipelineStage` (tabla `pipeline_stages`).

- [ ] **Step 1: Escribe `src/employees/employee.entity.ts`**
```ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  firstName: string;

  @Column({ type: 'text', nullable: true })
  secondName?: string;

  @Column({ type: 'text' })
  lastName: string;

  @Column({ type: 'text', nullable: true })
  surName?: string;

  @Column({ type: 'text', nullable: true })
  nationalId?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ type: 'date', nullable: true })
  hireDate?: string;

  @Column({ type: 'double precision', nullable: true })
  salary?: number;
}
```

- [ ] **Step 2: Escribe `src/contact-types/contact-type.entity.ts`**
```ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('contact_types')
export class ContactType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;
}
```

- [ ] **Step 3: Escribe `src/sectors/sector.entity.ts` (patrón catálogo: name unique + active)**
```ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('sectors')
export class Sector {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
```

- [ ] **Step 4: Escribe `src/position-areas/position-area.entity.ts` (mismo patrón catálogo; sólo cambian clase y tabla)**
```ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('position_areas')
export class PositionArea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
```

- [ ] **Step 5: Escribe `src/pipeline-stages/pipeline-stage.entity.ts`**
```ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('pipeline_stages')
export class PipelineStage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'int' })
  sortOrder: number;

  @Column({ type: 'smallint' })
  probability: number;

  @Column({ type: 'boolean', default: false })
  isWon: boolean;

  @Column({ type: 'boolean', default: false })
  isLost: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
```

- [ ] **Step 6: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 7: Commit**
  - Comando: `git add src/employees/employee.entity.ts src/contact-types/contact-type.entity.ts src/sectors/sector.entity.ts src/position-areas/position-area.entity.ts src/pipeline-stages/pipeline-stage.entity.ts && git commit -m "feat(entities): add employee, contact-type and dimension catalog entities"`

---

### Task 2.3: Entities de identidad y RBAC (Role, Permission, User, Session)

**Files:**
- Create `src/roles/role.entity.ts`
- Create `src/roles/permission.entity.ts`
- Create `src/users/user.entity.ts`
- Create `src/auth/session.entity.ts`

**Interfaces:**
- Consumes `Employee` (`src/employees/employee.entity.ts`).
- Produces `Role` (M:N `permissions` con `@JoinTable('role_permissions')`; inverse M:N `users`).
- Produces `Permission` (M:N inverse `roles`).
- Produces `User` (tabla `users`, `username` unique, `employeeId` + `employee` ManyToOne, M:N `roles` con `@JoinTable('user_roles')`).
- Produces `Session` (tabla `sessions`, `id` uuid via `@PrimaryColumn`, `userId` + `user` ManyToOne, `token` unique).

- [ ] **Step 1: Escribe `src/roles/role.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Permission } from './permission.entity';
import { User } from '../users/user.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @ManyToMany(() => Permission, (permission) => permission.roles)
  @JoinTable({ name: 'role_permissions' })
  permissions: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
```

- [ ] **Step 2: Escribe `src/roles/permission.entity.ts`**
```ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Role } from './role.entity';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
```

- [ ] **Step 3: Escribe `src/users/user.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Role } from '../roles/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  username: string;

  @Column({ type: 'text' })
  password: string;

  @Column()
  employeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];
}
```

- [ ] **Step 4: Escribe `src/auth/session.entity.ts` (PK uuid mapeada, default uuidv7 de la BD)**
```ts
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('sessions')
export class Session {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', unique: true })
  token: string;

  @Column({ type: 'timestamptz' })
  creationDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  refreshedAt?: Date;

  @Column({ type: 'text', nullable: true })
  ip?: string;
}
```

- [ ] **Step 5: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 6: Commit**
  - Comando: `git add src/roles/role.entity.ts src/roles/permission.entity.ts src/users/user.entity.ts src/auth/session.entity.ts && git commit -m "feat(entities): add role, permission, user and session entities with rbac wiring"`

---

### Task 2.4: Entities de clientes e inbound (Client, ClientContact, ContactRequest)

**Files:**
- Create `src/clients/client.entity.ts`
- Create `src/client-contacts/client-contact.entity.ts`
- Create `src/contact-requests/contact-request.entity.ts`

**Interfaces:**
- Consumes `Sector`, `Employee`.
- Produces `Client` (tabla `clients`, `sector?` text legacy + `sectorId?` + `sectorCatalog?` ManyToOne `@JoinColumn('sector_id')`; OneToMany `contacts`).
- Produces `ClientContact` (tabla `client_contacts`, `clientId` + `client` ManyToOne).
- Produces `ContactRequest` (tabla `contact_requests`, `wasHandled` default false, `createdAt` `@CreateDateColumn`, `handledBy?`/`resultingClient?` ManyToOne).

- [ ] **Step 1: Escribe `src/clients/client.entity.ts` (conserva `sector` text legacy + añade `sectorCatalog`)**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Sector } from '../sectors/sector.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  sector?: string;

  @Column({ nullable: true })
  sectorId?: number;

  @ManyToOne(() => Sector, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sectorCatalog?: Sector;

  @Column({ type: 'int', nullable: true })
  employeeSize?: number;

  @OneToMany(() => ClientContact, (contact) => contact.client)
  contacts: ClientContact[];
}
```

- [ ] **Step 2: Escribe `src/client-contacts/client-contact.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';

@Entity('client_contacts')
export class ClientContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column()
  clientId: number;

  @ManyToOne(() => Client, (client) => client.contacts)
  @JoinColumn({ name: 'client_id' })
  client: Client;
}
```

- [ ] **Step 3: Escribe `src/contact-requests/contact-request.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Client } from '../clients/client.entity';

@Entity('contact_requests')
export class ContactRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  contactName?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  requestDesc?: string;

  @Column({ type: 'boolean', default: false })
  wasHandled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ nullable: true })
  handledByEmployeeId?: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'handled_by_employee_id' })
  handledBy?: Employee;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt?: Date;

  @Column({ nullable: true })
  resultingClientId?: number;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'resulting_client_id' })
  resultingClient?: Client;
}
```

- [ ] **Step 4: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 5: Commit**
  - Comando: `git add src/clients/client.entity.ts src/client-contacts/client-contact.entity.ts src/contact-requests/contact-request.entity.ts && git commit -m "feat(entities): add client, client-contact and contact-request entities"`

---

### Task 2.5: Entity Opportunity (pipeline comercial unificado)

**Files:**
- Create `src/opportunities/opportunity.entity.ts`

**Interfaces:**
- Consumes `Client`, `PositionArea`, `Employee`, `ClientContact`, `PipelineStage`, `ContactRequest`, `ColumnNumericTransformer`, `Seniority`, `OpportunityStatus`.
- Produces `Opportunity` (tabla `opportunities`; FKs escalares explícitas; `amount?` numeric(14,2) con transformer; `currency` default `'GTQ'`; `status` enum default `open`; `createdAt` `@CreateDateColumn`; `updatedAt` `@UpdateDateColumn`).

- [ ] **Step 1: Escribe `src/opportunities/opportunity.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { Employee } from '../employees/employee.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { Seniority, OpportunityStatus } from '../config/enums';

@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  clientId: number;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ nullable: true })
  areaId?: number;

  @ManyToOne(() => PositionArea, { nullable: true })
  @JoinColumn({ name: 'area_id' })
  area?: PositionArea;

  @Column()
  responsibleEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'responsible_employee_id' })
  responsibleEmployee: Employee;

  @Column({ nullable: true })
  clientContactId?: number;

  @ManyToOne(() => ClientContact, { nullable: true })
  @JoinColumn({ name: 'client_contact_id' })
  clientContact?: ClientContact;

  @Column()
  pipelineStageId: number;

  @ManyToOne(() => PipelineStage)
  @JoinColumn({ name: 'pipeline_stage_id' })
  pipelineStage: PipelineStage;

  @Column({ nullable: true })
  originContactRequestId?: number;

  @ManyToOne(() => ContactRequest, { nullable: true })
  @JoinColumn({ name: 'origin_contact_request_id' })
  originContactRequest?: ContactRequest;

  @Column({ type: 'text', nullable: true })
  title?: string;

  @Column({
    type: 'enum',
    enum: Seniority,
    enumName: 'seniority',
    nullable: true,
  })
  seniority?: Seniority;

  @Column({ type: 'int', default: 1 })
  headcount: number;

  @Column({ type: 'smallint', default: 0 })
  probability: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  amount?: number;

  @Column({ type: 'text', default: 'GTQ' })
  currency: string;

  @Column({
    type: 'enum',
    enum: OpportunityStatus,
    enumName: 'opportunity_status',
    default: OpportunityStatus.OPEN,
  })
  status: OpportunityStatus;

  @Column({ type: 'text', nullable: true })
  source?: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastContactAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  nextFollowUpAt?: Date;

  @Column({ type: 'date', nullable: true })
  expectedCloseDate?: string;

  @Column({ type: 'timestamptz', nullable: true })
  proposalSentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  wonAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lostAt?: Date;

  @Column({ type: 'text', nullable: true })
  lostReason?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 3: Commit**
  - Comando: `git add src/opportunities/opportunity.entity.ts && git commit -m "feat(entities): add opportunity pipeline entity"`

---

### Task 2.6: Entity ContactHistory (monitoreo de forma de contacto)

**Files:**
- Create `src/contact-history/contact-history.entity.ts`

**Interfaces:**
- Consumes `Employee`, `ClientContact`, `ContactType`, `Opportunity`, `ContactDirection`.
- Produces `ContactHistory` (tabla `contact_history`; FK al tipo es la columna `contact_type` SIN `_id` via `@JoinColumn({ name: 'contact_type' })`; `callLength?` = duración; `direction?` enum `contact_direction`; `opportunityId?` + `opportunity?` ManyToOne).

- [ ] **Step 1: Escribe `src/contact-history/contact-history.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactDirection } from '../config/enums';

@Entity('contact_history')
export class ContactHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column()
  contactId: number;

  @ManyToOne(() => ClientContact)
  @JoinColumn({ name: 'contact_id' })
  contact: ClientContact;

  @ManyToOne(() => ContactType)
  @JoinColumn({ name: 'contact_type' })
  contactType: ContactType;

  @Column({ type: 'timestamptz' })
  contactTime: Date;

  @Column({ type: 'int', nullable: true })
  callLength?: number;

  @Column({ type: 'text', nullable: true })
  contactDesc?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumberDialed?: string;

  @Column({
    type: 'enum',
    enum: ContactDirection,
    enumName: 'contact_direction',
    nullable: true,
  })
  direction?: ContactDirection;

  @Column({ nullable: true })
  opportunityId?: number;

  @ManyToOne(() => Opportunity, { nullable: true })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity?: Opportunity;
}
```

- [ ] **Step 2: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 3: Commit**
  - Comando: `git add src/contact-history/contact-history.entity.ts && git commit -m "feat(entities): add contact-history entity with contact_type join column"`

---

### Task 2.7: Entities de reclutamiento (Candidate, Application, Placement)

**Files:**
- Create `src/candidates/candidate.entity.ts`
- Create `src/applications/application.entity.ts`
- Create `src/placements/placement.entity.ts`

**Interfaces:**
- Consumes `Opportunity`, `Employee`, `ColumnNumericTransformer`, `CandidateStatus`, `ApplicationStage`, `PlacementStatus`.
- Produces `Candidate` (tabla `candidates`, `expectedSalary?` numeric con transformer, `status` enum default `new`, `createdAt` `@CreateDateColumn`).
- Produces `Application` (tabla `applications`, `@Unique(['candidateId','opportunityId'])`, `stage` enum default `applied`, `appliedAt` `@CreateDateColumn`, `updatedAt` `@UpdateDateColumn`).
- Produces `Placement` (tabla `placements`, `agreedSalary?`/`fee?` numeric con transformer, `status` enum default `active`, `createdAt` `@CreateDateColumn`).

- [ ] **Step 1: Escribe `src/candidates/candidate.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { CandidateStatus } from '../config/enums';

@Entity('candidates')
export class Candidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  firstName: string;

  @Column({ type: 'text', nullable: true })
  secondName?: string;

  @Column({ type: 'text' })
  lastName: string;

  @Column({ type: 'text', nullable: true })
  surName?: string;

  @Column({ type: 'text', nullable: true })
  nationalId?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ type: 'text', nullable: true })
  headline?: string;

  @Column({ type: 'text', nullable: true })
  source?: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  expectedSalary?: number;

  @Column({
    type: 'enum',
    enum: CandidateStatus,
    enumName: 'candidate_status',
    default: CandidateStatus.NEW,
  })
  status: CandidateStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Escribe `src/applications/application.entity.ts` (UNIQUE candidate+opportunity)**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';
import { ApplicationStage } from '../config/enums';

@Entity('applications')
@Unique(['candidateId', 'opportunityId'])
export class Application {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  candidateId: number;

  @ManyToOne(() => Candidate)
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column()
  opportunityId: number;

  @ManyToOne(() => Opportunity)
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @Column({ nullable: true })
  referredByEmployeeId?: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'referred_by_employee_id' })
  referredBy?: Employee;

  @Column({
    type: 'enum',
    enum: ApplicationStage,
    enumName: 'application_stage',
    default: ApplicationStage.APPLIED,
  })
  stage: ApplicationStage;

  @Column({ type: 'text', nullable: true })
  source?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  appliedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 3: Escribe `src/placements/placement.entity.ts`**
```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Application } from '../applications/application.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { PlacementStatus } from '../config/enums';

@Entity('placements')
export class Placement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  applicationId: number;

  @ManyToOne(() => Application)
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Column()
  candidateId: number;

  @ManyToOne(() => Candidate)
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column()
  opportunityId: number;

  @ManyToOne(() => Opportunity)
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @Column()
  placedByEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'placed_by_employee_id' })
  placedBy: Employee;

  @Column({ type: 'date' })
  placementDate: string;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({ type: 'text', nullable: true })
  endReason?: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  agreedSalary?: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  fee?: number;

  @Column({
    type: 'enum',
    enum: PlacementStatus,
    enumName: 'placement_status',
    default: PlacementStatus.ACTIVE,
  })
  status: PlacementStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 4: Typecheck**
  - Comando: `pnpm exec tsc --noEmit`
  - Esperado: sin errores, exit 0.

- [ ] **Step 5: Commit**
  - Comando: `git add src/candidates/candidate.entity.ts src/applications/application.entity.ts src/placements/placement.entity.ts && git commit -m "feat(entities): add candidate, application and placement entities"`

---

### Task 2.8: Smoke test de metadata de entities

**Files:**
- Test `src/config/entities.metadata.spec.ts`

**Interfaces:**
- Consumes todas las entities (Tasks 2.2–2.7) y `getMetadataArgsStorage` de TypeORM.
- Produces: prueba declarativa que verifica que cada entity registra su tabla y los puntos críticos del contrato (PK uuid de `Session`, `@JoinColumn('contact_type')`, UNIQUE de `Application`).

- [ ] **Step 1: Escribe el test que falla (las entities aún no se importan/registran si se corre antes) en `src/config/entities.metadata.spec.ts`**
```ts
import { getMetadataArgsStorage } from 'typeorm';
import { Role } from '../roles/role.entity';
import { Permission } from '../roles/permission.entity';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { Session } from '../auth/session.entity';
import { Client } from '../clients/client.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Sector } from '../sectors/sector.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';

describe('Entities metadata', () => {
  const storage = getMetadataArgsStorage();
  const entities: Function[] = [
    Role,
    Permission,
    Employee,
    User,
    Session,
    Client,
    ClientContact,
    ContactType,
    ContactHistory,
    ContactRequest,
    Sector,
    PositionArea,
    PipelineStage,
    Opportunity,
    Candidate,
    Application,
    Placement,
  ];

  it('registers a table for every entity', () => {
    for (const entity of entities) {
      const table = storage.tables.find((t) => t.target === entity);
      expect(table).toBeDefined();
    }
  });

  it('maps session id as uuid primary column', () => {
    const pk = storage.columns.find(
      (c) => c.target === Session && c.propertyName === 'id',
    );
    expect(pk?.options.primary).toBe(true);
    expect(pk?.options.type).toBe('uuid');
  });

  it('binds contact history type to the contact_type join column', () => {
    const join = storage.joinColumns.find(
      (j) => j.target === ContactHistory && j.name === 'contact_type',
    );
    expect(join).toBeDefined();
  });

  it('declares the unique candidate and opportunity constraint on application', () => {
    const unique = storage.uniques.find((u) => u.target === Application);
    expect(unique?.columns).toEqual(['candidateId', 'opportunityId']);
  });

  it('uses join tables for role_permissions and user_roles', () => {
    const joinTableNames = storage.joinTables.map((j) => j.name);
    expect(joinTableNames).toContain('role_permissions');
    expect(joinTableNames).toContain('user_roles');
  });
});
```

- [ ] **Step 2: Corre el test y confirma que pasa con las entities ya creadas**
  - Comando: `pnpm test -- entities.metadata`
  - Esperado: `Tests: 5 passed`, suite verde.

- [ ] **Step 3: Commit**
  - Comando: `git add src/config/entities.metadata.spec.ts && git commit -m "test(entities): add metadata smoke test for all domain entities"`


## Fase 2 — Auth & RBAC

### Task 3.1: JwtTokenService (firmar/verificar access, generar/hashear refresh)

**Files:**
- Create: `src/config/jwt.service.ts`
- Test: `src/config/jwt.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (`JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL` def `'15m'`); `jsonwebtoken`; `crypto` (`randomBytes`, `createHash`).
- Produces: `AccessPayload = { sub: number; employeeId: number; roles: string[]; sid: string }`; `JwtTokenService.signAccessToken(payload: AccessPayload): string`; `verifyAccessToken(token: string): AccessPayload`; `generateRefreshToken(): { token: string; tokenHash: string }`; `hashRefreshToken(token: string): string`.

- [ ] **Step 1: Escribe el test que falla** (`src/config/jwt.service.spec.ts`).
```ts
import { ConfigService } from '@nestjs/config';
import { JwtTokenService, AccessPayload } from './jwt.service';

describe('JwtTokenService', () => {
  let service: JwtTokenService;

  const config = {
    get: (key: string) =>
      ({
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_ACCESS_TTL: '15m',
      })[key],
  } as unknown as ConfigService;

  const payload: AccessPayload = {
    sub: 1,
    employeeId: 7,
    roles: ['admin'],
    sid: 'session-1',
  };

  beforeEach(() => {
    service = new JwtTokenService(config);
  });

  it('signs and verifies an access token round-trip', () => {
    const token = service.signAccessToken(payload);
    const decoded = service.verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.employeeId).toBe(payload.employeeId);
    expect(decoded.roles).toEqual(payload.roles);
    expect(decoded.sid).toBe(payload.sid);
  });

  it('throws when verifying a tampered token', () => {
    const token = service.signAccessToken(payload);
    expect(() => service.verifyAccessToken(token + 'x')).toThrow();
  });

  it('generates a refresh token with a matching sha256 hash', () => {
    const { token, tokenHash } = service.generateRefreshToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(tokenHash).toBe(service.hashRefreshToken(token));
  });

  it('hashes refresh tokens deterministically', () => {
    expect(service.hashRefreshToken('abc')).toBe(
      service.hashRefreshToken('abc'),
    );
    expect(service.hashRefreshToken('abc')).not.toBe(
      service.hashRefreshToken('abd'),
    );
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla.**
```
pnpm test -- jwt.service
```
Esperado: falla en compilación / `Cannot find module './jwt.service'`.

- [ ] **Step 3: Implementa lo mínimo** (`src/config/jwt.service.ts`).
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface AccessPayload {
  sub: number;
  employeeId: number;
  roles: string[];
  sid: string;
}

@Injectable()
export class JwtTokenService {
  constructor(private readonly config: ConfigService) {}

  signAccessToken(payload: AccessPayload): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET')!;
    const expiresIn = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const options = { expiresIn } as SignOptions;
    return jwt.sign(payload, secret, options);
  }

  verifyAccessToken(token: string): AccessPayload {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET')!;
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return {
      sub: decoded.sub as unknown as number,
      employeeId: decoded.employeeId as number,
      roles: decoded.roles as string[],
      sid: decoded.sid as string,
    };
  }

  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
```

- [ ] **Step 4: Corre el test y confirma que pasa.**
```
pnpm test -- jwt.service
```
Esperado: `4 passed`.

- [ ] **Step 5: Commit.**
```
git add src/config/jwt.service.ts src/config/jwt.service.spec.ts
git commit -m "feat(auth): add JwtTokenService for access and refresh tokens"
```

### Task 3.2: Decoradores Public, Roles, CurrentUser

**Files:**
- Create: `src/config/public.decorator.ts`, `src/config/roles.decorator.ts`, `src/config/current-user.decorator.ts`
- Test: `src/config/decorators.spec.ts`

**Interfaces:**
- Consumes: `SetMetadata`, `createParamDecorator`, `ExecutionContext` (`@nestjs/common`); `request.user` (tipo `AuthUser`).
- Produces: `IS_PUBLIC_KEY='isPublic'`, `Public()`; `ROLES_KEY='roles'`, `Roles(...roles: string[])`; `AuthUser = { userId: number; employeeId: number; roles: string[]; sessionId: string }`, `CurrentUser()` param decorator que devuelve `request.user`.

- [ ] **Step 1: Escribe el test que falla** (`src/config/decorators.spec.ts`).
```ts
import { Reflector } from '@nestjs/core';
import { Public, IS_PUBLIC_KEY } from './public.decorator';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('auth decorators', () => {
  const reflector = new Reflector();

  it('Public sets isPublic metadata to true', () => {
    class Target {
      @Public()
      handler() {}
    }
    expect(reflector.get(IS_PUBLIC_KEY, Target.prototype.handler)).toBe(true);
  });

  it('Roles sets the roles metadata array', () => {
    class Target {
      @Roles('admin', 'agent')
      handler() {}
    }
    expect(reflector.get(ROLES_KEY, Target.prototype.handler)).toEqual([
      'admin',
      'agent',
    ]);
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla.**
```
pnpm test -- decorators
```
Esperado: `Cannot find module './public.decorator'`.

- [ ] **Step 3: Implementa `src/config/public.decorator.ts`.**
```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 4: Implementa `src/config/roles.decorator.ts`.**
```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 5: Implementa `src/config/current-user.decorator.ts`.**
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export interface AuthUser {
  userId: number;
  employeeId: number;
  roles: string[];
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthUser }>();
    return request.user;
  },
);
```

- [ ] **Step 6: Corre el test y confirma que pasa.**
```
pnpm test -- decorators
```
Esperado: `2 passed`.

- [ ] **Step 7: Commit.**
```
git add src/config/public.decorator.ts src/config/roles.decorator.ts src/config/current-user.decorator.ts src/config/decorators.spec.ts
git commit -m "feat(auth): add Public, Roles and CurrentUser decorators"
```

### Task 3.3: JwtAuthGuard

**Files:**
- Create: `src/config/jwt-auth.guard.ts`
- Test: `src/config/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `Reflector` (`IS_PUBLIC_KEY`), `JwtTokenService.verifyAccessToken`, `AccessPayload`, `AuthUser`.
- Produces: `JwtAuthGuard` (`canActivate`); con `@Public` deja pasar; si no, lee `Authorization: Bearer`, verifica y setea `request.user = AuthUser` mapeando `sub->userId`, `sid->sessionId`; lanza `UnauthorizedException` si falta/inválido.

- [ ] **Step 1: Escribe el test que falla** (`src/config/jwt-auth.guard.spec.ts`).
```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService } from './jwt.service';

describe('JwtAuthGuard', () => {
  const makeContext = (req: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => null,
      getClass: () => null,
    }) as unknown as ExecutionContext;

  const buildGuard = (isPublic: boolean, payload?: unknown) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    const jwtTokenService = {
      verifyAccessToken: jest.fn().mockImplementation(() => {
        if (!payload) throw new Error('invalid');
        return payload;
      }),
    } as unknown as JwtTokenService;
    return new JwtAuthGuard(reflector, jwtTokenService);
  };

  it('lets public routes pass without a token', () => {
    const guard = buildGuard(true);
    const req: Record<string, unknown> = { headers: {} };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('sets request.user from a valid token payload', () => {
    const guard = buildGuard(false, {
      sub: 1,
      employeeId: 7,
      roles: ['admin'],
      sid: 'sid-1',
    });
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
    };
    expect(guard.canActivate(makeContext(req))).toBe(true);
    expect(req.user).toEqual({
      userId: 1,
      employeeId: 7,
      roles: ['admin'],
      sessionId: 'sid-1',
    });
  });

  it('throws when the Authorization header is missing', () => {
    const guard = buildGuard(false);
    const req: Record<string, unknown> = { headers: {} };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the token is invalid', () => {
    const guard = buildGuard(false);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer bad-token' },
    };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla.**
```
pnpm test -- jwt-auth.guard
```
Esperado: `Cannot find module './jwt-auth.guard'`.

- [ ] **Step 3: Implementa `src/config/jwt-auth.guard.ts`.**
```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtTokenService } from './jwt.service';
import { AuthUser } from './current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthUser }>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = header.slice(7);
    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      request.user = {
        userId: payload.sub,
        employeeId: payload.employeeId,
        roles: payload.roles,
        sessionId: payload.sid,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

- [ ] **Step 4: Corre el test y confirma que pasa.**
```
pnpm test -- jwt-auth.guard
```
Esperado: `4 passed`.

- [ ] **Step 5: Commit.**
```
git add src/config/jwt-auth.guard.ts src/config/jwt-auth.guard.spec.ts
git commit -m "feat(auth): add JwtAuthGuard with Public bypass and Bearer verification"
```

### Task 3.4: RolesGuard

**Files:**
- Create: `src/config/roles.guard.ts`
- Test: `src/config/roles.guard.spec.ts`

**Interfaces:**
- Consumes: `Reflector` (`ROLES_KEY`), `AuthUser` (`request.user`).
- Produces: `RolesGuard` (`canActivate`); sin metadata pasa; con metadata exige intersección con `request.user.roles`.

- [ ] **Step 1: Escribe el test que falla** (`src/config/roles.guard.spec.ts`).
```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const makeContext = (req: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => null,
      getClass: () => null,
    }) as unknown as ExecutionContext;

  const buildGuard = (required: string[] | undefined) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('passes when no roles metadata is set', () => {
    const guard = buildGuard(undefined);
    const req = { user: { roles: [] } };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('passes when the user has one of the required roles', () => {
    const guard = buildGuard(['admin', 'agent']);
    const req = { user: { roles: ['agent'] } };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('rejects when the user has none of the required roles', () => {
    const guard = buildGuard(['admin']);
    const req = { user: { roles: ['agent'] } };
    expect(guard.canActivate(makeContext(req))).toBe(false);
  });

  it('rejects when there is no user on the request', () => {
    const guard = buildGuard(['admin']);
    const req = {};
    expect(guard.canActivate(makeContext(req))).toBe(false);
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla.**
```
pnpm test -- roles.guard
```
Esperado: `Cannot find module './roles.guard'`.

- [ ] **Step 3: Implementa `src/config/roles.guard.ts`.**
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser } from './current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthUser }>();
    const user = request.user;
    if (!user || !user.roles) return false;
    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
```

- [ ] **Step 4: Corre el test y confirma que pasa.**
```
pnpm test -- roles.guard
```
Esperado: `4 passed`.

- [ ] **Step 5: Commit.**
```
git add src/config/roles.guard.ts src/config/roles.guard.spec.ts
git commit -m "feat(auth): add RolesGuard with role intersection check"
```

### Task 3.5: ApiKeyGuard (modificar archivo existente)

**Files:**
- Modify: `src/config/api-key.guard.ts`
- Test: `src/config/api-key.guard.spec.ts`

**Interfaces:**
- Consumes: header `x-api-key`; `process.env.INBOUND_API_KEY`.
- Produces: `ApiKeyGuard` (`canActivate`) que devuelve `true` solo si `x-api-key === process.env.INBOUND_API_KEY`.

- [ ] **Step 1: Escribe el test que falla** (`src/config/api-key.guard.spec.ts`).
```ts
import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const makeContext = (headers: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

  const guard = new ApiKeyGuard();

  beforeEach(() => {
    process.env.INBOUND_API_KEY = 'secret-key';
  });

  it('passes when x-api-key matches INBOUND_API_KEY', () => {
    expect(guard.canActivate(makeContext({ 'x-api-key': 'secret-key' }))).toBe(
      true,
    );
  });

  it('rejects when x-api-key does not match', () => {
    expect(guard.canActivate(makeContext({ 'x-api-key': 'wrong' }))).toBe(
      false,
    );
  });

  it('rejects when x-api-key is missing', () => {
    expect(guard.canActivate(makeContext({}))).toBe(false);
  });
});
```

- [ ] **Step 2: Corre el test y confirma que falla.**
```
pnpm test -- api-key.guard
```
Esperado: falla (la implementación actual usa `bcrypt.compare` contra `API_KEY` y devuelve una `Promise`, no la comparación directa).

- [ ] **Step 3: Reescribe `src/config/api-key.guard.ts`.**
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const apiKey = request.headers['x-api-key'];
    return apiKey === process.env.INBOUND_API_KEY;
  }
}
```

- [ ] **Step 4: Corre el test y confirma que pasa.**
```
pnpm test -- api-key.guard
```
Esperado: `3 passed`.

- [ ] **Step 5: Commit.**
```
git add src/config/api-key.guard.ts src/config/api-key.guard.spec.ts
git commit -m "fix(auth): validate x-api-key against INBOUND_API_KEY in ApiKeyGuard"
```

### Task 3.6: Cablear guards globales (APP_GUARD: Throttler -> JwtAuth -> Roles) y desglobalizar ApiKeyGuard

**Files:**
- Modify: `src/main.module.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `JwtTokenService`, `JwtAuthGuard`, `RolesGuard`, `ThrottlerGuard`, `APP_GUARD`, `SnakeNamingStrategy` (Task 1.1).
- Produces: `MainModule` con `JwtTokenService` provisto y tres `APP_GUARD` en orden `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`, **preservando** `synchronize` por entorno y `namingStrategy` (Task 1.1). `main.ts` deja de aplicar `ApiKeyGuard` global (pasa a route-scoped en la Fase 4).

- [ ] **Step 1: Reescribe `src/main.module.ts`** preservando `synchronize` por entorno y `SnakeNamingStrategy` (Task 1.1), añadiendo `JwtTokenService` y los tres guards globales.
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
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
```

- [ ] **Step 2: Quita el `ApiKeyGuard` global de `src/main.ts`.** Elimina la línea de import `import { ApiKeyGuard } from './config/api-key.guard';` y la línea `app.useGlobalGuards(new ApiKeyGuard());`. El `ApiKeyGuard` se aplica a nivel de ruta en la Fase 4 (`POST /contact-requests`).

- [ ] **Step 3: Compila para confirmar que la inyección de los guards resuelve.**
```
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 4: Corre la suite unitaria de la fase.**
```
pnpm test -- config
```
Esperado: todos los specs de `src/config` en verde.

- [ ] **Step 5: Commit.**
```
git add src/main.module.ts src/main.ts
git commit -m "feat(auth): wire global APP_GUARD order and make ApiKeyGuard route-scoped"
```

### Task 4.4: AuthService + AuthController flows (TDD COMPLETO)

**Files:**
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`
- Create: `src/auth/dto/login.dto.ts`
- Create: `src/auth/dto/refresh.dto.ts`
- Test: `src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `Session` entity (`src/auth/session.entity.ts`: `id: string`, `userId`, `token`, `creationDate: Date`, `refreshedAt?: Date`, `ip?`), `User` entity (`src/users/user.entity.ts`: `id`, `username`, `password`, `employeeId`, `roles: Role[]`, `employee`), `JwtTokenService`, `AuthUser`, `bcrypt`.
- Produces: `AuthService.login(dto: LoginDto, ip?: string): Promise<{ accessToken: string; refreshToken: string }>`; `refresh(dto: RefreshDto, ip?: string): Promise<{ accessToken: string; refreshToken: string }>`; `logout(user: AuthUser): Promise<void>`; `me(user: AuthUser): Promise<User>`; `listSessions(user: AuthUser): Promise<Session[]>`; `revokeSession(user: AuthUser, id: string): Promise<void>`. Endpoints: `POST /auth/login`, `POST /auth/refresh` (`@Public`), `POST /auth/logout`, `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`.

- [ ] **Step 1: Write the DTOs.**
```ts
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```
```ts
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
```

- [ ] **Step 2: Write the failing `auth.service.spec.ts`.**
```ts
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { JwtTokenService } from '../config/jwt.service';

describe('AuthService', () => {
  let service: AuthService;
  const userRepo = { findOne: jest.fn() };
  const sessionRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const jwtService = {
    signAccessToken: jest.fn().mockReturnValue('access-1'),
    generateRefreshToken: jest.fn().mockReturnValue({ token: 'r-new', tokenHash: 'h-new' }),
    hashRefreshToken: jest.fn().mockReturnValue('h-in'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_TTL = '30d';
    const mod = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
        { provide: JwtTokenService, useValue: jwtService },
      ],
    }).compile();
    service = mod.get(AuthService);
  });

  it('login issues access + refresh and persists the session', async () => {
    const hash = await bcrypt.hash('pw', 10);
    userRepo.findOne.mockResolvedValue({ id: 1, username: 'a', password: hash, employeeId: 9, roles: [{ name: 'admin' }] });
    sessionRepo.createQueryBuilder.mockReturnValue({
      insert: () => ({ into: () => ({ values: () => ({ returning: () => ({ execute: () => Promise.resolve({ raw: [{ id: 'sid-1' }] }) }) }) }) }),
    });
    const out = await service.login({ username: 'a', password: 'pw' }, '1.2.3.4');
    expect(out).toEqual({ accessToken: 'access-1', refreshToken: 'r-new' });
    expect(jwtService.signAccessToken).toHaveBeenCalledWith({ sub: 1, employeeId: 9, roles: ['admin'], sid: 'sid-1' });
  });

  it('login rejects a bad password', async () => {
    const hash = await bcrypt.hash('pw', 10);
    userRepo.findOne.mockResolvedValue({ id: 1, username: 'a', password: hash, employeeId: 9, roles: [] });
    await expect(service.login({ username: 'a', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates the token and stamps refreshedAt', async () => {
    sessionRepo.findOne.mockResolvedValue({ id: 'sid-1', userId: 1, token: 'h-in', creationDate: new Date(), refreshedAt: null });
    userRepo.findOne.mockResolvedValue({ id: 1, employeeId: 9, roles: [{ name: 'admin' }] });
    const out = await service.refresh({ refreshToken: 'r-in' });
    expect(out).toEqual({ accessToken: 'access-1', refreshToken: 'r-new' });
    const saved = sessionRepo.save.mock.calls[0][0];
    expect(saved.token).toBe('h-new');
    expect(saved.refreshedAt).toBeInstanceOf(Date);
  });

  it('refresh rejects an expired session and deletes it', async () => {
    const old = new Date(Date.now() - 40 * 86400000);
    sessionRepo.findOne.mockResolvedValue({ id: 'sid-1', userId: 1, token: 'h-in', creationDate: old, refreshedAt: null });
    await expect(service.refresh({ refreshToken: 'r-in' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionRepo.delete).toHaveBeenCalledWith('sid-1');
  });

  it('logout deletes the current session', async () => {
    await service.logout({ userId: 1, employeeId: 9, roles: [], sessionId: 'sid-1' });
    expect(sessionRepo.delete).toHaveBeenCalledWith('sid-1');
  });
});
```

- [ ] **Step 3: Run and watch it fail.**
```
pnpm test -- auth.service
```
Expected: fails compiling (`AuthService` has no `login`).

- [ ] **Step 4: Implement `auth.service.ts`.**
```ts
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { JwtTokenService } from '../config/jwt.service';
import { AuthUser } from '../config/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    private readonly jwtService: JwtTokenService,
  ) {}

  async login(dto: LoginDto, ip?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepo.findOne({ where: { username: dto.username }, relations: { roles: true } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const refresh = this.jwtService.generateRefreshToken();
    const inserted = await this.sessionRepo
      .createQueryBuilder()
      .insert()
      .into(Session)
      .values({ userId: user.id, token: refresh.tokenHash, ip })
      .returning('id')
      .execute();
    const sid = (inserted.raw[0] as { id: string }).id;

    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      employeeId: user.employeeId,
      roles: user.roles.map((r) => r.name),
      sid,
    });
    return { accessToken, refreshToken: refresh.token };
  }

  async refresh(dto: RefreshDto, ip?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.jwtService.hashRefreshToken(dto.refreshToken);
    const session = await this.sessionRepo.findOne({ where: { token: tokenHash } });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    const base = session.refreshedAt ?? session.creationDate;
    if (base.getTime() + this.refreshTtlMs() < Date.now()) {
      await this.sessionRepo.delete(session.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.userRepo.findOne({ where: { id: session.userId }, relations: { roles: true } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const next = this.jwtService.generateRefreshToken();
    session.token = next.tokenHash;
    session.refreshedAt = new Date();
    if (ip) session.ip = ip;
    await this.sessionRepo.save(session);

    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      employeeId: user.employeeId,
      roles: user.roles.map((r) => r.name),
      sid: session.id,
    });
    return { accessToken, refreshToken: next.token };
  }

  async logout(user: AuthUser): Promise<void> {
    await this.sessionRepo.delete(user.sessionId);
  }

  async me(user: AuthUser): Promise<User> {
    const found = await this.userRepo.findOne({ where: { id: user.userId }, relations: { roles: true, employee: true } });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  listSessions(user: AuthUser): Promise<Session[]> {
    return this.sessionRepo.find({
      where: { userId: user.userId },
      select: { id: true, creationDate: true, refreshedAt: true, ip: true },
    });
  }

  async revokeSession(user: AuthUser, id: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id, userId: user.userId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionRepo.delete(session.id);
  }

  private refreshTtlMs(): number {
    const ttl = process.env.JWT_REFRESH_TTL ?? '30d';
    const m = ttl.match(/^(\d+)([smhd])$/);
    if (!m) return 30 * 86400000;
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
    return n * mult;
  }
}
```

- [ ] **Step 5: Implement `auth.controller.ts`.**
```ts
import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../config/public.decorator';
import { CurrentUser, AuthUser } from '../config/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  public login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    return this.authService.login(dto, req.ip);
  }

  @Public()
  @Post('refresh')
  public refresh(@Body() dto: RefreshDto, @Req() req: FastifyRequest) {
    return this.authService.refresh(dto, req.ip);
  }

  @Post('logout')
  public logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user);
  }

  @Get('me')
  public me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }

  @Get('sessions')
  public sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user);
  }

  @Delete('sessions/:id')
  public revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.authService.revokeSession(user, id);
  }
}
```

- [ ] **Step 6: Implement `auth.module.ts`.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { JwtTokenService } from '../config/jwt.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, User])],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService],
})
export class AuthModule {}
```

- [ ] **Step 7: Run unit + full suite.**
```
pnpm test -- auth.service
```
Expected: 5 passing; whole `pnpm test` green.

- [ ] **Step 8: Commit.**
```
git add src/auth/auth.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts src/auth/dto/login.dto.ts src/auth/dto/refresh.dto.ts src/auth/auth.service.spec.ts
git commit -m "feat(auth): implement login/refresh/logout/me/sessions flows"
```

### Task 4.5: Permissions module (admin CRUD — pattern reference)

**Files:**
- Create: `src/permissions/dto/create-permission.dto.ts`
- Create: `src/permissions/dto/update-permission.dto.ts`
- Create: `src/permissions/permissions.service.ts`
- Create: `src/permissions/permissions.controller.ts`
- Create: `src/permissions/permissions.module.ts`
- Modify: `src/main.module.ts`
- Test: `src/permissions/permissions.service.spec.ts`

**Interfaces:**
- Consumes: `Permission` entity (`src/permissions/permission.entity.ts`: `id: number`, `name: string`), `PaginationDto` (`src/config/pagination.dto.ts`: `page`, `limit`), `@Roles('admin')`.
- Produces: standard CRUD service + controller. List returns `{ items, total, page, limit }`. This is the **CRUD pattern**; Tasks 4.6/4.7 reuse it and only show their deltas.

- [ ] **Step 1: Write DTOs.**
```ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
```
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePermissionDto } from './create-permission.dto';

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}
```

- [ ] **Step 2: Write the failing service spec (representative for plain CRUD).**
```ts
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './permission.entity';

describe('PermissionsService', () => {
  let service: PermissionsService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
    findAndCount: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [PermissionsService, { provide: getRepositoryToken(Permission), useValue: repo }],
    }).compile();
    service = mod.get(PermissionsService);
  });

  it('creates when name is free', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.create({ name: 'clients.read' })).resolves.toEqual({ id: 1, name: 'clients.read' });
  });

  it('rejects a duplicate name', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'clients.read' });
    await expect(service.create({ name: 'clients.read' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('paginates the list', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 1, name: 'x' }], 1]);
    await expect(service.findAll({ page: 2, limit: 10 })).resolves.toEqual({ items: [{ id: 1, name: 'x' }], total: 1, page: 2, limit: 10 });
    expect(repo.findAndCount).toHaveBeenCalledWith({ skip: 10, take: 10 });
  });

  it('throws on missing id', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run and watch it fail.**
```
pnpm test -- permissions.service
```
Expected: fails (`PermissionsService` missing).

- [ ] **Step 4: Implement `permissions.service.ts`.**
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission) private readonly repo: Repository<Permission>,
  ) {}

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Permission already exists');
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [items, total] = await this.repo.findAndCount({ skip: (page - 1) * limit, take: limit });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Permission> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Permission not found');
    return found;
  }

  async update(id: number, dto: UpdatePermissionDto): Promise<Permission> {
    const found = await this.findOne(id);
    Object.assign(found, dto);
    return this.repo.save(found);
  }

  async remove(id: number): Promise<void> {
    const found = await this.findOne(id);
    await this.repo.delete(found.id);
  }
}
```

- [ ] **Step 5: Implement `permissions.controller.ts`.**
```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '../config/pagination.dto';
import { Roles } from '../config/roles.decorator';

@Roles('admin')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Post()
  create(@Body() dto: CreatePermissionDto) {
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePermissionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 6: Implement `permissions.module.ts` and register it in `main.module.ts`.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './permission.entity';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Permission])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
})
export class PermissionsModule {}
```
Add `PermissionsModule` to the `imports` array of `MainModule` (after `AuthModule`).

- [ ] **Step 7: Run and watch it pass.**
```
pnpm test -- permissions.service
```
Expected: 4 passing.

- [ ] **Step 8: Commit.**
```
git add src/permissions src/main.module.ts
git commit -m "feat(permissions): add admin CRUD module"
```

### Task 4.6: Roles module (admin CRUD + permission assignment)

**Files:**
- Create: `src/roles/dto/create-role.dto.ts`
- Create: `src/roles/dto/update-role.dto.ts`
- Create: `src/roles/roles.service.ts`
- Create: `src/roles/roles.controller.ts`
- Create: `src/roles/roles.module.ts`
- Modify: `src/main.module.ts`
- Test: `src/roles/roles.service.spec.ts`

**Interfaces:**
- Consumes: `Role` entity (`src/roles/role.entity.ts`: `id`, `name`, `permissions: Permission[]`), `Permission` entity, `PaginationDto`, `@Roles('admin')`.
- Produces: CRUD (same pattern as Task 4.5, fields: `{ name }`) plus `POST /roles/:id/permissions` (`{ permissionId }`) and `DELETE /roles/:id/permissions/:permId`.

- [ ] **Step 1: Write DTOs** (`CreateRoleDto { name: string }` like `CreatePermissionDto`; `UpdateRoleDto extends PartialType(CreateRoleDto)`; plus assignment DTO).
```ts
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AddRolePermissionDto {
  @Type(() => Number)
  @IsInt()
  permissionId: number;
}
```

- [ ] **Step 2: Write the failing spec for the non-trivial assignment logic.**
```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { Role } from './role.entity';
import { Permission } from '../permissions/permission.entity';

describe('RolesService assignments', () => {
  let service: RolesService;
  const roleRepo = { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)) };
  const permRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Permission), useValue: permRepo },
      ],
    }).compile();
    service = mod.get(RolesService);
  });

  it('adds a permission without duplicating it', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [{ id: 5 }] });
    permRepo.findOne.mockResolvedValue({ id: 7 });
    const out = await service.addPermission(1, { permissionId: 7 });
    expect(out.permissions.map((p: Permission) => p.id)).toEqual([5, 7]);
  });

  it('throws when the permission does not exist', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [] });
    permRepo.findOne.mockResolvedValue(null);
    await expect(service.addPermission(1, { permissionId: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes a permission from the role', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [{ id: 5 }, { id: 7 }] });
    const out = await service.removePermission(1, 5);
    expect(out.permissions.map((p: Permission) => p.id)).toEqual([7]);
  });
});
```

- [ ] **Step 3: Run and watch it fail.**
```
pnpm test -- roles.service
```
Expected: fails (`RolesService` missing).

- [ ] **Step 4: Implement `roles.service.ts`** (CRUD per Task 4.5 pattern using `Role`, plus the assignment methods).
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { Permission } from '../permissions/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AddRolePermissionDto } from './dto/add-role-permission.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly repo: Repository<Role>,
    @InjectRepository(Permission) private readonly permRepo: Repository<Permission>,
  ) {}

  async create(dto: CreateRoleDto): Promise<Role> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Role already exists');
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [items, total] = await this.repo.findAndCount({ skip: (page - 1) * limit, take: limit, relations: { permissions: true } });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Role> {
    const found = await this.repo.findOne({ where: { id }, relations: { permissions: true } });
    if (!found) throw new NotFoundException('Role not found');
    return found;
  }

  async update(id: number, dto: UpdateRoleDto): Promise<Role> {
    const found = await this.findOne(id);
    Object.assign(found, dto);
    return this.repo.save(found);
  }

  async remove(id: number): Promise<void> {
    const found = await this.findOne(id);
    await this.repo.delete(found.id);
  }

  async addPermission(id: number, dto: AddRolePermissionDto): Promise<Role> {
    const role = await this.findOne(id);
    const permission = await this.permRepo.findOne({ where: { id: dto.permissionId } });
    if (!permission) throw new NotFoundException('Permission not found');
    if (!role.permissions.some((p) => p.id === permission.id)) {
      role.permissions.push(permission);
    }
    return this.repo.save(role);
  }

  async removePermission(id: number, permId: number): Promise<Role> {
    const role = await this.findOne(id);
    role.permissions = role.permissions.filter((p) => p.id !== permId);
    return this.repo.save(role);
  }
}
```

- [ ] **Step 5: Implement `roles.controller.ts`** (CRUD as Task 4.5, `@Roles('admin')`, `@Controller('roles')`, plus the two assignment routes).
```ts
  @Post(':id/permissions')
  addPermission(@Param('id', ParseIntPipe) id: number, @Body() dto: AddRolePermissionDto) {
    return this.service.addPermission(id, dto);
  }

  @Delete(':id/permissions/:permId')
  removePermission(@Param('id', ParseIntPipe) id: number, @Param('permId', ParseIntPipe) permId: number) {
    return this.service.removePermission(id, permId);
  }
```

- [ ] **Step 6: Implement `roles.module.ts`** (`TypeOrmModule.forFeature([Role, Permission])`) and register `RolesModule` in `MainModule.imports`.

- [ ] **Step 7: Run and watch it pass.**
```
pnpm test -- roles.service
```
Expected: 3 passing.

- [ ] **Step 8: Commit.**
```
git add src/roles src/main.module.ts
git commit -m "feat(roles): add admin CRUD with permission assignment"
```

### Task 4.7: Users module (admin CRUD + role assignment, bcrypt password)

**Files:**
- Create: `src/users/dto/create-user.dto.ts`
- Create: `src/users/dto/update-user.dto.ts`
- Create: `src/users/dto/add-user-role.dto.ts`
- Create: `src/users/users.service.ts`
- Create: `src/users/users.controller.ts`
- Create: `src/users/users.module.ts`
- Modify: `src/main.module.ts`
- Test: `src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `User` entity (`src/users/user.entity.ts`: `id`, `username`, `password`, `employeeId`, `roles: Role[]`), `Role` entity, `PaginationDto`, `bcrypt`, `@Roles('admin')`.
- Produces: CRUD (pattern of Task 4.5; **deltas**: hash `password` with bcrypt on create/update, never return `password`, list with `relations.roles`) plus `POST /users/:id/roles` (`{ roleId }`) and `DELETE /users/:id/roles/:roleId`.

- [ ] **Step 1: Write DTOs.**
```ts
import { IsString, IsNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @Type(() => Number)
  @IsInt()
  employeeId: number;
}
```
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
```
```ts
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AddUserRoleDto {
  @Type(() => Number)
  @IsInt()
  roleId: number;
}
```

- [ ] **Step 2: Write the failing spec (password hashing + role assignment).**
```ts
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';

describe('UsersService', () => {
  let service: UsersService;
  const userRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) };
  const roleRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
      ],
    }).compile();
    service = mod.get(UsersService);
  });

  it('hashes the password on create', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await service.create({ username: 'a', password: 'pw', employeeId: 9 });
    const saved = userRepo.save.mock.calls[0][0];
    expect(saved.password).not.toBe('pw');
    await expect(bcrypt.compare('pw', saved.password)).resolves.toBe(true);
  });

  it('rejects a duplicate username', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, username: 'a' });
    await expect(service.create({ username: 'a', password: 'pw', employeeId: 9 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds a role without duplicating it', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, roles: [{ id: 2 }] });
    roleRepo.findOne.mockResolvedValue({ id: 3 });
    const out = await service.addRole(1, { roleId: 3 });
    expect(out.roles.map((r: Role) => r.id)).toEqual([2, 3]);
  });

  it('throws when the role does not exist', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, roles: [] });
    roleRepo.findOne.mockResolvedValue(null);
    await expect(service.addRole(1, { roleId: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run and watch it fail.**
```
pnpm test -- users.service
```
Expected: fails (`UsersService` missing).

- [ ] **Step 4: Implement `users.service.ts`.**
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddUserRoleDto } from './dto/add-user-role.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.repo.findOne({ where: { username: dto.username } });
    if (exists) throw new ConflictException('Username already exists');
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.repo.save(this.repo.create({ ...dto, password }));
    return this.findOne(user.id);
  }

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      relations: { roles: true, employee: true },
      select: { id: true, username: true, employeeId: true },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<User> {
    const found = await this.repo.findOne({
      where: { id },
      relations: { roles: true, employee: true },
      select: { id: true, username: true, employeeId: true },
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    const patch: Partial<User> = { ...dto };
    if (dto.password) patch.password = await bcrypt.hash(dto.password, 10);
    Object.assign(found, patch);
    await this.repo.save(found);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const found = await this.findOne(id);
    await this.repo.delete(found.id);
  }

  async addRole(id: number, dto: AddUserRoleDto): Promise<User> {
    const user = await this.repo.findOne({ where: { id }, relations: { roles: true } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.roleRepo.findOne({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (!user.roles.some((r) => r.id === role.id)) user.roles.push(role);
    await this.repo.save(user);
    return this.findOne(id);
  }

  async removeRole(id: number, roleId: number): Promise<User> {
    const user = await this.repo.findOne({ where: { id }, relations: { roles: true } });
    if (!user) throw new NotFoundException('User not found');
    user.roles = user.roles.filter((r) => r.id !== roleId);
    await this.repo.save(user);
    return this.findOne(id);
  }
}
```

- [ ] **Step 5: Implement `users.controller.ts`** (`@Roles('admin')`, `@Controller('users')`, CRUD per Task 4.5 plus the two role routes).
```ts
  @Post(':id/roles')
  addRole(@Param('id', ParseIntPipe) id: number, @Body() dto: AddUserRoleDto) {
    return this.service.addRole(id, dto);
  }

  @Delete(':id/roles/:roleId')
  removeRole(@Param('id', ParseIntPipe) id: number, @Param('roleId', ParseIntPipe) roleId: number) {
    return this.service.removeRole(id, roleId);
  }
```

- [ ] **Step 6: Implement `users.module.ts`** (`TypeOrmModule.forFeature([User, Role])`) and register `UsersModule` in `MainModule.imports`.

- [ ] **Step 7: Run and watch it pass.**
```
pnpm test -- users.service
```
Expected: 4 passing.

- [ ] **Step 8: Commit.**
```
git add src/users src/main.module.ts
git commit -m "feat(users): add admin CRUD with bcrypt password and role assignment"
```

### Task 4.8: Idempotent seed script + `pnpm seed`

**Files:**
- Create: `src/database/seed.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MainModule`, TypeORM `DataSource`, `bcrypt`, entities `Role` (`src/roles/role.entity.ts`), `Employee` (`src/employees/employee.entity.ts`), `User` (`src/users/user.entity.ts`), `ContactType` (`src/contact-types/contact-type.entity.ts`), `Sector` (`src/sectors/sector.entity.ts`), `PositionArea` (`src/position-areas/position-area.entity.ts`), `PipelineStage` (`src/pipeline-stages/pipeline-stage.entity.ts`), env `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`.
- Produces: re-runnable seed (roles `admin`/`recruiter`/`agent`; admin employee+user with bcrypt password and `admin` role; contact types `call`/`email`/`meeting`/`whatsapp`; sectors; position areas; pipeline stages with §13 probabilities). Script `pnpm seed`.

- [ ] **Step 1: Write `src/database/seed.ts`** (only TypeORM repository methods; idempotent via name/username lookups).
```ts
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MainModule } from '../main.module';
import { Role } from '../roles/role.entity';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { Sector } from '../sectors/sector.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';

async function ensureNamed<T extends { name: string }>(
  ds: DataSource,
  entity: { new (): T },
  names: string[],
): Promise<void> {
  const repo = ds.getRepository(entity);
  for (const name of names) {
    const found = await repo.findOne({ where: { name } as any });
    if (!found) await repo.save(repo.create({ name } as any));
  }
}

async function seedRoles(ds: DataSource): Promise<void> {
  await ensureNamed(ds, Role, ['admin', 'recruiter', 'agent']);
}

async function seedContactTypes(ds: DataSource): Promise<void> {
  await ensureNamed(ds, ContactType, ['call', 'email', 'meeting', 'whatsapp']);
}

async function seedSectors(ds: DataSource): Promise<void> {
  await ensureNamed(ds, Sector, ['call center', 'BPO', 'retail', 'tecnología', 'manufactura']);
}

async function seedPositionAreas(ds: DataSource): Promise<void> {
  await ensureNamed(ds, PositionArea, ['IT', 'Ventas', 'Logística', 'RRHH', 'Finanzas', 'Operaciones']);
}

async function seedPipelineStages(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(PipelineStage);
  const stages = [
    { name: 'Contacto inicial', sortOrder: 1, probability: 10, isWon: false, isLost: false },
    { name: 'Calificado', sortOrder: 2, probability: 25, isWon: false, isLost: false },
    { name: 'Entrevista 1', sortOrder: 3, probability: 40, isWon: false, isLost: false },
    { name: 'Entrevista 2', sortOrder: 4, probability: 60, isWon: false, isLost: false },
    { name: 'Propuesta enviada', sortOrder: 5, probability: 75, isWon: false, isLost: false },
    { name: 'Negociación', sortOrder: 6, probability: 90, isWon: false, isLost: false },
    { name: 'Ganada', sortOrder: 7, probability: 100, isWon: true, isLost: false },
    { name: 'Perdida', sortOrder: 8, probability: 0, isWon: false, isLost: true },
  ];
  for (const stage of stages) {
    const found = await repo.findOne({ where: { name: stage.name } });
    if (!found) await repo.save(repo.create(stage));
  }
}

async function seedAdmin(ds: DataSource): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME ?? '';
  const rawPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!username || !rawPassword) return;

  const userRepo = ds.getRepository(User);
  const existing = await userRepo.findOne({ where: { username } });
  if (existing) return;

  const employeeRepo = ds.getRepository(Employee);
  const employee = await employeeRepo.save(employeeRepo.create({ firstName: 'Admin', lastName: 'SIR' }));

  const roleRepo = ds.getRepository(Role);
  const adminRole = await roleRepo.findOne({ where: { name: 'admin' } });

  const password = await bcrypt.hash(rawPassword, 10);
  const user = userRepo.create({ username, password, employeeId: employee.id, roles: adminRole ? [adminRole] : [] });
  await userRepo.save(user);
}

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MainModule);
  const ds = app.get(DataSource);
  await seedRoles(ds);
  await seedContactTypes(ds);
  await seedSectors(ds);
  await seedPositionAreas(ds);
  await seedPipelineStages(ds);
  await seedAdmin(ds);
  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Add the `seed` script to `package.json`.** In the `scripts` block add: `"seed": "ts-node -r tsconfig-paths/register src/database/seed.ts"`.

- [ ] **Step 3: Run the seed (idempotency check).**
```
pnpm seed
```
Expected: exits 0; rows for roles/contact-types/sectors/position-areas/pipeline-stages and the admin user created. Re-running `pnpm seed` exits 0 with no duplicates and no error.

- [ ] **Step 4: Commit.**
```
git add src/database/seed.ts package.json
git commit -m "feat(seed): add idempotent seed for roles, admin, catalogs and pipeline stages"
```


## Fase 3 — CRM core + catálogos

Now I have enough context. Here are my Phase 3 tasks.

---

### Task 5.1: Sectors module (admin) — CRUD reference pattern

**Files:**
- Create: `src/sectors/dto/create-sector.dto.ts`
- Create: `src/sectors/dto/update-sector.dto.ts`
- Create: `src/sectors/sectors.service.ts`
- Create: `src/sectors/sectors.controller.ts`
- Create: `src/sectors/sectors.module.ts`
- Test: `src/sectors/sectors.service.spec.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `Sector` entity (`src/sectors/sector.entity.ts`, props `id: number`, `name: string` unique, `active: boolean`) produced by Fase 1; `PaginationDto` (`src/config/pagination.dto.ts`, `{ page?: number; limit?: number }`) y `Roles(...roles: string[])` (`src/config/roles.decorator.ts`) producidos por Fase 2; `JwtAuthGuard`+`RolesGuard` globales.
- Produces: `SectorsService` con `create(dto: CreateSectorDto): Promise<Sector>`, `findAll(query: PaginationDto): Promise<{ items: Sector[]; total: number; page: number; limit: number }>`, `findOne(id: number): Promise<Sector>`, `update(id: number, dto: UpdateSectorDto): Promise<Sector>`, `remove(id: number): Promise<{ id: number }>`; `SectorsModule`. Este es el PATRÓN CRUD de referencia que las Tasks 5.2–5.7 reutilizan.

- [ ] **Step 1: Instala `@nestjs/mapped-types` (necesario para `PartialType` en todos los Update DTOs de la fase).**
```bash
pnpm add @nestjs/mapped-types
```
Esperado: `dependencies: + @nestjs/mapped-types <version>` y `pnpm-lock.yaml` actualizado.

- [ ] **Step 2: Escribe el test unitario representativo que falla.**
```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SectorsService } from './sectors.service';
import { Sector } from './sector.entity';

describe('SectorsService', () => {
  let service: SectorsService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SectorsService,
        { provide: getRepositoryToken(Sector), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(SectorsService);
  });

  it('throws ConflictException when name already exists', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'BPO', active: true });
    await expect(service.create({ name: 'BPO' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns the standard paginated shape', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 1, name: 'BPO' }], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({
      items: [{ id: 1, name: 'BPO' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('throws NotFoundException when the sector is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Corre el test y verifica que falla.**
```bash
pnpm test -- sectors.service
```
Esperado: falla en compilación/resolución (`Cannot find module './sectors.service'`), 0 passed.

- [ ] **Step 4: Crea `CreateSectorDto`.**
```ts
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSectorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 5: Crea `UpdateSectorDto` (patrón `PartialType` reutilizado por toda la fase).**
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateSectorDto } from './create-sector.dto';

export class UpdateSectorDto extends PartialType(CreateSectorDto) {}
```

- [ ] **Step 6: Crea `SectorsService` (cuerpo CRUD canónico de la fase).**
```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sector } from './sector.entity';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class SectorsService {
  constructor(
    @InjectRepository(Sector)
    private readonly repo: Repository<Sector>,
  ) {}

  async create(dto: CreateSectorDto): Promise<Sector> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Sector already exists');
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Sector> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Sector not found');
    return entity;
  }

  async update(id: number, dto: UpdateSectorDto): Promise<Sector> {
    const entity = await this.findOne(id);
    if (dto.name && dto.name !== entity.name) {
      const clash = await this.repo.findOne({ where: { name: dto.name } });
      if (clash) throw new ConflictException('Sector already exists');
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
```

- [ ] **Step 7: Crea `SectorsController` (controller delgado, acceso admin).**
```ts
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
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';
import { PaginationDto } from '../config/pagination.dto';
import { Roles } from '../config/roles.decorator';

@Controller('sectors')
@Roles('admin')
export class SectorsController {
  constructor(private readonly service: SectorsService) {}

  @Post()
  create(@Body() dto: CreateSectorDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectorDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 8: Crea `SectorsModule`.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sector } from './sector.entity';
import { SectorsService } from './sectors.service';
import { SectorsController } from './sectors.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Sector])],
  controllers: [SectorsController],
  providers: [SectorsService],
  exports: [SectorsService],
})
export class SectorsModule {}
```

- [ ] **Step 9: Registra el módulo en `main.module.ts` (añade el import y la entrada del array `imports` tras `AuthModule`).**
```ts
import { AuthModule } from './auth/auth.module';
import { SectorsModule } from './sectors/sectors.module';
```
```ts
    AuthModule,
    SectorsModule,
```

- [ ] **Step 10: Corre el test y verifica que pasa.**
```bash
pnpm test -- sectors.service
```
Esperado: `3 passed`, 1 suite passed.

- [ ] **Step 11: Compila el proyecto.**
```bash
pnpm build
```
Esperado: build sin errores de TypeScript.

- [ ] **Step 12: Commit.**
```bash
git add src/sectors src/main.module.ts package.json pnpm-lock.yaml
git commit -m "feat(sectors): add admin CRUD module with paginated list"
```

---

### Task 5.2: Position-areas module (admin)

**Files:**
- Create: `src/position-areas/dto/create-position-area.dto.ts`
- Create: `src/position-areas/dto/update-position-area.dto.ts`
- Create: `src/position-areas/position-areas.service.ts`
- Create: `src/position-areas/position-areas.controller.ts`
- Create: `src/position-areas/position-areas.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `PositionArea` entity (`src/position-areas/position-area.entity.ts`, props `id: number`, `name: string` unique, `active: boolean`); `PaginationDto`; `Roles`.
- Produces: `PositionAreasService` (mismas firmas que `SectorsService`, tipo `PositionArea`); `PositionAreasModule`.

- [ ] **Step 1: Crea los DTOs (campos idénticos a Sector: `name` requerido, `active?`).**
```ts
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePositionAreaDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePositionAreaDto } from './create-position-area.dto';

export class UpdatePositionAreaDto extends PartialType(CreatePositionAreaDto) {}
```

- [ ] **Step 2: Crea `position-areas.service.ts` reutilizando el cuerpo CRUD de la Task 5.1 (incluye chequeo de `ConflictException` por `name` único), sustituyendo entidad `PositionArea`, DTOs `CreatePositionAreaDto`/`UpdatePositionAreaDto` y mensajes `'Position area ...'`.**

- [ ] **Step 3: Crea `position-areas.controller.ts` idéntico al patrón 5.1 con `@Controller('position-areas')` y `@Roles('admin')`, usando los DTOs de esta task.**

- [ ] **Step 4: Crea `position-areas.module.ts` con `TypeOrmModule.forFeature([PositionArea])`, controller y service, exportando el service.**

- [ ] **Step 5: Registra en `main.module.ts`.**
```ts
import { PositionAreasModule } from './position-areas/position-areas.module';
```
```ts
    SectorsModule,
    PositionAreasModule,
```

- [ ] **Step 6: Compila.**
```bash
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 7: Commit.**
```bash
git add src/position-areas src/main.module.ts
git commit -m "feat(position-areas): add admin CRUD module with paginated list"
```

---

### Task 5.3: Contact-types module (admin)

**Files:**
- Create: `src/contact-types/dto/create-contact-type.dto.ts`
- Create: `src/contact-types/dto/update-contact-type.dto.ts`
- Create: `src/contact-types/contact-types.service.ts`
- Create: `src/contact-types/contact-types.controller.ts`
- Create: `src/contact-types/contact-types.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `ContactType` entity (`src/contact-types/contact-type.entity.ts`, props `id: number`, `name: string`); `PaginationDto`; `Roles`.
- Produces: `ContactTypesService` (firmas del patrón 5.1, tipo `ContactType`, SIN chequeo de unicidad); `ContactTypesModule`.

- [ ] **Step 1: Crea los DTOs (único campo `name`).**
```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateContactTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
```
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateContactTypeDto } from './create-contact-type.dto';

export class UpdateContactTypeDto extends PartialType(CreateContactTypeDto) {}
```

- [ ] **Step 2: Crea `contact-types.service.ts` con el cuerpo CRUD del patrón 5.1 pero OMITIENDO el chequeo `ConflictException` en `create`/`update` (el spec no declara `name` único); entidad `ContactType`, mensaje `'Contact type not found'`.**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactType } from './contact-type.entity';
import { CreateContactTypeDto } from './dto/create-contact-type.dto';
import { UpdateContactTypeDto } from './dto/update-contact-type.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class ContactTypesService {
  constructor(
    @InjectRepository(ContactType)
    private readonly repo: Repository<ContactType>,
  ) {}

  async create(dto: CreateContactTypeDto): Promise<ContactType> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ContactType> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Contact type not found');
    return entity;
  }

  async update(id: number, dto: UpdateContactTypeDto): Promise<ContactType> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
```

- [ ] **Step 3: Crea `contact-types.controller.ts` igual al patrón 5.1 con `@Controller('contact-types')` y `@Roles('admin')`.**

- [ ] **Step 4: Crea `contact-types.module.ts` con `forFeature([ContactType])`, exportando el service.**

- [ ] **Step 5: Registra en `main.module.ts`.**
```ts
import { ContactTypesModule } from './contact-types/contact-types.module';
```
```ts
    PositionAreasModule,
    ContactTypesModule,
```

- [ ] **Step 6: Compila.**
```bash
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 7: Commit.**
```bash
git add src/contact-types src/main.module.ts
git commit -m "feat(contact-types): add admin CRUD module with paginated list"
```

---

### Task 5.4: Pipeline-stages module (admin, filtro `?active`)

**Files:**
- Create: `src/pipeline-stages/dto/create-pipeline-stage.dto.ts`
- Create: `src/pipeline-stages/dto/update-pipeline-stage.dto.ts`
- Create: `src/pipeline-stages/dto/query-pipeline-stage.dto.ts`
- Create: `src/pipeline-stages/pipeline-stages.service.ts`
- Create: `src/pipeline-stages/pipeline-stages.controller.ts`
- Create: `src/pipeline-stages/pipeline-stages.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `PipelineStage` entity (`src/pipeline-stages/pipeline-stage.entity.ts`, props `id`, `name`, `sortOrder`, `probability`, `isWon`, `isLost`, `active`); `PaginationDto`; `Roles`.
- Produces: `PipelineStagesService` con `findAll(query: QueryPipelineStageDto)` que filtra por `active` opcional; resto firmas del patrón 5.1; `PipelineStagesModule`.

- [ ] **Step 1: Crea `CreatePipelineStageDto`.**
```ts
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePipelineStageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Number)
  @IsInt()
  sortOrder: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability: number;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 2: Crea `UpdatePipelineStageDto` con `PartialType(CreatePipelineStageDto)`.**

- [ ] **Step 3: Crea `QueryPipelineStageDto` (extiende `PaginationDto`, añade `active?` booleano desde query string).**
```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryPipelineStageDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}
```

- [ ] **Step 4: Crea `pipeline-stages.service.ts` con el cuerpo CRUD del patrón 5.1 (sin chequeo de unicidad; `name` no es único) y `findAll` con filtro `active`; orden por `sortOrder`.**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { PipelineStage } from './pipeline-stage.entity';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { QueryPipelineStageDto } from './dto/query-pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(
    @InjectRepository(PipelineStage)
    private readonly repo: Repository<PipelineStage>,
  ) {}

  async create(dto: CreatePipelineStageDto): Promise<PipelineStage> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryPipelineStageDto) {
    const { page = 1, limit = 20, active } = query;
    const where: FindOptionsWhere<PipelineStage> = {};
    if (active !== undefined) where.active = active;
    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { sortOrder: 'ASC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<PipelineStage> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Pipeline stage not found');
    return entity;
  }

  async update(
    id: number,
    dto: UpdatePipelineStageDto,
  ): Promise<PipelineStage> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
```

- [ ] **Step 5: Crea `pipeline-stages.controller.ts` igual al patrón 5.1 con `@Controller('pipeline-stages')`, `@Roles('admin')` y `findAll(@Query() query: QueryPipelineStageDto)`.**

- [ ] **Step 6: Crea `pipeline-stages.module.ts` con `forFeature([PipelineStage])`, exportando el service.**

- [ ] **Step 7: Registra en `main.module.ts`.**
```ts
import { PipelineStagesModule } from './pipeline-stages/pipeline-stages.module';
```
```ts
    ContactTypesModule,
    PipelineStagesModule,
```

- [ ] **Step 8: Compila.**
```bash
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 9: Commit.**
```bash
git add src/pipeline-stages src/main.module.ts
git commit -m "feat(pipeline-stages): add admin CRUD module with active filter"
```

---

### Task 5.5: Employees module (admin)

**Files:**
- Create: `src/employees/dto/create-employee.dto.ts`
- Create: `src/employees/dto/update-employee.dto.ts`
- Create: `src/employees/employees.service.ts`
- Create: `src/employees/employees.controller.ts`
- Create: `src/employees/employees.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `Employee` entity (`src/employees/employee.entity.ts`, props `id`, `firstName`, `secondName?`, `lastName`, `surName?`, `nationalId?`, `phoneNumber?`, `email?`, `birthDate?`, `hireDate?`, `salary?`); `PaginationDto`; `Roles`.
- Produces: `EmployeesService` (firmas del patrón 5.1, tipo `Employee`, sin chequeo de unicidad); `EmployeesModule`.

- [ ] **Step 1: Crea `CreateEmployeeDto` declarando TODAS las props permitidas (forbidNonWhitelisted global).**
```ts
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  @IsString()
  surName?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salary?: number;
}
```

- [ ] **Step 2: Crea `UpdateEmployeeDto` con `PartialType(CreateEmployeeDto)`.**

- [ ] **Step 3: Crea `employees.service.ts` con el cuerpo CRUD del patrón 5.1 SIN chequeo de unicidad; entidad `Employee`, `findAll(query: PaginationDto)`, mensaje `'Employee not found'`.**

- [ ] **Step 4: Crea `employees.controller.ts` igual al patrón 5.1 con `@Controller('employees')` y `@Roles('admin')`.**

- [ ] **Step 5: Crea `employees.module.ts` con `forFeature([Employee])`, exportando el service.**

- [ ] **Step 6: Registra en `main.module.ts`.**
```ts
import { EmployeesModule } from './employees/employees.module';
```
```ts
    PipelineStagesModule,
    EmployeesModule,
```

- [ ] **Step 7: Compila.**
```bash
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 8: Commit.**
```bash
git add src/employees src/main.module.ts
git commit -m "feat(employees): add admin CRUD module with paginated list"
```

---

### Task 5.6: Clients module (auth, filtro `?sectorId`, `GET /:id` con contactos)

**Files:**
- Create: `src/clients/dto/create-client.dto.ts`
- Create: `src/clients/dto/update-client.dto.ts`
- Create: `src/clients/dto/query-client.dto.ts`
- Create: `src/clients/clients.service.ts`
- Create: `src/clients/clients.controller.ts`
- Create: `src/clients/clients.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `Client` entity (`src/clients/client.entity.ts`, props `id`, `name`, `sector?` text legacy, `sectorId?`, `sectorCatalog?` ManyToOne Sector, `employeeSize?`, `contacts` OneToMany `ClientContact`); `PaginationDto`. SIN `Roles` (acceso auth: el `JwtAuthGuard` global basta).
- Produces: `ClientsService` con `findAll(query: QueryClientDto)` filtrando por `sectorId`, `findOne(id)` cargando `relations: ['contacts']`; resto firmas del patrón 5.1; `ClientsModule`.

- [ ] **Step 1: Crea `CreateClientDto` (incluye `sector` text legacy y `sectorId` del catálogo; ambos opcionales).**
```ts
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sectorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeSize?: number;
}
```

- [ ] **Step 2: Crea `UpdateClientDto` con `PartialType(CreateClientDto)`.**

- [ ] **Step 3: Crea `QueryClientDto` (extiende `PaginationDto`, añade `sectorId?`).**
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryClientDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sectorId?: number;
}
```

- [ ] **Step 4: Crea `clients.service.ts` (filtro `sectorId` en `findAll`; `findOne` con relación `contacts`).**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Client } from './client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientDto } from './dto/query-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly repo: Repository<Client>,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryClientDto) {
    const { page = 1, limit = 20, sectorId } = query;
    const where: FindOptionsWhere<Client> = {};
    if (sectorId !== undefined) where.sectorId = sectorId;
    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Client> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['contacts'],
    });
    if (!entity) throw new NotFoundException('Client not found');
    return entity;
  }

  async update(id: number, dto: UpdateClientDto): Promise<Client> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
```

- [ ] **Step 5: Crea `clients.controller.ts` igual al patrón 5.1 con `@Controller('clients')`, SIN `@Roles` (acceso auth) y `findAll(@Query() query: QueryClientDto)`.**

- [ ] **Step 6: Crea `clients.module.ts` con `forFeature([Client])`, exportando el service.**

- [ ] **Step 7: Registra en `main.module.ts`.**
```ts
import { ClientsModule } from './clients/clients.module';
```
```ts
    EmployeesModule,
    ClientsModule,
```

- [ ] **Step 8: Compila.**
```bash
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 9: Commit.**
```bash
git add src/clients src/main.module.ts
git commit -m "feat(clients): add auth CRUD module with sectorId filter and contacts detail"
```

---

### Task 5.7: Client-contacts module (auth, filtro `?clientId`)

**Files:**
- Create: `src/client-contacts/dto/create-client-contact.dto.ts`
- Create: `src/client-contacts/dto/update-client-contact.dto.ts`
- Create: `src/client-contacts/dto/query-client-contact.dto.ts`
- Create: `src/client-contacts/client-contacts.service.ts`
- Create: `src/client-contacts/client-contacts.controller.ts`
- Create: `src/client-contacts/client-contacts.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `ClientContact` entity (`src/client-contacts/client-contact.entity.ts`, props `id`, `name`, `phoneNumber?`, `email?`, `clientId`, `client` ManyToOne); `PaginationDto`. SIN `Roles` (acceso auth).
- Produces: `ClientContactsService` con `findAll(query: QueryClientContactDto)` filtrando por `clientId`; resto firmas del patrón 5.1; `ClientContactsModule`.

- [ ] **Step 1: Crea `CreateClientContactDto`.**
```ts
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateClientContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Type(() => Number)
  @IsInt()
  clientId: number;
}
```

- [ ] **Step 2: Crea `UpdateClientContactDto` con `PartialType(CreateClientContactDto)`.**

- [ ] **Step 3: Crea `QueryClientContactDto` (extiende `PaginationDto`, añade `clientId?`).**
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryClientContactDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;
}
```

- [ ] **Step 4: Crea `client-contacts.service.ts` con el cuerpo CRUD del patrón 5.1 SIN chequeo de unicidad; `findAll` filtra por `clientId`; entidad `ClientContact`, mensaje `'Client contact not found'`.**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ClientContact } from './client-contact.entity';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';
import { QueryClientContactDto } from './dto/query-client-contact.dto';

@Injectable()
export class ClientContactsService {
  constructor(
    @InjectRepository(ClientContact)
    private readonly repo: Repository<ClientContact>,
  ) {}

  async create(dto: CreateClientContactDto): Promise<ClientContact> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryClientContactDto) {
    const { page = 1, limit = 20, clientId } = query;
    const where: FindOptionsWhere<ClientContact> = {};
    if (clientId !== undefined) where.clientId = clientId;
    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ClientContact> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Client contact not found');
    return entity;
  }

  async update(
    id: number,
    dto: UpdateClientContactDto,
  ): Promise<ClientContact> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
```

- [ ] **Step 5: Crea `client-contacts.controller.ts` igual al patrón 5.1 con `@Controller('client-contacts')`, SIN `@Roles` y `findAll(@Query() query: QueryClientContactDto)`.**

- [ ] **Step 6: Crea `client-contacts.module.ts` con `forFeature([ClientContact])`, exportando el service.**

- [ ] **Step 7: Registra en `main.module.ts`.**
```ts
import { ClientContactsModule } from './client-contacts/client-contacts.module';
```
```ts
    ClientsModule,
    ClientContactsModule,
```

- [ ] **Step 8: Compila.**
```bash
pnpm build
```
Esperado: build sin errores.

- [ ] **Step 9: Commit.**
```bash
git add src/client-contacts src/main.module.ts
git commit -m "feat(client-contacts): add auth CRUD module with clientId filter"
```


## Fase 4 — Actividad

### Task 6.1: contact-history — DTOs de creación y consulta

**Files:**
- Create: `src/contact-history/dto/create-contact-history.dto.ts`
- Create: `src/contact-history/dto/query-contact-history.dto.ts`

**Interfaces:**
- Consumes: `PaginationDto` (`src/config/pagination.dto.ts`) — `{ page?: number; limit?: number }` (defaults 1 / 20).
- Consumes: `ContactDirection` enum (`src/contact-history/contact-history.entity.ts`, Fase 1) — `inbound | outbound`.
- Produces: `CreateContactHistoryDto` = `{ contactId: number; contactType: number; contactTime: string; callLength?: number; contactDesc?: string; phoneNumberDialed?: string; direction?: ContactDirection; opportunityId?: number }`.
- Produces: `QueryContactHistoryDto extends PaginationDto` = `+ { employeeId?: number; contactId?: number; clientId?: number; contactType?: number; opportunityId?: number; direction?: ContactDirection; from?: string; to?: string }`.

- [ ] **Step 1: Escribe `CreateContactHistoryDto`.** `employeeId` NO va en el DTO (se sella desde `@CurrentUser`). `contactType` es el id del tipo (columna `contact_type`).
```ts
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactDirection } from '../contact-history.entity';

export class CreateContactHistoryDto {
  @Type(() => Number)
  @IsInt()
  contactId: number;

  @Type(() => Number)
  @IsInt()
  contactType: number;

  @IsDateString()
  contactTime: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  callLength?: number;

  @IsOptional()
  @IsString()
  contactDesc?: string;

  @IsOptional()
  @IsString()
  phoneNumberDialed?: string;

  @IsOptional()
  @IsEnum(ContactDirection)
  direction?: ContactDirection;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;
}
```

- [ ] **Step 2: Escribe `QueryContactHistoryDto`.** Filtros de §10 (employee/contacto/cliente/tipo/oportunidad/dirección/rango fechas) sobre la paginación estándar.
```ts
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../config/pagination.dto';
import { ContactDirection } from '../contact-history.entity';

export class QueryContactHistoryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;

  @IsOptional()
  @IsEnum(ContactDirection)
  direction?: ContactDirection;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
```

- [ ] **Step 3: Commit.**
```
git add src/contact-history/dto/create-contact-history.dto.ts src/contact-history/dto/query-contact-history.dto.ts
git commit -m "feat(contact-history): add create and query dtos"
```
Esperado: 1 commit con 2 archivos creados.

---

### Task 6.2: contact-history — service con TDD de lastContactAt

**Files:**
- Test: `src/contact-history/contact-history.service.spec.ts`
- Create: `src/contact-history/contact-history.service.ts`

**Interfaces:**
- Consumes: `ContactHistory` (`src/contact-history/contact-history.entity.ts`) — `{ id, employeeId, contactId, contact, contactType, contactTime: Date, callLength?, contactDesc?, phoneNumberDialed?, direction?, opportunityId?, opportunity? }`.
- Consumes: `Opportunity` (`src/opportunities/opportunity.entity.ts`) — usa `{ id, lastContactAt?: Date }`.
- Consumes: `ContactType` (`src/contact-types/contact-type.entity.ts`).
- Consumes: `CreateContactHistoryDto`, `QueryContactHistoryDto` (Task 6.1).
- Produces: `ContactHistoryService` con `create(dto, employeeId): Promise<ContactHistory>`, `findAll(query): Promise<{ items; total; page; limit }>`, `findOne(id): Promise<ContactHistory>`.

- [ ] **Step 1: Escribe el spec que falla** (lógica `lastContactAt`: setea si null, actualiza si más reciente, no toca si más antiguo, no toca sin `opportunityId`, lanza si la oportunidad no existe, y sella `employeeId`).
```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactHistoryService } from './contact-history.service';
import { ContactHistory } from './contact-history.entity';
import { Opportunity } from '../opportunities/opportunity.entity';

describe('ContactHistoryService lastContactAt', () => {
  let service: ContactHistoryService;
  let historyRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let opportunityRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    historyRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 1, ...value })),
      findOne: jest.fn(async () => ({ id: 1 })),
      createQueryBuilder: jest.fn(),
    };
    opportunityRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactHistoryService,
        { provide: getRepositoryToken(ContactHistory), useValue: historyRepo },
        { provide: getRepositoryToken(Opportunity), useValue: opportunityRepo },
      ],
    }).compile();
    service = moduleRef.get(ContactHistoryService);
  });

  const baseDto = {
    contactId: 5,
    contactType: 2,
    contactTime: '2026-06-20T10:00:00.000Z',
    opportunityId: 9,
  };

  it('sets lastContactAt when opportunity has none', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: null });
    await service.create(baseDto as any, 7);
    expect(opportunityRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, lastContactAt: new Date('2026-06-20T10:00:00.000Z') }),
    );
  });

  it('updates lastContactAt when contactTime is more recent', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: new Date('2026-06-10T10:00:00.000Z') });
    await service.create(baseDto as any, 7);
    expect(opportunityRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastContactAt: new Date('2026-06-20T10:00:00.000Z') }),
    );
  });

  it('does not update lastContactAt when contactTime is older', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: new Date('2026-06-25T10:00:00.000Z') });
    await service.create(baseDto as any, 7);
    expect(opportunityRepo.save).not.toHaveBeenCalled();
  });

  it('does not touch opportunity when opportunityId is absent', async () => {
    await service.create({ contactId: 5, contactType: 2, contactTime: '2026-06-20T10:00:00.000Z' } as any, 7);
    expect(opportunityRepo.findOne).not.toHaveBeenCalled();
    expect(opportunityRepo.save).not.toHaveBeenCalled();
  });

  it('throws when opportunity does not exist', async () => {
    opportunityRepo.findOne.mockResolvedValue(null);
    await expect(service.create(baseDto as any, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('seals employeeId from the current user', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: null });
    await service.create(baseDto as any, 7);
    expect(historyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 7 }));
  });
});
```

- [ ] **Step 2: Corre el spec y falla.**
```
pnpm test -- contact-history.service.spec
```
Esperado: falla en compilación/módulo (`Cannot find module './contact-history.service'`).

- [ ] **Step 3: Implementa `ContactHistoryService`** (mínimo para pasar; FK `contact_type` vía objeto de relación, sin SQL crudo; filtros con QueryBuilder).
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactHistory } from './contact-history.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { CreateContactHistoryDto } from './dto/create-contact-history.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';

@Injectable()
export class ContactHistoryService {
  constructor(
    @InjectRepository(ContactHistory)
    private readonly historyRepo: Repository<ContactHistory>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
  ) {}

  async create(dto: CreateContactHistoryDto, employeeId: number): Promise<ContactHistory> {
    const contactTime = new Date(dto.contactTime);
    const entity = this.historyRepo.create({
      employeeId,
      contactId: dto.contactId,
      contactType: { id: dto.contactType } as ContactType,
      contactTime,
      callLength: dto.callLength,
      contactDesc: dto.contactDesc,
      phoneNumberDialed: dto.phoneNumberDialed,
      direction: dto.direction,
      opportunityId: dto.opportunityId,
    });
    const saved = await this.historyRepo.save(entity);
    if (dto.opportunityId) {
      await this.touchOpportunity(dto.opportunityId, contactTime);
    }
    return this.findOne(saved.id);
  }

  private async touchOpportunity(opportunityId: number, contactTime: Date): Promise<void> {
    const opportunity = await this.opportunityRepo.findOne({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    if (!opportunity.lastContactAt || contactTime > opportunity.lastContactAt) {
      opportunity.lastContactAt = contactTime;
      await this.opportunityRepo.save(opportunity);
    }
  }

  async findAll(
    query: QueryContactHistoryDto,
  ): Promise<{ items: ContactHistory[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.historyRepo
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.employee', 'employee')
      .leftJoinAndSelect('history.contact', 'contact')
      .leftJoinAndSelect('history.contactType', 'contactType');
    if (query.employeeId) {
      qb.andWhere('history.employeeId = :employeeId', { employeeId: query.employeeId });
    }
    if (query.contactId) {
      qb.andWhere('history.contactId = :contactId', { contactId: query.contactId });
    }
    if (query.clientId) {
      qb.andWhere('contact.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.contactType) {
      qb.andWhere('contactType.id = :contactType', { contactType: query.contactType });
    }
    if (query.opportunityId) {
      qb.andWhere('history.opportunityId = :opportunityId', { opportunityId: query.opportunityId });
    }
    if (query.direction) {
      qb.andWhere('history.direction = :direction', { direction: query.direction });
    }
    if (query.from) {
      qb.andWhere('history.contactTime >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('history.contactTime <= :to', { to: query.to });
    }
    qb.orderBy('history.contactTime', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ContactHistory> {
    const history = await this.historyRepo.findOne({
      where: { id },
      relations: { employee: true, contact: true, contactType: true, opportunity: true },
    });
    if (!history) {
      throw new NotFoundException('Contact history not found');
    }
    return history;
  }
}
```

- [ ] **Step 4: Corre el spec y pasa.**
```
pnpm test -- contact-history.service.spec
```
Esperado: `6 passed`.

- [ ] **Step 5: Commit.**
```
git add src/contact-history/contact-history.service.ts src/contact-history/contact-history.service.spec.ts
git commit -m "feat(contact-history): service sealing employee and updating opportunity lastContactAt"
```
Esperado: 1 commit con service + spec.

---

### Task 6.3: contact-history — controller, módulo y registro

**Files:**
- Create: `src/contact-history/contact-history.controller.ts`
- Create: `src/contact-history/contact-history.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `CurrentUser` + `AuthUser` (`src/config/current-user.decorator.ts`) — `AuthUser = { userId: number; employeeId: number; roles: string[]; sessionId: string }`.
- Consumes: `ContactHistoryService` (Task 6.2).
- Produces: `ContactHistoryController` (`POST /contact-history`, `GET /contact-history`, `GET /contact-history/:id`), `ContactHistoryModule`.

- [ ] **Step 1: Escribe el controller delgado** (sella `employeeId` desde `@CurrentUser`; retorna dato crudo).
```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ContactHistoryService } from './contact-history.service';
import { CreateContactHistoryDto } from './dto/create-contact-history.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';
import { CurrentUser, AuthUser } from '../config/current-user.decorator';

@Controller('contact-history')
export class ContactHistoryController {
  constructor(private readonly contactHistoryService: ContactHistoryService) {}

  @Post()
  create(@Body() dto: CreateContactHistoryDto, @CurrentUser() user: AuthUser) {
    return this.contactHistoryService.create(dto, user.employeeId);
  }

  @Get()
  findAll(@Query() query: QueryContactHistoryDto) {
    return this.contactHistoryService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactHistoryService.findOne(id);
  }
}
```

- [ ] **Step 2: Escribe el módulo** (registra `ContactHistory` y `Opportunity` con `forFeature`).
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactHistory } from './contact-history.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistoryService } from './contact-history.service';
import { ContactHistoryController } from './contact-history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContactHistory, Opportunity])],
  controllers: [ContactHistoryController],
  providers: [ContactHistoryService],
})
export class ContactHistoryModule {}
```

- [ ] **Step 3: Registra el módulo en `main.module.ts`** (añade el import y la entrada en `imports`).
```ts
import { ContactHistoryModule } from './contact-history/contact-history.module';
```
Y agrega `ContactHistoryModule,` al array `imports` del `@Module`, junto a los demás módulos.

- [ ] **Step 4: Compila para verificar el cableado.**
```
pnpm build
```
Esperado: build sin errores de TypeScript.

- [ ] **Step 5: Commit.**
```
git add src/contact-history/contact-history.controller.ts src/contact-history/contact-history.module.ts src/main.module.ts
git commit -m "feat(contact-history): wire controller and module into app"
```
Esperado: 1 commit con controller + module + main.module.

---

### Task 6.4: contact-requests — DTOs (create público, handle, query)

**Files:**
- Create: `src/contact-requests/dto/create-contact-request.dto.ts`
- Create: `src/contact-requests/dto/handle-contact-request.dto.ts`
- Create: `src/contact-requests/dto/query-contact-request.dto.ts`

**Interfaces:**
- Consumes: `PaginationDto` (`src/config/pagination.dto.ts`).
- Produces: `CreateContactRequestDto` = `{ contactName?: string; phoneNumber?: string; email?: string; requestDesc?: string }`.
- Produces: `HandleContactRequestDto` = `{ resultingClientId?: number }`.
- Produces: `QueryContactRequestDto extends PaginationDto` = `+ { wasHandled?: boolean }`.

- [ ] **Step 1: Escribe `CreateContactRequestDto`** (todos opcionales; el payload inbound es libre, pero `whitelist + forbidNonWhitelisted` exige declarar las props).
```ts
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactRequestDto {
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  requestDesc?: string;
}
```

- [ ] **Step 2: Escribe `HandleContactRequestDto`** (solo `resultingClientId` opcional).
```ts
import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class HandleContactRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resultingClientId?: number;
}
```

- [ ] **Step 3: Escribe `QueryContactRequestDto`** (`?wasHandled` booleano desde querystring + paginación).
```ts
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryContactRequestDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  wasHandled?: boolean;
}
```

- [ ] **Step 4: Commit.**
```
git add src/contact-requests/dto/create-contact-request.dto.ts src/contact-requests/dto/handle-contact-request.dto.ts src/contact-requests/dto/query-contact-request.dto.ts
git commit -m "feat(contact-requests): add create, handle and query dtos"
```
Esperado: 1 commit con 3 DTOs.

---

### Task 6.5: contact-requests — service con TDD de handle

**Files:**
- Test: `src/contact-requests/contact-requests.service.spec.ts`
- Create: `src/contact-requests/contact-requests.service.ts`

**Interfaces:**
- Consumes: `ContactRequest` (`src/contact-requests/contact-request.entity.ts`) — `{ id, contactName?, phoneNumber?, email?, requestDesc?, wasHandled: boolean, createdAt: Date, handledByEmployeeId?, handledBy?, handledAt?, resultingClientId?, resultingClient? }`.
- Consumes: `CreateContactRequestDto`, `HandleContactRequestDto`, `QueryContactRequestDto` (Task 6.4).
- Produces: `ContactRequestsService` con `create(dto)`, `findAll(query)`, `findOne(id)`, `handle(id, dto, employeeId)`.

- [ ] **Step 1: Escribe el spec que falla** (handle sella `wasHandled/handledAt/handledByEmployeeId`, aplica `resultingClientId` opcional, lanza `NotFound` si no existe y `Conflict` si ya estaba atendida).
```ts
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactRequestsService } from './contact-requests.service';
import { ContactRequest } from './contact-request.entity';

describe('ContactRequestsService handle', () => {
  let service: ContactRequestsService;
  let repo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; findAndCount: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactRequestsService,
        { provide: getRepositoryToken(ContactRequest), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ContactRequestsService);
  });

  it('marks the request as handled sealing employee and timestamp', async () => {
    repo.findOne.mockResolvedValue({ id: 3, wasHandled: false });
    const result = await service.handle(3, { resultingClientId: 11 }, 7);
    expect(result.wasHandled).toBe(true);
    expect(result.handledByEmployeeId).toBe(7);
    expect(result.handledAt).toBeInstanceOf(Date);
    expect(result.resultingClientId).toBe(11);
    expect(repo.save).toHaveBeenCalled();
  });

  it('handles without resultingClientId', async () => {
    repo.findOne.mockResolvedValue({ id: 3, wasHandled: false });
    const result = await service.handle(3, {}, 7);
    expect(result.wasHandled).toBe(true);
    expect(result.resultingClientId).toBeUndefined();
  });

  it('throws NotFound when the request does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.handle(99, {}, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Conflict when already handled', async () => {
    repo.findOne.mockResolvedValue({ id: 3, wasHandled: true });
    await expect(service.handle(3, {}, 7)).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Corre el spec y falla.**
```
pnpm test -- contact-requests.service.spec
```
Esperado: falla (`Cannot find module './contact-requests.service'`).

- [ ] **Step 3: Implementa `ContactRequestsService`.**
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactRequest } from './contact-request.entity';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';
import { QueryContactRequestDto } from './dto/query-contact-request.dto';
import { HandleContactRequestDto } from './dto/handle-contact-request.dto';

@Injectable()
export class ContactRequestsService {
  constructor(
    @InjectRepository(ContactRequest)
    private readonly requestRepo: Repository<ContactRequest>,
  ) {}

  async create(dto: CreateContactRequestDto): Promise<ContactRequest> {
    const entity = this.requestRepo.create(dto);
    return this.requestRepo.save(entity);
  }

  async findAll(
    query: QueryContactRequestDto,
  ): Promise<{ items: ContactRequest[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.requestRepo.findAndCount({
      where: query.wasHandled === undefined ? {} : { wasHandled: query.wasHandled },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ContactRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: { handledBy: true, resultingClient: true },
    });
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }
    return request;
  }

  async handle(id: number, dto: HandleContactRequestDto, employeeId: number): Promise<ContactRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }
    if (request.wasHandled) {
      throw new ConflictException('Contact request already handled');
    }
    request.wasHandled = true;
    request.handledAt = new Date();
    request.handledByEmployeeId = employeeId;
    if (dto.resultingClientId !== undefined) {
      request.resultingClientId = dto.resultingClientId;
    }
    return this.requestRepo.save(request);
  }
}
```

- [ ] **Step 4: Corre el spec y pasa.**
```
pnpm test -- contact-requests.service.spec
```
Esperado: `4 passed`.

- [ ] **Step 5: Commit.**
```
git add src/contact-requests/contact-requests.service.ts src/contact-requests/contact-requests.service.spec.ts
git commit -m "feat(contact-requests): service with handle sealing employee and timestamp"
```
Esperado: 1 commit con service + spec.

---

### Task 6.6: contact-requests — controller (POST público + API key), módulo y registro

**Files:**
- Create: `src/contact-requests/contact-requests.controller.ts`
- Create: `src/contact-requests/contact-requests.module.ts`
- Modify: `src/main.module.ts`

**Interfaces:**
- Consumes: `Public` (`src/config/public.decorator.ts`) — `SetMetadata('isPublic', true)`.
- Consumes: `ApiKeyGuard` (`src/config/api-key.guard.ts`) — valida `x-api-key === process.env.INBOUND_API_KEY`.
- Consumes: `CurrentUser` + `AuthUser` (`src/config/current-user.decorator.ts`).
- Consumes: `ContactRequestsService` (Task 6.5).
- Produces: `ContactRequestsController` (`POST` público, `GET ?wasHandled`, `GET /:id`, `PATCH /:id/handle`), `ContactRequestsModule`.

- [ ] **Step 1: Escribe el controller.** El `POST` lleva `@Public()` (salta JWT) + `@UseGuards(ApiKeyGuard)` a nivel de método; el resto queda protegido por los guards globales.
```ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactRequestsService } from './contact-requests.service';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';
import { QueryContactRequestDto } from './dto/query-contact-request.dto';
import { HandleContactRequestDto } from './dto/handle-contact-request.dto';
import { Public } from '../config/public.decorator';
import { ApiKeyGuard } from '../config/api-key.guard';
import { CurrentUser, AuthUser } from '../config/current-user.decorator';

@Controller('contact-requests')
export class ContactRequestsController {
  constructor(private readonly contactRequestsService: ContactRequestsService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post()
  create(@Body() dto: CreateContactRequestDto) {
    return this.contactRequestsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryContactRequestDto) {
    return this.contactRequestsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactRequestsService.findOne(id);
  }

  @Patch(':id/handle')
  handle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandleContactRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contactRequestsService.handle(id, dto, user.employeeId);
  }
}
```

- [ ] **Step 2: Escribe el módulo.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactRequest } from './contact-request.entity';
import { ContactRequestsService } from './contact-requests.service';
import { ContactRequestsController } from './contact-requests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContactRequest])],
  controllers: [ContactRequestsController],
  providers: [ContactRequestsService],
})
export class ContactRequestsModule {}
```

- [ ] **Step 3: Registra el módulo en `main.module.ts`** (añade el import y la entrada en `imports`).
```ts
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
```
Y agrega `ContactRequestsModule,` al array `imports` del `@Module`.

- [ ] **Step 4: Compila para verificar el cableado.**
```
pnpm build
```
Esperado: build sin errores de TypeScript.

- [ ] **Step 5: Commit.**
```
git add src/contact-requests/contact-requests.controller.ts src/contact-requests/contact-requests.module.ts src/main.module.ts
git commit -m "feat(contact-requests): public api-key protected post and module wiring"
```
Esperado: 1 commit con controller + module + main.module.

---

### Task 6.7: contact-requests — e2e del POST público con API key

**Files:**
- Test: `test/contact-requests.e2e-spec.ts`

**Interfaces:**
- Consumes: `ContactRequestsModule` (Task 6.6), `ContactRequest` entity, `ApiKeyGuard` (vía `@UseGuards` del controller).
- Produces: e2e que verifica que el `POST` sin `x-api-key` da 401/403 y con la key correcta crea la request.

- [ ] **Step 1: Escribe el e2e** (Fastify + supertest; repo mockeado vía `getRepositoryToken`; setea `INBOUND_API_KEY`; aplica el mismo prefijo `/api` y `ValidationPipe` que prod).
```ts
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { ContactRequestsModule } from '../src/contact-requests/contact-requests.module';
import { ContactRequest } from '../src/contact-requests/contact-request.entity';

describe('ContactRequests public endpoint (e2e)', () => {
  let app: NestFastifyApplication;
  const repo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 1, wasHandled: false, createdAt: new Date(), ...value })),
  };

  beforeAll(async () => {
    process.env.INBOUND_API_KEY = 'test-inbound-key';
    const moduleRef = await Test.createTestingModule({
      imports: [ContactRequestsModule],
    })
      .overrideProvider(getRepositoryToken(ContactRequest))
      .useValue(repo)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects POST without x-api-key', () => {
    return request(app.getHttpServer())
      .post('/api/contact-requests')
      .send({ contactName: 'Lead', email: 'lead@acme.com' })
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  it('creates the request with a valid x-api-key', () => {
    return request(app.getHttpServer())
      .post('/api/contact-requests')
      .set('x-api-key', 'test-inbound-key')
      .send({ contactName: 'Lead', email: 'lead@acme.com' })
      .expect(201)
      .expect((res) => {
        expect(res.body.id).toBe(1);
        expect(repo.save).toHaveBeenCalled();
      });
  });
});
```

- [ ] **Step 2: Corre el e2e y pasa.**
```
pnpm test:e2e -- contact-requests
```
Esperado: `2 passed` (rechazo sin key, creación con key).

- [ ] **Step 3: Commit.**
```
git add test/contact-requests.e2e-spec.ts
git commit -m "test(contact-requests): e2e for public inbound endpoint with api key"
```
Esperado: 1 commit con el e2e.


## Fase 5 — Comercial & Reclutamiento

Read the spec and confirmed existing patterns. The `Opportunity` entity and `PipelineStage` entity are produced by earlier phases (Fase 1 cimientos / Fase 3 catálogos); Fase 5 here builds only the `opportunities` Nest module that consumes them. Below are my tasks.

### Task 7.1: DTOs del módulo opportunities

**Files:**
- Create `src/opportunities/dto/create-opportunity.dto.ts`
- Create `src/opportunities/dto/update-opportunity.dto.ts`
- Create `src/opportunities/dto/query-opportunity.dto.ts`
- Create `src/opportunities/dto/change-stage.dto.ts`
- Create `src/opportunities/dto/send-proposal.dto.ts`
- Create `src/opportunities/dto/follow-up.dto.ts`
- Create `src/opportunities/dto/lose-opportunity.dto.ts`

**Interfaces:**
- Consumes: `OpportunityStatus`, `Seniority` enums from `src/opportunities/opportunity.entity.ts`; `PaginationDto` from `src/config/pagination.dto.ts`.
- Produces: `CreateOpportunityDto`, `UpdateOpportunityDto`, `QueryOpportunityDto`, `ChangeStageDto`, `SendProposalDto`, `FollowUpDto`, `LoseOpportunityDto`.

- [ ] **Step 1: Escribe `CreateOpportunityDto`** declarando TODAS las props settables (whitelist global rechaza extras).
```ts
import { Type } from 'class-transformer';
import {
  IsDate,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OpportunityStatus, Seniority } from '../opportunity.entity';

export class CreateOpportunityDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  areaId?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  responsibleEmployeeId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientContactId?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pipelineStageId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  originContactRequestId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(Seniority)
  seniority?: Seniority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastContactAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextFollowUpAt?: Date;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;
}
```

- [ ] **Step 2: Escribe `UpdateOpportunityDto`** con `PartialType`.
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateOpportunityDto } from './create-opportunity.dto';

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}
```

- [ ] **Step 3: Escribe `QueryOpportunityDto`** (filtros + paginación; `followUpDue` se transforma del string del query a boolean).
```ts
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';
import { OpportunityStatus } from '../opportunity.entity';

export class QueryOpportunityDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  sectorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  areaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  stageId?: number;

  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  responsibleEmployeeId?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  followUpDue?: boolean;
}
```

- [ ] **Step 4: Escribe `ChangeStageDto`** (etapa destino + override de probabilidad + razón de pérdida opcional).
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class ChangeStageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pipelineStageId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsString()
  lostReason?: string;
}
```

- [ ] **Step 5: Escribe `SendProposalDto`, `FollowUpDto` y `LoseOpportunityDto`.**
```ts
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class SendProposalDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}
```
```ts
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class FollowUpDto {
  @Type(() => Date)
  @IsDate()
  nextFollowUpAt: Date;
}
```
```ts
import { IsOptional, IsString } from 'class-validator';

export class LoseOpportunityDto {
  @IsOptional()
  @IsString()
  lostReason?: string;
}
```

- [ ] **Step 6: Commit.**
```bash
git add src/opportunities/dto/
git commit -m "feat(opportunities): add create/update/query and action dtos"
```

### Task 7.2: OpportunitiesService — CRUD y listado con filtros (test representativo)

**Files:**
- Create `src/opportunities/opportunities.service.ts`
- Test `src/opportunities/opportunities.service.spec.ts`

**Interfaces:**
- Consumes: `Opportunity` (`src/opportunities/opportunity.entity.ts`), `PipelineStage` (`src/pipeline-stages/pipeline-stage.entity.ts`), DTOs de Task 7.1.
- Produces: `OpportunitiesService` con `create(dto)`, `findAll(query): Promise<{ items; total; page; limit }>`, `findOne(id): Promise<Opportunity>`, `update(id, dto)`, `remove(id): Promise<void>`.

- [ ] **Step 1: Escribe el test que falla** (setup compartido + create + filtro `followUpDue`/forma paginada).
```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunitiesService } from './opportunities.service';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';

type MockRepo<T extends object = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;
  let opportunityRepo: MockRepo;
  let pipelineStageRepo: MockRepo;

  beforeEach(async () => {
    opportunityRepo = createMockRepo();
    pipelineStageRepo = createMockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OpportunitiesService,
        { provide: getRepositoryToken(Opportunity), useValue: opportunityRepo },
        { provide: getRepositoryToken(PipelineStage), useValue: pipelineStageRepo },
      ],
    }).compile();
    service = moduleRef.get(OpportunitiesService);
  });

  describe('create', () => {
    it('persists a new opportunity', async () => {
      const dto: any = { clientId: 1, responsibleEmployeeId: 2, pipelineStageId: 3 };
      const entity = { id: 10, ...dto };
      opportunityRepo.create!.mockReturnValue(entity);
      opportunityRepo.save!.mockResolvedValue(entity);
      const result = await service.create(dto);
      expect(opportunityRepo.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(entity);
    });
  });

  describe('findAll', () => {
    it('applies the followUpDue filter and returns the paginated shape', async () => {
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 1]),
      };
      opportunityRepo.createQueryBuilder!.mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20, followUpDue: true });

      expect(qb.andWhere).toHaveBeenCalledWith('opportunity.nextFollowUpAt <= :now', {
        now: expect.any(Date),
      });
      expect(result).toEqual({ items: [{ id: 1 }], total: 1, page: 1, limit: 20 });
    });
  });
});
```

- [ ] **Step 2: Corre el test y falla** (el service no existe).
```bash
pnpm test -- opportunities.service
```
Esperado: `Cannot find module './opportunities.service'` / suite roja.

- [ ] **Step 3: Implementa el service (CRUD + filtros)**. `sectorId` filtra vía join a `client.sectorId`; el resto son `andWhere` directos sobre escalares.
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
  ) {}

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    const opportunity = this.opportunityRepository.create(dto);
    return this.opportunityRepository.save(opportunity);
  }

  async findAll(query: QueryOpportunityDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.opportunityRepository.createQueryBuilder('opportunity');

    if (query.sectorId !== undefined) {
      qb.leftJoin('opportunity.client', 'client').andWhere(
        'client.sectorId = :sectorId',
        { sectorId: query.sectorId },
      );
    }
    if (query.clientId !== undefined) {
      qb.andWhere('opportunity.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.areaId !== undefined) {
      qb.andWhere('opportunity.areaId = :areaId', { areaId: query.areaId });
    }
    if (query.stageId !== undefined) {
      qb.andWhere('opportunity.pipelineStageId = :stageId', { stageId: query.stageId });
    }
    if (query.status !== undefined) {
      qb.andWhere('opportunity.status = :status', { status: query.status });
    }
    if (query.responsibleEmployeeId !== undefined) {
      qb.andWhere('opportunity.responsibleEmployeeId = :responsibleEmployeeId', {
        responsibleEmployeeId: query.responsibleEmployeeId,
      });
    }
    if (query.followUpDue) {
      qb.andWhere('opportunity.nextFollowUpAt <= :now', { now: new Date() });
    }

    qb.orderBy('opportunity.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({ where: { id } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  async update(id: number, dto: UpdateOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    Object.assign(opportunity, dto);
    return this.opportunityRepository.save(opportunity);
  }

  async remove(id: number): Promise<void> {
    const opportunity = await this.findOne(id);
    await this.opportunityRepository.remove(opportunity);
  }
}
```

- [ ] **Step 4: Corre el test y pasa.**
```bash
pnpm test -- opportunities.service
```
Esperado: 2 passed.

- [ ] **Step 5: Commit.**
```bash
git add src/opportunities/opportunities.service.ts src/opportunities/opportunities.service.spec.ts
git commit -m "feat(opportunities): service crud and filtered listing"
```

### Task 7.3: Transición de etapa (probabilidad amarrada a la etapa) — TDD completo

**Files:**
- Modify `src/opportunities/opportunities.service.ts`
- Test `src/opportunities/opportunities.service.spec.ts`

**Interfaces:**
- Consumes: `PipelineStage` (`id`, `probability`, `isWon`, `isLost`, `active`), `OpportunityStatus`, `ChangeStageDto`.
- Produces: `OpportunitiesService.changeStage(id: number, dto: ChangeStageDto): Promise<Opportunity>`.

- [ ] **Step 1: Añade el import de excepciones al spec** (Edit sobre la primera línea).
  - old_string: `import { Test } from '@nestjs/testing';`
  - new_string:
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
```

- [ ] **Step 2: Escribe el bloque de tests que falla** (Edit: inserta el `describe` antes del cierre del `describe` raíz; ancla en `  });\n});`).
  - old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('changeStage', () => {
    beforeEach(() => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      opportunityRepo.save!.mockImplementation(async (o: any) => o);
    });

    it('takes the probability from the stage when no override is given', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 5, probability: 40, active: true, isWon: false, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 5 });
      expect(result.pipelineStageId).toBe(5);
      expect(result.probability).toBe(40);
    });

    it('honors an explicit probability override from the body', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 5, probability: 40, active: true, isWon: false, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 5, probability: 55 });
      expect(result.probability).toBe(55);
    });

    it('marks the opportunity as won when the stage is a won stage', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 9, probability: 100, active: true, isWon: true, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 9 });
      expect(result.status).toBe('won');
      expect(result.wonAt).toBeInstanceOf(Date);
    });

    it('marks the opportunity as lost and stores the reason for a lost stage', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 10, probability: 0, active: true, isWon: false, isLost: true,
      });
      const result = await service.changeStage(1, { pipelineStageId: 10, lostReason: 'budget' });
      expect(result.status).toBe('lost');
      expect(result.lostAt).toBeInstanceOf(Date);
      expect(result.lostReason).toBe('budget');
    });

    it('rejects an inactive stage with BadRequestException', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 7, probability: 30, active: false, isWon: false, isLost: false,
      });
      await expect(service.changeStage(1, { pipelineStageId: 7 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the stage does not exist', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue(null);
      await expect(service.changeStage(1, { pipelineStageId: 99 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```

- [ ] **Step 3: Corre y falla.**
```bash
pnpm test -- opportunities.service
```
Esperado: `service.changeStage is not a function`.

- [ ] **Step 4: Implementa `changeStage`** (Edit en el service: añade `BadRequestException` al import de `@nestjs/common`, `OpportunityStatus` al import de la entity, e inserta el método antes del `remove`).
  - Import edit 1 — old_string: `import { Injectable, NotFoundException } from '@nestjs/common';`
    new_string: `import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';`
  - Import edit 2 — old_string: `import { Opportunity } from './opportunity.entity';`
    new_string: `import { Opportunity, OpportunityStatus } from './opportunity.entity';`
  - Import edit 3 — old_string: `import { QueryOpportunityDto } from './dto/query-opportunity.dto';`
    new_string:
```ts
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
```
  - Method edit — old_string: `  async remove(id: number): Promise<void> {`
    new_string:
```ts
  async changeStage(id: number, dto: ChangeStageDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({
      where: { id: dto.pipelineStageId },
    });
    if (!stage) {
      throw new NotFoundException('Pipeline stage not found');
    }
    if (!stage.active) {
      throw new BadRequestException('Pipeline stage is not active');
    }
    opportunity.pipelineStageId = stage.id;
    opportunity.probability = dto.probability ?? stage.probability;
    if (stage.isWon) {
      opportunity.status = OpportunityStatus.Won;
      opportunity.wonAt = new Date();
    }
    if (stage.isLost) {
      opportunity.status = OpportunityStatus.Lost;
      opportunity.lostAt = new Date();
      if (dto.lostReason !== undefined) {
        opportunity.lostReason = dto.lostReason;
      }
    }
    return this.opportunityRepository.save(opportunity);
  }

  async remove(id: number): Promise<void> {
```

- [ ] **Step 5: Corre y pasa.**
```bash
pnpm test -- opportunities.service
```
Esperado: 8 passed.

- [ ] **Step 6: Commit.**
```bash
git add src/opportunities/opportunities.service.ts src/opportunities/opportunities.service.spec.ts
git commit -m "feat(opportunities): stage transition with stage-bound probability and won/lost sealing"
```

### Task 7.4: Atajos win / lose — TDD completo

**Files:**
- Modify `src/opportunities/opportunities.service.ts`
- Test `src/opportunities/opportunities.service.spec.ts`

**Interfaces:**
- Consumes: `PipelineStage` (busca por `{ isWon: true, active: true }` / `{ isLost: true, active: true }`), `LoseOpportunityDto`, `OpportunityStatus`.
- Produces: `OpportunitiesService.win(id: number): Promise<Opportunity>`, `lose(id: number, dto: LoseOpportunityDto): Promise<Opportunity>`.

- [ ] **Step 1: Escribe los tests que fallan** (Edit: inserta antes del cierre del `describe` raíz; ancla en `  });\n});`).
  - old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('win', () => {
    it('sets status won, stamps wonAt and moves to the won stage', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 9, probability: 100, isWon: true, active: true,
      });
      opportunityRepo.save!.mockImplementation(async (o: any) => o);
      const result = await service.win(1);
      expect(result.status).toBe('won');
      expect(result.wonAt).toBeInstanceOf(Date);
      expect(result.pipelineStageId).toBe(9);
      expect(result.probability).toBe(100);
    });
  });

  describe('lose', () => {
    it('sets status lost, stamps lostAt, stores reason and moves to the lost stage', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 10, probability: 0, isLost: true, active: true,
      });
      opportunityRepo.save!.mockImplementation(async (o: any) => o);
      const result = await service.lose(1, { lostReason: 'no budget' });
      expect(result.status).toBe('lost');
      expect(result.lostAt).toBeInstanceOf(Date);
      expect(result.lostReason).toBe('no budget');
      expect(result.pipelineStageId).toBe(10);
    });
  });
});
```

- [ ] **Step 2: Corre y falla.**
```bash
pnpm test -- opportunities.service
```
Esperado: `service.win is not a function`.

- [ ] **Step 3: Implementa `win` y `lose`** (Edit: añade el import de `LoseOpportunityDto` e inserta los métodos antes del `remove`).
  - Import edit — old_string:
```ts
import { ChangeStageDto } from './dto/change-stage.dto';
```
    new_string:
```ts
import { ChangeStageDto } from './dto/change-stage.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
```
  - Method edit — old_string: `  async remove(id: number): Promise<void> {`
    new_string:
```ts
  async win(id: number): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({
      where: { isWon: true, active: true },
    });
    opportunity.status = OpportunityStatus.Won;
    opportunity.wonAt = new Date();
    if (stage) {
      opportunity.pipelineStageId = stage.id;
      opportunity.probability = stage.probability;
    }
    return this.opportunityRepository.save(opportunity);
  }

  async lose(id: number, dto: LoseOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({
      where: { isLost: true, active: true },
    });
    opportunity.status = OpportunityStatus.Lost;
    opportunity.lostAt = new Date();
    if (dto.lostReason !== undefined) {
      opportunity.lostReason = dto.lostReason;
    }
    if (stage) {
      opportunity.pipelineStageId = stage.id;
      opportunity.probability = stage.probability;
    }
    return this.opportunityRepository.save(opportunity);
  }

  async remove(id: number): Promise<void> {
```

- [ ] **Step 4: Corre y pasa.**
```bash
pnpm test -- opportunities.service
```
Esperado: 10 passed.

- [ ] **Step 5: Commit.**
```bash
git add src/opportunities/opportunities.service.ts src/opportunities/opportunities.service.spec.ts
git commit -m "feat(opportunities): win and lose shortcuts moving to closing stage"
```

### Task 7.5: Propuesta y seguimiento — TDD

**Files:**
- Modify `src/opportunities/opportunities.service.ts`
- Test `src/opportunities/opportunities.service.spec.ts`

**Interfaces:**
- Consumes: `SendProposalDto`, `FollowUpDto`.
- Produces: `OpportunitiesService.sendProposal(id, dto): Promise<Opportunity>` (sella `proposalSentAt` solo si es null, fija `amount`), `setFollowUp(id, dto): Promise<Opportunity>`.

- [ ] **Step 1: Escribe los tests que fallan** (Edit: inserta antes del cierre del `describe` raíz; ancla en `  });\n});`).
  - old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('sendProposal', () => {
    it('stamps proposalSentAt when null and stores the amount', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, proposalSentAt: null });
      opportunityRepo.save!.mockImplementation(async (o: any) => o);
      const result = await service.sendProposal(1, { amount: 12000 });
      expect(result.proposalSentAt).toBeInstanceOf(Date);
      expect(result.amount).toBe(12000);
    });

    it('keeps the original proposalSentAt when already set', async () => {
      const existing = new Date('2026-01-01T00:00:00.000Z');
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, proposalSentAt: existing });
      opportunityRepo.save!.mockImplementation(async (o: any) => o);
      const result = await service.sendProposal(1, { amount: 9000 });
      expect(result.proposalSentAt).toBe(existing);
      expect(result.amount).toBe(9000);
    });
  });

  describe('setFollowUp', () => {
    it('stores the next follow up date', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1 });
      opportunityRepo.save!.mockImplementation(async (o: any) => o);
      const next = new Date('2026-07-01T00:00:00.000Z');
      const result = await service.setFollowUp(1, { nextFollowUpAt: next });
      expect(result.nextFollowUpAt).toBe(next);
    });
  });
});
```

- [ ] **Step 2: Corre y falla.**
```bash
pnpm test -- opportunities.service
```
Esperado: `service.sendProposal is not a function`.

- [ ] **Step 3: Implementa `sendProposal` y `setFollowUp`** (Edit: añade imports e inserta métodos antes del `remove`).
  - Import edit — old_string:
```ts
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
```
    new_string:
```ts
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
import { SendProposalDto } from './dto/send-proposal.dto';
import { FollowUpDto } from './dto/follow-up.dto';
```
  - Method edit — old_string: `  async remove(id: number): Promise<void> {`
    new_string:
```ts
  async sendProposal(id: number, dto: SendProposalDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    if (opportunity.proposalSentAt == null) {
      opportunity.proposalSentAt = new Date();
    }
    opportunity.amount = dto.amount;
    return this.opportunityRepository.save(opportunity);
  }

  async setFollowUp(id: number, dto: FollowUpDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.nextFollowUpAt = dto.nextFollowUpAt;
    return this.opportunityRepository.save(opportunity);
  }

  async remove(id: number): Promise<void> {
```

- [ ] **Step 4: Corre y pasa.**
```bash
pnpm test -- opportunities.service
```
Esperado: 13 passed.

- [ ] **Step 5: Commit.**
```bash
git add src/opportunities/opportunities.service.ts src/opportunities/opportunities.service.spec.ts
git commit -m "feat(opportunities): proposal stamping and follow-up scheduling"
```

### Task 7.6: Controller, módulo y registro

**Files:**
- Create `src/opportunities/opportunities.controller.ts`
- Create `src/opportunities/opportunities.module.ts`
- Modify `src/main.module.ts`

**Interfaces:**
- Consumes: `OpportunitiesService`, todos los DTOs de Task 7.1, `Opportunity` y `PipelineStage` entities.
- Produces: `OpportunitiesController` (rutas bajo `/api/opportunities`), `OpportunitiesModule`.

- [ ] **Step 1: Escribe el controller delgado** (solo delega; el interceptor global envuelve la respuesta).
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { SendProposalDto } from './dto/send-proposal.dto';
import { FollowUpDto } from './dto/follow-up.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryOpportunityDto) {
    return this.opportunitiesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.remove(id);
  }

  @Patch(':id/stage')
  changeStage(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStageDto) {
    return this.opportunitiesService.changeStage(id, dto);
  }

  @Patch(':id/proposal')
  sendProposal(@Param('id', ParseIntPipe) id: number, @Body() dto: SendProposalDto) {
    return this.opportunitiesService.sendProposal(id, dto);
  }

  @Patch(':id/follow-up')
  setFollowUp(@Param('id', ParseIntPipe) id: number, @Body() dto: FollowUpDto) {
    return this.opportunitiesService.setFollowUp(id, dto);
  }

  @Patch(':id/win')
  win(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.win(id);
  }

  @Patch(':id/lose')
  lose(@Param('id', ParseIntPipe) id: number, @Body() dto: LoseOpportunityDto) {
    return this.opportunitiesService.lose(id, dto);
  }
}
```

- [ ] **Step 2: Escribe el módulo** (registra ambas entities con `forFeature`).
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity, PipelineStage])],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
```

- [ ] **Step 3: Registra el módulo en `main.module.ts`** (dos Edits).
  - Import — old_string: `import { AuthModule } from './auth/auth.module';`
    new_string:
```ts
import { AuthModule } from './auth/auth.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
```
  - Imports array — old_string: `    AuthModule,
  ],`
    new_string:
```ts
    AuthModule,
    OpportunitiesModule,
  ],
```

- [ ] **Step 4: Verifica build + suite unit completa.**
```bash
pnpm build && pnpm test -- opportunities
```
Esperado: build sin errores; 13 passed.

- [ ] **Step 5: Commit.**
```bash
git add src/opportunities/opportunities.controller.ts src/opportunities/opportunities.module.ts src/main.module.ts
git commit -m "feat(opportunities): controller routes and module wiring"
```

### Task 8.1: Módulo candidates (CRUD + búsqueda paginada + GET /:id con applications)

**Files:**
- Create: `src/candidates/candidate.entity.ts`
- Create: `src/candidates/dto/create-candidate.dto.ts`
- Create: `src/candidates/dto/update-candidate.dto.ts`
- Create: `src/candidates/dto/search-candidates.dto.ts`
- Create: `src/candidates/candidates.service.ts`
- Create: `src/candidates/candidates.controller.ts`
- Create: `src/candidates/candidates.module.ts`
- Modify: `src/main.module.ts`
- Test: `src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `ColumnNumericTransformer` (`src/config/numeric.transformer.ts`); `PaginationDto { page: number; limit: number }` (`src/config/pagination.dto.ts`); `Application` (`src/applications/application.entity.ts`, producido en Task 8.2 — referencia perezosa con `() => Application`).
- Produces: `Candidate` entity; `export const CANDIDATE_STATUSES`, `export type CandidateStatus`; `CandidatesService.create/findAll/findOne/update/remove`; `CandidatesModule`.

- [ ] **Step 1: Escribe la entity `Candidate`.**
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { Application } from '../applications/application.entity';

export const CANDIDATE_STATUSES = [
  'new',
  'active',
  'placed',
  'on_hold',
  'discarded',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

@Entity('candidates')
export class Candidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  secondName?: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  surName?: string;

  @Column({ nullable: true })
  nationalId?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ nullable: true })
  headline?: string;

  @Column({ nullable: true })
  source?: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  expectedSalary?: number;

  @Column({
    type: 'enum',
    enum: [...CANDIDATE_STATUSES],
    enumName: 'candidate_status',
    default: 'new',
  })
  status: CandidateStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Application, (application) => application.candidate)
  applications: Application[];
}
```

- [ ] **Step 2: Escribe los DTOs create / update / search.**
```ts
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CANDIDATE_STATUSES, CandidateStatus } from '../candidate.entity';

export class CreateCandidateDto {
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  surName?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedSalary?: number;

  @IsOptional()
  @IsIn([...CANDIDATE_STATUSES])
  status?: CandidateStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
```
```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCandidateDto } from './create-candidate.dto';

export class UpdateCandidateDto extends PartialType(CreateCandidateDto) {}
```
```ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';
import { CANDIDATE_STATUSES, CandidateStatus } from '../candidate.entity';

export class SearchCandidatesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsIn([...CANDIDATE_STATUSES])
  status?: CandidateStatus;

  @IsOptional()
  @IsString()
  source?: string;
}
```

- [ ] **Step 3: Escribe el test representativo que falla (`findOne`).**
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CandidatesService } from './candidates.service';
import { Candidate } from './candidate.entity';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let repository: jest.Mocked<Repository<Candidate>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        {
          provide: getRepositoryToken(Candidate),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CandidatesService);
    repository = module.get(getRepositoryToken(Candidate));
  });

  it('findOne throws NotFoundException when candidate is missing', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('findOne returns candidate loading the applications relation', async () => {
    const candidate = { id: 1, applications: [] } as unknown as Candidate;
    repository.findOne.mockResolvedValue(candidate);
    const result = await service.findOne(1);
    expect(result).toBe(candidate);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: { applications: true },
    });
  });
});
```

- [ ] **Step 4: Corre el test y verifica que falla.**
```
pnpm test src/candidates/candidates.service.spec.ts
```
Esperado: falla en compilación/ejecución porque `./candidates.service` aún no existe (`Cannot find module './candidates.service'`).

- [ ] **Step 5: Implementa `CandidatesService`.**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate } from './candidate.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { SearchCandidatesDto } from './dto/search-candidates.dto';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(Candidate)
    private readonly candidatesRepository: Repository<Candidate>,
  ) {}

  async create(dto: CreateCandidateDto): Promise<Candidate> {
    const candidate = this.candidatesRepository.create(dto);
    return this.candidatesRepository.save(candidate);
  }

  async findAll(query: SearchCandidatesDto): Promise<{
    items: Candidate[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, name, email, status, source } = query;
    const qb = this.candidatesRepository.createQueryBuilder('candidate');
    if (name) {
      qb.andWhere(
        '(candidate.firstName ILIKE :name OR candidate.secondName ILIKE :name OR candidate.lastName ILIKE :name OR candidate.surName ILIKE :name)',
        { name: `%${name}%` },
      );
    }
    if (email) qb.andWhere('candidate.email ILIKE :email', { email: `%${email}%` });
    if (status) qb.andWhere('candidate.status = :status', { status });
    if (source) qb.andWhere('candidate.source = :source', { source });
    qb.orderBy('candidate.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Candidate> {
    const candidate = await this.candidatesRepository.findOne({
      where: { id },
      relations: { applications: true },
    });
    if (!candidate) throw new NotFoundException(`Candidate ${id} not found`);
    return candidate;
  }

  async update(id: number, dto: UpdateCandidateDto): Promise<Candidate> {
    const candidate = await this.findOne(id);
    Object.assign(candidate, dto);
    return this.candidatesRepository.save(candidate);
  }

  async remove(id: number): Promise<void> {
    const result = await this.candidatesRepository.delete(id);
    if (!result.affected) throw new NotFoundException(`Candidate ${id} not found`);
  }
}
```

- [ ] **Step 6: Corre el test y verifica que pasa.**
```
pnpm test src/candidates/candidates.service.spec.ts
```
Esperado: `Tests: 2 passed`.

- [ ] **Step 7: Escribe el controller (delgado).**
```ts
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
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { SearchCandidatesDto } from './dto/search-candidates.dto';

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  create(@Body() dto: CreateCandidateDto) {
    return this.candidatesService.create(dto);
  }

  @Get()
  findAll(@Query() query: SearchCandidatesDto) {
    return this.candidatesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.candidatesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCandidateDto) {
    return this.candidatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.candidatesService.remove(id);
  }
}
```

- [ ] **Step 8: Escribe el módulo y regístralo en `main.module.ts`.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Candidate } from './candidate.entity';
import { CandidatesService } from './candidates.service';
import { CandidatesController } from './candidates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Candidate])],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
```
En `src/main.module.ts` añade el import y la entrada en el array `imports` del `@Module`:
```ts
import { CandidatesModule } from './candidates/candidates.module';
```
```ts
    CandidatesModule,
```

- [ ] **Step 9: Commit.**
```
git add src/candidates src/main.module.ts && git commit -m "feat(candidates): CRUD con busqueda paginada y detalle con applications"
```

### Task 8.2: Módulo applications (POST único + filtros + máquina de estados)

**Files:**
- Create: `src/applications/application.entity.ts`
- Create: `src/applications/dto/create-application.dto.ts`
- Create: `src/applications/dto/change-application-stage.dto.ts`
- Create: `src/applications/dto/filter-applications.dto.ts`
- Create: `src/applications/applications.service.ts`
- Create: `src/applications/applications.controller.ts`
- Create: `src/applications/applications.module.ts`
- Modify: `src/main.module.ts`
- Test: `src/applications/applications.service.spec.ts`

**Interfaces:**
- Consumes: `Candidate` (`src/candidates/candidate.entity.ts`); `Opportunity` (`src/opportunities/opportunity.entity.ts`); `Employee` (`src/employees/employee.entity.ts`).
- Produces: `Application` entity; `export const APPLICATION_STAGES`, `export type ApplicationStage`; `ApplicationsService.create/findAll/findOne/changeStage`; `ApplicationsModule`. Transiciones válidas: `applied→screening→interview→offer→hired`; desde `applied|screening|interview|offer` → `rejected`/`withdrawn`; cualquier otra → `BadRequestException`.

- [ ] **Step 1: Escribe la entity `Application` con UNIQUE(candidateId, opportunityId).**
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';

export const APPLICATION_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

@Entity('applications')
@Unique(['candidateId', 'opportunityId'])
export class Application {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  candidateId: number;

  @ManyToOne(() => Candidate, (candidate) => candidate.applications)
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column()
  opportunityId: number;

  @ManyToOne(() => Opportunity)
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @Column({ nullable: true })
  referredByEmployeeId?: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'referred_by_employee_id' })
  referredBy?: Employee;

  @Column({
    type: 'enum',
    enum: [...APPLICATION_STAGES],
    enumName: 'application_stage',
    default: 'applied',
  })
  stage: ApplicationStage;

  @Column({ nullable: true })
  source?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  appliedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Escribe los DTOs create / change-stage / filter.**
```ts
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';

export class CreateApplicationDto {
  @Type(() => Number)
  @IsInt()
  candidateId: number;

  @Type(() => Number)
  @IsInt()
  opportunityId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  referredByEmployeeId?: number;

  @IsOptional()
  @IsIn([...APPLICATION_STAGES])
  stage?: ApplicationStage;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```
```ts
import { IsIn } from 'class-validator';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';

export class ChangeApplicationStageDto {
  @IsIn([...APPLICATION_STAGES])
  stage: ApplicationStage;
}
```
```ts
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';

export class FilterApplicationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidateId?: number;

  @IsOptional()
  @IsIn([...APPLICATION_STAGES])
  stage?: ApplicationStage;
}
```

- [ ] **Step 3: Escribe el test TDD COMPLETO de la máquina de estados + unicidad (falla).**
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ApplicationsService } from './applications.service';
import { Application } from './application.entity';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let repository: jest.Mocked<Repository<Application>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: getRepositoryToken(Application),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve(entity)),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ApplicationsService);
    repository = module.get(getRepositoryToken(Application));
  });

  it('create throws ConflictException when candidate already applied to opportunity', async () => {
    repository.findOne.mockResolvedValue({ id: 1 } as Application);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2 } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('create persists application when pair is unique', async () => {
    repository.findOne.mockResolvedValue(null);
    const result = await service.create({ candidateId: 1, opportunityId: 2 } as any);
    expect(result).toEqual({ candidateId: 1, opportunityId: 2 });
  });

  it.each([
    ['applied', 'screening'],
    ['screening', 'interview'],
    ['interview', 'offer'],
    ['offer', 'hired'],
    ['applied', 'rejected'],
    ['screening', 'withdrawn'],
    ['interview', 'rejected'],
    ['offer', 'withdrawn'],
  ])('changeStage allows %s -> %s', async (from, to) => {
    repository.findOne.mockResolvedValue({ id: 1, stage: from } as Application);
    const result = await service.changeStage(1, { stage: to } as any);
    expect(result.stage).toBe(to);
  });

  it.each([
    ['applied', 'interview'],
    ['applied', 'hired'],
    ['screening', 'offer'],
    ['interview', 'hired'],
    ['hired', 'offer'],
    ['rejected', 'screening'],
    ['withdrawn', 'applied'],
    ['offer', 'applied'],
  ])('changeStage rejects %s -> %s', async (from, to) => {
    repository.findOne.mockResolvedValue({ id: 1, stage: from } as Application);
    await expect(
      service.changeStage(1, { stage: to } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('changeStage throws NotFoundException when application is missing', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(
      service.changeStage(1, { stage: 'screening' } as any),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 4: Corre el test y verifica que falla.**
```
pnpm test src/applications/applications.service.spec.ts
```
Esperado: falla porque `./applications.service` aún no existe.

- [ ] **Step 5: Implementa `ApplicationsService` con el mapa de transiciones.**
```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application, ApplicationStage } from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ChangeApplicationStageDto } from './dto/change-application-stage.dto';
import { FilterApplicationsDto } from './dto/filter-applications.dto';

const APPLICATION_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  applied: ['screening', 'rejected', 'withdrawn'],
  screening: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['hired', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationsRepository: Repository<Application>,
  ) {}

  async create(dto: CreateApplicationDto): Promise<Application> {
    const existing = await this.applicationsRepository.findOne({
      where: { candidateId: dto.candidateId, opportunityId: dto.opportunityId },
    });
    if (existing) {
      throw new ConflictException(
        `Application for candidate ${dto.candidateId} and opportunity ${dto.opportunityId} already exists`,
      );
    }
    const application = this.applicationsRepository.create(dto);
    return this.applicationsRepository.save(application);
  }

  async findAll(query: FilterApplicationsDto): Promise<Application[]> {
    const { opportunityId, candidateId, stage } = query;
    const qb = this.applicationsRepository
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('application.opportunity', 'opportunity');
    if (opportunityId)
      qb.andWhere('application.opportunityId = :opportunityId', { opportunityId });
    if (candidateId)
      qb.andWhere('application.candidateId = :candidateId', { candidateId });
    if (stage) qb.andWhere('application.stage = :stage', { stage });
    qb.orderBy('application.appliedAt', 'DESC');
    return qb.getMany();
  }

  async findOne(id: number): Promise<Application> {
    const application = await this.applicationsRepository.findOne({
      where: { id },
      relations: { candidate: true, opportunity: true },
    });
    if (!application) throw new NotFoundException(`Application ${id} not found`);
    return application;
  }

  async changeStage(
    id: number,
    dto: ChangeApplicationStageDto,
  ): Promise<Application> {
    const application = await this.findOne(id);
    const allowed = APPLICATION_TRANSITIONS[application.stage];
    if (!allowed.includes(dto.stage)) {
      throw new BadRequestException(
        `Cannot transition application from ${application.stage} to ${dto.stage}`,
      );
    }
    application.stage = dto.stage;
    return this.applicationsRepository.save(application);
  }
}
```

- [ ] **Step 6: Corre el test y verifica que pasa.**
```
pnpm test src/applications/applications.service.spec.ts
```
Esperado: todos los casos `it.each` + unicidad + NotFound en verde (`Tests: 19 passed`).

- [ ] **Step 7: Escribe el controller (delgado).**
```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ChangeApplicationStageDto } from './dto/change-application-stage.dto';
import { FilterApplicationsDto } from './dto/filter-applications.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(dto);
  }

  @Get()
  findAll(@Query() query: FilterApplicationsDto) {
    return this.applicationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.findOne(id);
  }

  @Patch(':id/stage')
  changeStage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeApplicationStageDto,
  ) {
    return this.applicationsService.changeStage(id, dto);
  }
}
```

- [ ] **Step 8: Escribe el módulo y regístralo en `main.module.ts`.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from './application.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Application])],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
```
En `src/main.module.ts` añade el import y la entrada en el array `imports`:
```ts
import { ApplicationsModule } from './applications/applications.module';
```
```ts
    ApplicationsModule,
```

- [ ] **Step 9: Commit.**
```
git add src/applications src/main.module.ts && git commit -m "feat(applications): postulacion unica, filtros y maquina de estados de etapa"
```

### Task 8.3: Módulo placements (cierre desde application + placement→won)

**Files:**
- Create: `src/placements/placement.entity.ts`
- Create: `src/placements/dto/create-placement.dto.ts`
- Create: `src/placements/dto/update-placement.dto.ts`
- Create: `src/placements/dto/search-placements.dto.ts`
- Create: `src/placements/placements.service.ts`
- Create: `src/placements/placements.controller.ts`
- Create: `src/placements/placements.module.ts`
- Modify: `src/main.module.ts`
- Test: `src/placements/placements.service.spec.ts`

**Interfaces:**
- Consumes: `Application` + `export type ApplicationStage` (`src/applications/application.entity.ts`); `Candidate` (`src/candidates/candidate.entity.ts`); `Opportunity` con `headcount: number`, `status: 'open'|'won'|'lost'`, `wonAt?: Date` (`src/opportunities/opportunity.entity.ts`); `Employee` (`src/employees/employee.entity.ts`); `ColumnNumericTransformer` (`src/config/numeric.transformer.ts`); `AuthUser { userId: number; employeeId: number; roles: string[]; sessionId: string }` + `CurrentUser()` (`src/config/current-user.decorator.ts`); `PaginationDto` (`src/config/pagination.dto.ts`).
- Produces: `Placement` entity; `export const PLACEMENT_STATUSES`, `export type PlacementStatus`; `PlacementsService.create/findAll/findOne/update`; `PlacementsModule`. Regla: `create` sella `placedByEmployeeId = user.employeeId`, fija `application.stage='hired'`, copia `candidateId`/`opportunityId`, y si placements ACTIVOS de la oportunidad `>= headcount` ⇒ `status='won'` + `wonAt=now`.

- [ ] **Step 1: Escribe la entity `Placement`.**
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { Application } from '../applications/application.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';

export const PLACEMENT_STATUSES = ['active', 'ended', 'cancelled'] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

@Entity('placements')
export class Placement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  applicationId: number;

  @ManyToOne(() => Application)
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Column()
  candidateId: number;

  @ManyToOne(() => Candidate)
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column()
  opportunityId: number;

  @ManyToOne(() => Opportunity)
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @Column()
  placedByEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'placed_by_employee_id' })
  placedBy: Employee;

  @Column({ type: 'date' })
  placementDate: string;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({ type: 'text', nullable: true })
  endReason?: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  agreedSalary?: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  fee?: number;

  @Column({
    type: 'enum',
    enum: [...PLACEMENT_STATUSES],
    enumName: 'placement_status',
    default: 'active',
  })
  status: PlacementStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Escribe los DTOs create / update / search.**
```ts
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLACEMENT_STATUSES, PlacementStatus } from '../placement.entity';

export class CreatePlacementDto {
  @Type(() => Number)
  @IsInt()
  applicationId: number;

  @IsDateString()
  placementDate: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  endReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  agreedSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsIn([...PLACEMENT_STATUSES])
  status?: PlacementStatus;
}
```
```ts
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePlacementDto } from './create-placement.dto';

export class UpdatePlacementDto extends PartialType(
  OmitType(CreatePlacementDto, ['applicationId'] as const),
) {}
```
```ts
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../config/pagination.dto';
import { PLACEMENT_STATUSES, PlacementStatus } from '../placement.entity';

export class SearchPlacementsDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recruiterId?: number;

  @IsOptional()
  @IsIn([...PLACEMENT_STATUSES])
  status?: PlacementStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
```

- [ ] **Step 3: Escribe el test TDD COMPLETO del cierre placement→won (falla).**
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PlacementsService } from './placements.service';
import { Placement } from './placement.entity';
import { Application } from '../applications/application.entity';
import { Opportunity } from '../opportunities/opportunity.entity';

describe('PlacementsService', () => {
  let service: PlacementsService;
  let placements: jest.Mocked<Repository<Placement>>;
  let applications: jest.Mocked<Repository<Application>>;
  let opportunities: jest.Mocked<Repository<Opportunity>>;

  const user = { userId: 1, employeeId: 7, roles: ['recruiter'], sessionId: 's' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacementsService,
        {
          provide: getRepositoryToken(Placement),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve({ id: 10, ...entity })),
            count: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Application),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
        {
          provide: getRepositoryToken(Opportunity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
      ],
    }).compile();

    service = module.get(PlacementsService);
    placements = module.get(getRepositoryToken(Placement));
    applications = module.get(getRepositoryToken(Application));
    opportunities = module.get(getRepositoryToken(Opportunity));
  });

  it('throws NotFoundException when application does not exist', async () => {
    applications.findOne.mockResolvedValue(null);
    await expect(
      service.create({ applicationId: 1, placementDate: '2026-06-26' } as any, user as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('sets application stage to hired and seals placedByEmployeeId from current user', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'offer',
    } as Application);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 2, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'hired' }),
    );
    expect(placements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 3,
        opportunityId: 4,
        placedByEmployeeId: 7,
      }),
    );
  });

  it('closes opportunity as won when active placements reach headcount', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'offer',
    } as Application);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 1, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    expect(opportunities.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'won', wonAt: expect.any(Date) }),
    );
  });

  it('keeps opportunity open when active placements are below headcount', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'offer',
    } as Application);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 3, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    expect(opportunities.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Corre el test y verifica que falla.**
```
pnpm test src/placements/placements.service.spec.ts
```
Esperado: falla porque `./placements.service` aún no existe.

- [ ] **Step 5: Implementa `PlacementsService`.**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Placement } from './placement.entity';
import { Application } from '../applications/application.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { SearchPlacementsDto } from './dto/search-placements.dto';
import { AuthUser } from '../config/current-user.decorator';

@Injectable()
export class PlacementsService {
  constructor(
    @InjectRepository(Placement)
    private readonly placementsRepository: Repository<Placement>,
    @InjectRepository(Application)
    private readonly applicationsRepository: Repository<Application>,
    @InjectRepository(Opportunity)
    private readonly opportunitiesRepository: Repository<Opportunity>,
  ) {}

  async create(dto: CreatePlacementDto, user: AuthUser): Promise<Placement> {
    const application = await this.applicationsRepository.findOne({
      where: { id: dto.applicationId },
    });
    if (!application) {
      throw new NotFoundException(`Application ${dto.applicationId} not found`);
    }

    application.stage = 'hired';
    await this.applicationsRepository.save(application);

    const placement = this.placementsRepository.create({
      applicationId: application.id,
      candidateId: application.candidateId,
      opportunityId: application.opportunityId,
      placedByEmployeeId: user.employeeId,
      placementDate: dto.placementDate,
      startDate: dto.startDate,
      endDate: dto.endDate,
      endReason: dto.endReason,
      agreedSalary: dto.agreedSalary,
      fee: dto.fee,
      status: dto.status,
    });
    const saved = await this.placementsRepository.save(placement);

    const opportunity = await this.opportunitiesRepository.findOne({
      where: { id: application.opportunityId },
    });
    if (opportunity) {
      const activeCount = await this.placementsRepository.count({
        where: { opportunityId: opportunity.id, status: 'active' },
      });
      if (activeCount >= opportunity.headcount) {
        opportunity.status = 'won';
        opportunity.wonAt = new Date();
        await this.opportunitiesRepository.save(opportunity);
      }
    }

    return saved;
  }

  async findAll(query: SearchPlacementsDto): Promise<{
    items: Placement[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, clientId, recruiterId, status, from, to } = query;
    const qb = this.placementsRepository
      .createQueryBuilder('placement')
      .leftJoinAndSelect('placement.opportunity', 'opportunity')
      .leftJoinAndSelect('placement.candidate', 'candidate');
    if (clientId) qb.andWhere('opportunity.clientId = :clientId', { clientId });
    if (recruiterId)
      qb.andWhere('placement.placedByEmployeeId = :recruiterId', { recruiterId });
    if (status) qb.andWhere('placement.status = :status', { status });
    if (from) qb.andWhere('placement.placementDate >= :from', { from });
    if (to) qb.andWhere('placement.placementDate <= :to', { to });
    qb.orderBy('placement.placementDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Placement> {
    const placement = await this.placementsRepository.findOne({
      where: { id },
      relations: { application: true, candidate: true, opportunity: true },
    });
    if (!placement) throw new NotFoundException(`Placement ${id} not found`);
    return placement;
  }

  async update(id: number, dto: UpdatePlacementDto): Promise<Placement> {
    const placement = await this.findOne(id);
    Object.assign(placement, dto);
    return this.placementsRepository.save(placement);
  }
}
```

- [ ] **Step 6: Corre el test y verifica que pasa.**
```
pnpm test src/placements/placements.service.spec.ts
```
Esperado: `Tests: 4 passed` (NotFound, sellado de employee + stage hired, cierre won al alcanzar headcount, se mantiene open por debajo).

- [ ] **Step 7: Escribe el controller (delgado, sella el employee con `@CurrentUser`).**
```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PlacementsService } from './placements.service';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { SearchPlacementsDto } from './dto/search-placements.dto';
import { CurrentUser, AuthUser } from '../config/current-user.decorator';

@Controller('placements')
export class PlacementsController {
  constructor(private readonly placementsService: PlacementsService) {}

  @Post()
  create(@Body() dto: CreatePlacementDto, @CurrentUser() user: AuthUser) {
    return this.placementsService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: SearchPlacementsDto) {
    return this.placementsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.placementsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlacementDto,
  ) {
    return this.placementsService.update(id, dto);
  }
}
```

- [ ] **Step 8: Escribe el módulo y regístralo en `main.module.ts`.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Placement } from './placement.entity';
import { Application } from '../applications/application.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { PlacementsService } from './placements.service';
import { PlacementsController } from './placements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Placement, Application, Opportunity])],
  controllers: [PlacementsController],
  providers: [PlacementsService],
  exports: [PlacementsService],
})
export class PlacementsModule {}
```
En `src/main.module.ts` añade el import y la entrada en el array `imports`:
```ts
import { PlacementsModule } from './placements/placements.module';
```
```ts
    PlacementsModule,
```

- [ ] **Step 9: Commit.**
```
git add src/placements src/main.module.ts && git commit -m "feat(placements): cierre desde application y win automatico de la oportunidad por headcount"
```


## Fase 6 — Métricas & Dashboard

### Task 9.1: MetricsFilterDto, MetricsService scaffold y métrica `commercial` (TDD)

**Files:**
- Create: `src/metrics/dto/metrics-filter.dto.ts`
- Create: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Consumes: `Opportunity`, `ContactHistory`, `ContactRequest`, `Application`, `Placement`, `Client`, `Candidate` entities (repositorios via `getRepositoryToken`).
- Produces:
  - `MetricsFilterDto = { from?: string; to?: string; sectorId?: number; areaId?: number; clientId?: number; responsibleEmployeeId?: number; stageId?: number; status?: string }`
  - `MetricsService.commercial(filter: MetricsFilterDto): Promise<{ totalOpportunities: number; totalWon: number; conversionWonTotal: number; conversionWonProposals: number; proposalsSent: number; proposalsAmount: number; wonValue: number; weightedValue: number }>`
  - Helpers privados `applyOpportunityScope(qb, filter, oAlias?, cAlias?)` y `applyDateRange(qb, filter, column)`.

- [ ] **Step 1: Crea el DTO de filtros comunes.**
```ts
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class MetricsFilterDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sectorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  areaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsibleEmployeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stageId?: number;

  @IsOptional()
  @IsIn(['open', 'won', 'lost'])
  status?: string;
}
```

- [ ] **Step 2: Escribe el test que falla (`commercial`) con datos controlados y el helper de QueryBuilder mockeado.**
```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';
import { Client } from '../clients/client.entity';
import { Candidate } from '../candidates/candidate.entity';

function createQbMock() {
  const qb: any = {};
  const chain = [
    'leftJoin',
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'addOrderBy',
  ];
  for (const m of chain) qb[m] = jest.fn().mockReturnValue(qb);
  qb.getRawOne = jest.fn();
  qb.getRawMany = jest.fn();
  qb.getCount = jest.fn();
  return qb;
}

describe('MetricsService', () => {
  let service: MetricsService;
  let opportunityRepo: any;
  let contactHistoryRepo: any;
  let contactRequestRepo: any;
  let applicationRepo: any;
  let placementRepo: any;
  let clientRepo: any;
  let candidateRepo: any;

  beforeEach(async () => {
    const repo = () => ({ createQueryBuilder: jest.fn(), count: jest.fn() });
    const module = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: getRepositoryToken(Opportunity), useValue: repo() },
        { provide: getRepositoryToken(ContactHistory), useValue: repo() },
        { provide: getRepositoryToken(ContactRequest), useValue: repo() },
        { provide: getRepositoryToken(Application), useValue: repo() },
        { provide: getRepositoryToken(Placement), useValue: repo() },
        { provide: getRepositoryToken(Client), useValue: repo() },
        { provide: getRepositoryToken(Candidate), useValue: repo() },
      ],
    }).compile();

    service = module.get(MetricsService);
    opportunityRepo = module.get(getRepositoryToken(Opportunity));
    contactHistoryRepo = module.get(getRepositoryToken(ContactHistory));
    contactRequestRepo = module.get(getRepositoryToken(ContactRequest));
    applicationRepo = module.get(getRepositoryToken(Application));
    placementRepo = module.get(getRepositoryToken(Placement));
    clientRepo = module.get(getRepositoryToken(Client));
    candidateRepo = module.get(getRepositoryToken(Candidate));
  });

  describe('commercial', () => {
    it('parses aggregates and computes conversion ratios', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        totalOpportunities: '10',
        totalWon: '3',
        proposalsSent: '4',
        proposalsAmount: '40000.00',
        wonValue: '30000.00',
        weightedValue: '12000.00',
      });
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.commercial({});

      expect(res.totalOpportunities).toBe(10);
      expect(res.totalWon).toBe(3);
      expect(res.proposalsSent).toBe(4);
      expect(res.proposalsAmount).toBe(40000);
      expect(res.wonValue).toBe(30000);
      expect(res.weightedValue).toBe(12000);
      expect(res.conversionWonTotal).toBeCloseTo(0.3);
      expect(res.conversionWonProposals).toBeCloseTo(0.75);
    });

    it('guards against division by zero and null sums', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        totalOpportunities: '0',
        totalWon: '0',
        proposalsSent: '0',
        proposalsAmount: null,
        wonValue: null,
        weightedValue: null,
      });
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.commercial({});

      expect(res.conversionWonTotal).toBe(0);
      expect(res.conversionWonProposals).toBe(0);
      expect(res.wonValue).toBe(0);
      expect(res.weightedValue).toBe(0);
    });
  });
});
```

- [ ] **Step 3: Corre el test y confirma que falla (rojo).**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts`
  - Esperado: falla en compilación/ejecución porque `src/metrics/metrics.service.ts` aún no existe (`Cannot find module './metrics.service'`).

- [ ] **Step 4: Implementa `MetricsService` con constructor, helpers y `commercial`.**
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';
import { Client } from '../clients/client.entity';
import { Candidate } from '../candidates/candidate.entity';
import { MetricsFilterDto } from './dto/metrics-filter.dto';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
    @InjectRepository(ContactHistory)
    private readonly contactHistoryRepo: Repository<ContactHistory>,
    @InjectRepository(ContactRequest)
    private readonly contactRequestRepo: Repository<ContactRequest>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @InjectRepository(Placement)
    private readonly placementRepo: Repository<Placement>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Candidate)
    private readonly candidateRepo: Repository<Candidate>,
  ) {}

  private applyOpportunityScope(
    qb: SelectQueryBuilder<any>,
    filter: MetricsFilterDto,
    oAlias = 'o',
    cAlias = 'c',
  ): SelectQueryBuilder<any> {
    if (filter.clientId) {
      qb.andWhere(`${oAlias}.clientId = :clientId`, { clientId: filter.clientId });
    }
    if (filter.areaId) {
      qb.andWhere(`${oAlias}.areaId = :areaId`, { areaId: filter.areaId });
    }
    if (filter.responsibleEmployeeId) {
      qb.andWhere(`${oAlias}.responsibleEmployeeId = :responsibleEmployeeId`, {
        responsibleEmployeeId: filter.responsibleEmployeeId,
      });
    }
    if (filter.stageId) {
      qb.andWhere(`${oAlias}.pipelineStageId = :stageId`, { stageId: filter.stageId });
    }
    if (filter.status) {
      qb.andWhere(`${oAlias}.status = :status`, { status: filter.status });
    }
    if (filter.sectorId) {
      qb.andWhere(`${cAlias}.sectorId = :sectorId`, { sectorId: filter.sectorId });
    }
    return qb;
  }

  private applyDateRange(
    qb: SelectQueryBuilder<any>,
    filter: MetricsFilterDto,
    column: string,
  ): SelectQueryBuilder<any> {
    if (filter.from) {
      qb.andWhere(`${column} >= :from`, { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere(`${column} <= :to`, { to: filter.to });
    }
    return qb;
  }

  async commercial(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .select('COUNT(o.id)', 'totalOpportunities')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END)`, 'totalWon')
      .addSelect(
        `SUM(CASE WHEN o.proposalSentAt IS NOT NULL THEN 1 ELSE 0 END)`,
        'proposalsSent',
      )
      .addSelect(
        `SUM(CASE WHEN o.proposalSentAt IS NOT NULL THEN o.amount ELSE 0 END)`,
        'proposalsAmount',
      )
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN o.amount ELSE 0 END)`, 'wonValue')
      .addSelect(
        `SUM(CASE WHEN o.status = 'open' THEN o.amount * o.probability / 100 ELSE 0 END)`,
        'weightedValue',
      );
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const raw = await qb.getRawOne();
    const totalOpportunities = Number(raw.totalOpportunities) || 0;
    const totalWon = Number(raw.totalWon) || 0;
    const proposalsSent = Number(raw.proposalsSent) || 0;
    const proposalsAmount = Number(raw.proposalsAmount) || 0;
    const wonValue = Number(raw.wonValue) || 0;
    const weightedValue = Number(raw.weightedValue) || 0;
    return {
      totalOpportunities,
      totalWon,
      conversionWonTotal: totalOpportunities > 0 ? totalWon / totalOpportunities : 0,
      conversionWonProposals: proposalsSent > 0 ? totalWon / proposalsSent : 0,
      proposalsSent,
      proposalsAmount,
      wonValue,
      weightedValue,
    };
  }
}
```

- [ ] **Step 5: Corre el test y confirma que pasa (verde).**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts`
  - Esperado: `2 passed` en el describe `commercial`.

- [ ] **Step 6: Commit.**
  - Comando: `git add src/metrics/dto/metrics-filter.dto.ts src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add metrics filter dto and commercial aggregation"`

### Task 9.2: Métrica `overview` (snapshot KPIs)

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces: `MetricsService.overview(): Promise<{ clients: number; openOpportunities: number; pipelineValue: number; activeCandidates: number; placementsThisMonth: number; pendingRequests: number }>`

- [ ] **Step 1: Añade el describe `overview` que falla (anclando antes del cierre del describe raíz).**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('overview', () => {
    it('aggregates snapshot counts and pipeline value', async () => {
      clientRepo.count.mockResolvedValue(7);
      opportunityRepo.count.mockResolvedValue(5);
      candidateRepo.count.mockResolvedValue(9);
      contactRequestRepo.count.mockResolvedValue(2);

      const placementsQb = createQbMock();
      placementsQb.getCount.mockResolvedValue(3);
      placementRepo.createQueryBuilder.mockReturnValue(placementsQb);

      const pipelineQb = createQbMock();
      pipelineQb.getRawOne.mockResolvedValue({ pipelineValue: '85000.00' });
      opportunityRepo.createQueryBuilder.mockReturnValue(pipelineQb);

      const res = await service.overview();

      expect(res.clients).toBe(7);
      expect(res.openOpportunities).toBe(5);
      expect(res.pipelineValue).toBe(85000);
      expect(res.activeCandidates).toBe(9);
      expect(res.placementsThisMonth).toBe(3);
      expect(res.pendingRequests).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t overview`
  - Esperado: falla porque `service.overview` no existe (`TypeError: service.overview is not a function`).

- [ ] **Step 3: Implementa `overview` (insertar antes del cierre de la clase).**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  async overview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [clients, openOpportunities, activeCandidates, pendingRequests] =
      await Promise.all([
        this.clientRepo.count(),
        this.opportunityRepo.count({ where: { status: 'open' } as any }),
        this.candidateRepo.count({ where: { status: 'active' } as any }),
        this.contactRequestRepo.count({ where: { wasHandled: false } }),
      ]);
    const placementsThisMonth = await this.placementRepo
      .createQueryBuilder('p')
      .where('p.placementDate >= :monthStart', { monthStart })
      .andWhere('p.placementDate < :monthEnd', { monthEnd })
      .getCount();
    const pipelineRaw = await this.opportunityRepo
      .createQueryBuilder('o')
      .select('SUM(o.amount)', 'pipelineValue')
      .where(`o.status = 'open'`)
      .getRawOne();
    return {
      clients,
      openOpportunities,
      pipelineValue: Number(pipelineRaw.pipelineValue) || 0,
      activeCandidates,
      placementsThisMonth,
      pendingRequests,
    };
  }
}
```

- [ ] **Step 4: Corre y confirma verde.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t overview`
  - Esperado: `1 passed`.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add overview snapshot kpis"`

### Task 9.3: Métrica `pipeline` (conteo y Σ amount por etapa)

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces: `MetricsService.pipeline(filter: MetricsFilterDto): Promise<Array<{ stageId: number; stageName: string; sortOrder: number; count: number; amount: number }>>`

- [ ] **Step 1: Añade el describe `pipeline` que falla (anclando antes del cierre del describe raíz).**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('pipeline', () => {
    it('maps stage rows parsing count and amount', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { stageId: '1', stageName: 'Contacto inicial', sortOrder: '1', count: '4', amount: '12000.00' },
        { stageId: '5', stageName: 'Propuesta enviada', sortOrder: '5', count: '2', amount: null },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.pipeline({});

      expect(res).toEqual([
        { stageId: 1, stageName: 'Contacto inicial', sortOrder: 1, count: 4, amount: 12000 },
        { stageId: 5, stageName: 'Propuesta enviada', sortOrder: 5, count: 2, amount: 0 },
      ]);
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t pipeline`
  - Esperado: falla porque `service.pipeline` no existe.

- [ ] **Step 3: Implementa `pipeline` (insertar antes del cierre de la clase).**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  async pipeline(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .innerJoin('o.pipelineStage', 's')
      .select('s.id', 'stageId')
      .addSelect('s.name', 'stageName')
      .addSelect('s.sortOrder', 'sortOrder')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('SUM(o.amount)', 'amount')
      .groupBy('s.id')
      .addGroupBy('s.name')
      .addGroupBy('s.sortOrder')
      .orderBy('s.sortOrder', 'ASC');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      stageId: Number(r.stageId),
      stageName: r.stageName,
      sortOrder: Number(r.sortOrder),
      count: Number(r.count) || 0,
      amount: Number(r.amount) || 0,
    }));
  }
}
```

- [ ] **Step 4: Corre y confirma verde.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t pipeline`
  - Esperado: `1 passed`.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add pipeline aggregation by stage"`

### Task 9.4: Métrica `contacts` (conteo, Σ y avg callLength por empleado/tipo/dirección)

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces: `MetricsService.contacts(filter: MetricsFilterDto): Promise<Array<{ employeeId: number; contactTypeId: number | null; contactTypeName: string; direction: string; count: number; totalCallLength: number; avgCallLength: number }>>`

- [ ] **Step 1: Añade el describe `contacts` que falla.**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('contacts', () => {
    it('aggregates call metrics by employee, type and direction', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        {
          employeeId: '2',
          contactTypeId: '1',
          contactTypeName: 'call',
          direction: 'outbound',
          count: '3',
          totalCallLength: '450',
          avgCallLength: '150.0000',
        },
        {
          employeeId: '2',
          contactTypeId: '2',
          contactTypeName: 'email',
          direction: 'inbound',
          count: '1',
          totalCallLength: null,
          avgCallLength: null,
        },
      ]);
      contactHistoryRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.contacts({ clientId: 9 });

      expect(qb.andWhere).toHaveBeenCalledWith('cc.clientId = :clientId', { clientId: 9 });
      expect(res[0]).toEqual({
        employeeId: 2,
        contactTypeId: 1,
        contactTypeName: 'call',
        direction: 'outbound',
        count: 3,
        totalCallLength: 450,
        avgCallLength: 150,
      });
      expect(res[1].totalCallLength).toBe(0);
      expect(res[1].avgCallLength).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t contacts`
  - Esperado: falla porque `service.contacts` no existe.

- [ ] **Step 3: Implementa `contacts`.**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  async contacts(filter: MetricsFilterDto) {
    const qb = this.contactHistoryRepo
      .createQueryBuilder('ch')
      .leftJoin('ch.contactType', 'ct')
      .leftJoin('ch.contact', 'cc')
      .select('ch.employeeId', 'employeeId')
      .addSelect('ct.id', 'contactTypeId')
      .addSelect('ct.name', 'contactTypeName')
      .addSelect('ch.direction', 'direction')
      .addSelect('COUNT(ch.id)', 'count')
      .addSelect('SUM(ch.callLength)', 'totalCallLength')
      .addSelect('AVG(ch.callLength)', 'avgCallLength')
      .groupBy('ch.employeeId')
      .addGroupBy('ct.id')
      .addGroupBy('ct.name')
      .addGroupBy('ch.direction');
    if (filter.clientId) {
      qb.andWhere('cc.clientId = :clientId', { clientId: filter.clientId });
    }
    this.applyDateRange(qb, filter, 'ch.contactTime');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      employeeId: Number(r.employeeId),
      contactTypeId: r.contactTypeId === null ? null : Number(r.contactTypeId),
      contactTypeName: r.contactTypeName,
      direction: r.direction,
      count: Number(r.count) || 0,
      totalCallLength: Number(r.totalCallLength) || 0,
      avgCallLength: r.avgCallLength === null ? 0 : Number(r.avgCallLength),
    }));
  }
}
```

- [ ] **Step 4: Corre y confirma verde.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t contacts`
  - Esperado: `1 passed`.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add contact activity aggregation"`

### Task 9.5: Métrica `requests` (atención, tiempo medio, conversión)

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces: `MetricsService.requests(filter: MetricsFilterDto): Promise<{ total: number; handled: number; handleRate: number; converted: number; conversionRate: number; avgResponseSeconds: number }>`

- [ ] **Step 1: Añade el describe `requests` que falla.**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('requests', () => {
    it('computes handle rate, conversion rate and avg response', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        total: '8',
        handled: '6',
        converted: '2',
        avgResponseSeconds: '3600',
      });
      contactRequestRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.requests({});

      expect(res.total).toBe(8);
      expect(res.handled).toBe(6);
      expect(res.handleRate).toBeCloseTo(0.75);
      expect(res.converted).toBe(2);
      expect(res.conversionRate).toBeCloseTo(0.25);
      expect(res.avgResponseSeconds).toBe(3600);
    });

    it('returns zeros when there are no requests', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        total: '0',
        handled: '0',
        converted: '0',
        avgResponseSeconds: null,
      });
      contactRequestRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.requests({});

      expect(res.handleRate).toBe(0);
      expect(res.conversionRate).toBe(0);
      expect(res.avgResponseSeconds).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t requests`
  - Esperado: falla porque `service.requests` no existe.

- [ ] **Step 3: Implementa `requests`.**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  async requests(filter: MetricsFilterDto) {
    const qb = this.contactRequestRepo
      .createQueryBuilder('cr')
      .select('COUNT(cr.id)', 'total')
      .addSelect(`SUM(CASE WHEN cr.wasHandled = true THEN 1 ELSE 0 END)`, 'handled')
      .addSelect(
        `SUM(CASE WHEN cr.resultingClientId IS NOT NULL THEN 1 ELSE 0 END)`,
        'converted',
      )
      .addSelect(
        `AVG(CASE WHEN cr.handledAt IS NOT NULL THEN EXTRACT(EPOCH FROM (cr.handledAt - cr.createdAt)) END)`,
        'avgResponseSeconds',
      );
    this.applyDateRange(qb, filter, 'cr.createdAt');
    const raw = await qb.getRawOne();
    const total = Number(raw.total) || 0;
    const handled = Number(raw.handled) || 0;
    const converted = Number(raw.converted) || 0;
    return {
      total,
      handled,
      handleRate: total > 0 ? handled / total : 0,
      converted,
      conversionRate: total > 0 ? converted / total : 0,
      avgResponseSeconds:
        raw.avgResponseSeconds === null ? 0 : Number(raw.avgResponseSeconds),
    };
  }
}
```

- [ ] **Step 4: Corre y confirma verde.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t requests`
  - Esperado: `2 passed`.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add contact-requests handling metrics"`

### Task 9.6: Métrica `recruitment/funnel` (applications por stage)

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces: `MetricsService.recruitmentFunnel(filter: MetricsFilterDto): Promise<Array<{ stage: string; count: number }>>`

- [ ] **Step 1: Añade el describe `recruitmentFunnel` que falla.**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('recruitmentFunnel', () => {
    it('counts applications by stage applying opportunity scope', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { stage: 'applied', count: '12' },
        { stage: 'interview', count: '4' },
        { stage: 'hired', count: '2' },
      ]);
      applicationRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.recruitmentFunnel({ clientId: 3 });

      expect(qb.andWhere).toHaveBeenCalledWith('o.clientId = :clientId', { clientId: 3 });
      expect(res).toEqual([
        { stage: 'applied', count: 12 },
        { stage: 'interview', count: 4 },
        { stage: 'hired', count: 2 },
      ]);
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t recruitmentFunnel`
  - Esperado: falla porque `service.recruitmentFunnel` no existe.

- [ ] **Step 3: Implementa `recruitmentFunnel`.**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  async recruitmentFunnel(filter: MetricsFilterDto) {
    const qb = this.applicationRepo
      .createQueryBuilder('a')
      .leftJoin('a.opportunity', 'o')
      .leftJoin('o.client', 'c')
      .select('a.stage', 'stage')
      .addSelect('COUNT(a.id)', 'count')
      .groupBy('a.stage');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'a.appliedAt');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      stage: r.stage,
      count: Number(r.count) || 0,
    }));
  }
}
```

- [ ] **Step 4: Corre y confirma verde.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t recruitmentFunnel`
  - Esperado: `1 passed`.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add recruitment funnel by stage"`

### Task 9.7: Métrica `placements` (nº, Σ fee, time-to-fill por reclutador/cliente)

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces: `MetricsService.placements(filter: MetricsFilterDto): Promise<Array<{ recruiterId: number; clientId: number; count: number; totalFee: number; avgTimeToFillSeconds: number }>>`

- [ ] **Step 1: Añade el describe `placements` que falla.**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('placements', () => {
    it('aggregates placements with fee and time-to-fill by recruiter/client', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { recruiterId: '4', clientId: '3', count: '2', totalFee: '5000.00', avgTimeToFillSeconds: '864000' },
        { recruiterId: '4', clientId: '7', count: '1', totalFee: null, avgTimeToFillSeconds: null },
      ]);
      placementRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.placements({});

      expect(res[0]).toEqual({
        recruiterId: 4,
        clientId: 3,
        count: 2,
        totalFee: 5000,
        avgTimeToFillSeconds: 864000,
      });
      expect(res[1].totalFee).toBe(0);
      expect(res[1].avgTimeToFillSeconds).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t placements`
  - Esperado: falla porque `service.placements` no existe.

- [ ] **Step 3: Implementa `placements`.**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  async placements(filter: MetricsFilterDto) {
    const qb = this.placementRepo
      .createQueryBuilder('p')
      .leftJoin('p.opportunity', 'o')
      .leftJoin('o.client', 'c')
      .select('p.placedByEmployeeId', 'recruiterId')
      .addSelect('o.clientId', 'clientId')
      .addSelect('COUNT(p.id)', 'count')
      .addSelect('SUM(p.fee)', 'totalFee')
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (CAST(p.placementDate AS timestamptz) - o.createdAt)))',
        'avgTimeToFillSeconds',
      )
      .groupBy('p.placedByEmployeeId')
      .addGroupBy('o.clientId');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'p.placementDate');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      recruiterId: Number(r.recruiterId),
      clientId: Number(r.clientId),
      count: Number(r.count) || 0,
      totalFee: Number(r.totalFee) || 0,
      avgTimeToFillSeconds:
        r.avgTimeToFillSeconds === null ? 0 : Number(r.avgTimeToFillSeconds),
    }));
  }
}
```

- [ ] **Step 4: Corre y confirma verde.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t placements`
  - Esperado: `1 passed`.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add placements metrics with time-to-fill"`

### Task 9.8: Gráficas `charts/by-client`, `by-sector`, `by-area`

**Files:**
- Modify: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

**Interfaces:**
- Produces:
  - `MetricsService.chartByClient(filter)`, `chartBySector(filter)`, `chartByArea(filter)` → `Promise<Array<{ [idKey]: number | null; [nameKey]: string; opportunities: number; won: number; amount: number }>>`
  - Helper privado `mapChartRows(rows, idKey, nameKey)`.

- [ ] **Step 1: Añade el describe `charts` que falla.**
  - Edit anchor old_string:
```ts
  });
});
```
  - new_string:
```ts
  });

  describe('charts', () => {
    it('chartByClient maps grouped totals', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { clientId: '3', clientName: 'Acme', opportunities: '6', won: '2', amount: '40000.00' },
        { clientId: '7', clientName: 'Globex', opportunities: '1', won: '0', amount: null },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.chartByClient({});

      expect(res[0]).toEqual({
        clientId: 3,
        clientName: 'Acme',
        opportunities: 6,
        won: 2,
        amount: 40000,
      });
      expect(res[1].amount).toBe(0);
    });

    it('chartBySector maps grouped totals with sector keys', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { sectorId: '1', sectorName: 'BPO', opportunities: '4', won: '1', amount: '15000.00' },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.chartBySector({ from: '2026-01-01' });

      expect(res[0]).toEqual({
        sectorId: 1,
        sectorName: 'BPO',
        opportunities: 4,
        won: 1,
        amount: 15000,
      });
    });

    it('chartByArea maps grouped totals with area keys', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { areaId: '2', areaName: 'IT', opportunities: '3', won: '3', amount: '90000.00' },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.chartByArea({});

      expect(res[0]).toEqual({
        areaId: 2,
        areaName: 'IT',
        opportunities: 3,
        won: 3,
        amount: 90000,
      });
    });
  });
});
```

- [ ] **Step 2: Corre y confirma rojo.**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts -t charts`
  - Esperado: falla porque `service.chartByClient` no existe.

- [ ] **Step 3: Implementa los tres métodos de gráficas y `mapChartRows`.**
  - Edit anchor old_string:
```ts
  }
}
```
  - new_string:
```ts
  }

  private mapChartRows(rows: any[], idKey: string, nameKey: string) {
    return rows.map((r) => ({
      [idKey]: r[idKey] === null ? null : Number(r[idKey]),
      [nameKey]: r[nameKey],
      opportunities: Number(r.opportunities) || 0,
      won: Number(r.won) || 0,
      amount: Number(r.amount) || 0,
    }));
  }

  async chartByClient(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .select('o.clientId', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('COUNT(o.id)', 'opportunities')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END)`, 'won')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN o.amount ELSE 0 END)`, 'amount')
      .groupBy('o.clientId')
      .addGroupBy('c.name');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const rows = await qb.getRawMany();
    return this.mapChartRows(rows, 'clientId', 'clientName');
  }

  async chartBySector(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .leftJoin('c.sectorCatalog', 's')
      .select('s.id', 'sectorId')
      .addSelect('s.name', 'sectorName')
      .addSelect('COUNT(o.id)', 'opportunities')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END)`, 'won')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN o.amount ELSE 0 END)`, 'amount')
      .groupBy('s.id')
      .addGroupBy('s.name');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const rows = await qb.getRawMany();
    return this.mapChartRows(rows, 'sectorId', 'sectorName');
  }

  async chartByArea(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .leftJoin('o.area', 'a')
      .select('a.id', 'areaId')
      .addSelect('a.name', 'areaName')
      .addSelect('COUNT(o.id)', 'opportunities')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END)`, 'won')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN o.amount ELSE 0 END)`, 'amount')
      .groupBy('a.id')
      .addGroupBy('a.name');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const rows = await qb.getRawMany();
    return this.mapChartRows(rows, 'areaId', 'areaName');
  }
}
```

- [ ] **Step 4: Corre y confirma verde (toda la suite del service).**
  - Comando: `pnpm test -- src/metrics/metrics.service.spec.ts`
  - Esperado: todos los describes (`commercial`, `overview`, `pipeline`, `contacts`, `requests`, `recruitmentFunnel`, `placements`, `charts`) en verde.

- [ ] **Step 5: Commit.**
  - Comando: `git add src/metrics/metrics.service.ts src/metrics/metrics.service.spec.ts && git commit -m "feat(metrics): add chart aggregations by client, sector and area"`

### Task 9.9: MetricsController, MetricsModule, registro y e2e de guard

**Files:**
- Create: `src/metrics/metrics.controller.ts`
- Create: `src/metrics/metrics.module.ts`
- Modify: `src/main.module.ts`
- Test: `test/metrics.e2e-spec.ts`

**Interfaces:**
- Consumes: `MetricsService`, `MetricsFilterDto`, `Roles` (`src/config/roles.decorator`), `JwtAuthGuard`/`RolesGuard` globales.
- Produces: 10 endpoints GET bajo `/api/metrics` protegidos con `@Roles('admin')`; `MetricsModule` con `TypeOrmModule.forFeature` de las 7 entities.

- [ ] **Step 1: Escribe el e2e que falla (acceso sin token a un endpoint admin).**
```ts
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { MainModule } from '../src/main.module';

describe('Metrics (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MainModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access to metrics', () => {
    return request(app.getHttpServer())
      .get('/api/metrics/commercial')
      .expect(401);
  });
});
```

- [ ] **Step 2: Corre el e2e y confirma rojo.**
  - Comando: `pnpm test:e2e -- metrics`
  - Esperado: falla porque el route `/api/metrics/commercial` no existe todavía (404 en lugar de 401, o error de bootstrap si `MetricsModule` aún no está registrado).

- [ ] **Step 3: Implementa el controller.**
```ts
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
```

- [ ] **Step 4: Implementa el module.**
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';
import { Client } from '../clients/client.entity';
import { Candidate } from '../candidates/candidate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Opportunity,
      ContactHistory,
      ContactRequest,
      Application,
      Placement,
      Client,
      Candidate,
    ]),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
```

- [ ] **Step 5: Registra `MetricsModule` en `main.module.ts` (import y array de imports).**
  - Edit 1 old_string:
```ts
import { AuthModule } from './auth/auth.module';
```
  - Edit 1 new_string:
```ts
import { AuthModule } from './auth/auth.module';
import { MetricsModule } from './metrics/metrics.module';
```
  - Edit 2 old_string:
```ts
    AuthModule,
  ],
```
  - Edit 2 new_string:
```ts
    AuthModule,
    MetricsModule,
  ],
```

- [ ] **Step 6: Corre el e2e y confirma verde.**
  - Comando: `pnpm test:e2e -- metrics`
  - Esperado: `1 passed` (responde 401 vía `JwtAuthGuard` global).

- [ ] **Step 7: Corre la suite unit completa de métricas para regresión.**
  - Comando: `pnpm test -- src/metrics`
  - Esperado: toda la suite del service en verde.

- [ ] **Step 8: Commit.**
  - Comando: `git add src/metrics/metrics.controller.ts src/metrics/metrics.module.ts src/main.module.ts test/metrics.e2e-spec.ts && git commit -m "feat(metrics): wire metrics controller, module and admin guard e2e"`
