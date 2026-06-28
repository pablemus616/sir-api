# Backend `candidate-contacts` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `candidate-contacts` module to the NestJS backend (`sir-api`) so recruiters can log how they contacted a candidate (call/message/email/WhatsApp) for a given opportunity, with the recruiter sealed from the JWT.

**Architecture:** Mirrors the existing `contact-history` module (entity + DTOs + service + controller + module), but the contact is between a **recruiter and a candidate** about an **opportunity** (both required). Reuses the `contact_types` catalog and the `ContactDirection` enum. Read endpoints are open to any authenticated user (team-wide visibility); the recruiter is sealed server-side from the Bearer token.

**Tech Stack:** NestJS 11, Fastify, TypeORM (QueryBuilder + repositories), class-validator/class-transformer, Jest.

## Global Constraints

- Type gate (must pass before every commit): `pnpm exec tsc --noEmit` (0 errors). `pnpm build`/ts-jest do NOT catch all type errors. Decorators on `@CurrentUser()`/`@Req()` params require `import type` for the type.
- TypeORM only (no raw SQL); follow existing module structure; no comments-in-code convention is not enforced but match neighboring files.
- Auth is global (`JwtAuthGuard`); do NOT put `@Roles('admin')` on this controller — it must be usable by non-admin recruiters. `recruiterEmployeeId` is ALWAYS sealed from `@CurrentUser().employeeId`; never accept it from the client body.
- The PG enum type for direction is shared: reuse `enumName: 'contact_direction'` (same as `contact_history.direction`) so no duplicate enum type is created.
- Schema is managed by `synchronize` in dev (`NODE_ENV !== 'production'`), `migrationsRun: false`, no migrations dir. The new table is materialized by running the app once with `NODE_ENV=development` (see Task 5).

---

### Task 1: Entity `CandidateContact`

**Files:**
- Create: `src/candidate-contacts/candidate-contact.entity.ts`

**Interfaces:**
- Consumes: `Candidate` (`../candidates/candidate.entity`), `Opportunity` (`../opportunities/opportunity.entity`), `Employee` (`../employees/employee.entity`), `ContactType` (`../contact-types/contact-type.entity`), `ContactDirection` (`../config/enums`).
- Produces: `CandidateContact` entity (table `candidate_contacts`) with scalar FKs `candidateId`, `opportunityId`, `recruiterEmployeeId` + relations `candidate`, `opportunity`, `contactType`, `recruiter`.

- [ ] **Step 1: Create the entity file**

```typescript
// src/candidate-contacts/candidate-contact.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { ContactDirection } from '../config/enums';

@Entity('candidate_contacts')
export class CandidateContact {
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

  @Column()
  recruiterEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'recruiter_employee_id' })
  recruiter: Employee;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/candidate-contacts/candidate-contact.entity.ts
git commit -m "feat(candidate-contacts): entidad CandidateContact"
```

---

### Task 2: DTOs (create + query)

**Files:**
- Create: `src/candidate-contacts/dto/create-candidate-contact.dto.ts`
- Create: `src/candidate-contacts/dto/query-candidate-contacts.dto.ts`

**Interfaces:**
- Consumes: `ContactDirection` (`../../config/enums`), `PaginationDto` (`../../config/pagination.dto`).
- Produces: `CreateCandidateContactDto` { candidateId, opportunityId, contactType, contactTime, callLength?, contactDesc?, phoneNumberDialed?, direction? } (NO recruiterEmployeeId); `QueryCandidateContactsDto` extends pagination with { candidateId?, opportunityId?, recruiterId?, from?, to? }.

- [ ] **Step 1: Create the create DTO**

```typescript
// src/candidate-contacts/dto/create-candidate-contact.dto.ts
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactDirection } from '../../config/enums';

export class CreateCandidateContactDto {
  @Type(() => Number)
  @IsInt()
  candidateId: number;

  @Type(() => Number)
  @IsInt()
  opportunityId: number;

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
}
```

- [ ] **Step 2: Create the query DTO**

```typescript
// src/candidate-contacts/dto/query-candidate-contacts.dto.ts
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryCandidateContactsDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recruiterId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/candidate-contacts/dto/
git commit -m "feat(candidate-contacts): DTOs de creación y query"
```

---

### Task 3: Service (create + findAll + findOne) with unit tests

**Files:**
- Create: `src/candidate-contacts/candidate-contacts.service.ts`
- Test: `src/candidate-contacts/candidate-contacts.service.spec.ts`

**Interfaces:**
- Consumes: `CandidateContact`, `Candidate`, `Opportunity`, `ContactType`, `CreateCandidateContactDto`, `QueryCandidateContactsDto`.
- Produces: `CandidateContactsService` with `create(dto, recruiterEmployeeId): Promise<CandidateContact>`, `findAll(query): Promise<{items,total,page,limit}>`, `findOne(id): Promise<CandidateContact>`.

- [ ] **Step 1: Write the failing unit test**

```typescript
// src/candidate-contacts/candidate-contacts.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CandidateContactsService } from './candidate-contacts.service';
import { CandidateContact } from './candidate-contact.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';

describe('CandidateContactsService', () => {
  let service: CandidateContactsService;
  let repo: any;
  let candidateRepo: any;
  let opportunityRepo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 99 })),
      findOne: jest.fn(async () => ({ id: 99 })),
      createQueryBuilder: jest.fn(),
    };
    candidateRepo = { findOne: jest.fn(async () => ({ id: 1 })) };
    opportunityRepo = { findOne: jest.fn(async () => ({ id: 2, lastContactAt: null })), save: jest.fn(async (x) => x) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidateContactsService,
        { provide: getRepositoryToken(CandidateContact), useValue: repo },
        { provide: getRepositoryToken(Candidate), useValue: candidateRepo },
        { provide: getRepositoryToken(Opportunity), useValue: opportunityRepo },
      ],
    }).compile();
    service = moduleRef.get(CandidateContactsService);
  });

  it('create() sella el recruiter del token y NO usa ningún recruiter del dto', async () => {
    await service.create(
      { candidateId: 1, opportunityId: 2, contactType: 3, contactTime: '2026-06-28T10:00:00.000Z' } as any,
      7,
    );
    const built = repo.create.mock.calls[0][0];
    expect(built.recruiterEmployeeId).toBe(7);
    expect(built.candidateId).toBe(1);
    expect(built.opportunityId).toBe(2);
    expect(built.contactType).toEqual({ id: 3 });
  });

  it('create() lanza 404 si el candidato no existe', async () => {
    candidateRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2, contactType: 3, contactTime: '2026-06-28T10:00:00.000Z' } as any, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create() lanza 404 si la oportunidad no existe', async () => {
    opportunityRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2, contactType: 3, contactTime: '2026-06-28T10:00:00.000Z' } as any, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findAll() aplica filtros candidateId/opportunityId/recruiterId y pagina', async () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    const res = await service.findAll({ candidateId: 1, opportunityId: 2, recruiterId: 7, page: 1, limit: 20 } as any);
    expect(qb.andWhere).toHaveBeenCalledWith('cc.candidateId = :candidateId', { candidateId: 1 });
    expect(qb.andWhere).toHaveBeenCalledWith('cc.opportunityId = :opportunityId', { opportunityId: 2 });
    expect(qb.andWhere).toHaveBeenCalledWith('cc.recruiterEmployeeId = :recruiterId', { recruiterId: 7 });
    expect(res).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm jest src/candidate-contacts/candidate-contacts.service.spec.ts`
Expected: FAIL ("Cannot find module './candidate-contacts.service'").

- [ ] **Step 3: Implement the service**

```typescript
// src/candidate-contacts/candidate-contacts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CandidateContact } from './candidate-contact.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { CreateCandidateContactDto } from './dto/create-candidate-contact.dto';
import { QueryCandidateContactsDto } from './dto/query-candidate-contacts.dto';

@Injectable()
export class CandidateContactsService {
  constructor(
    @InjectRepository(CandidateContact)
    private readonly repo: Repository<CandidateContact>,
    @InjectRepository(Candidate)
    private readonly candidateRepo: Repository<Candidate>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
  ) {}

  async create(
    dto: CreateCandidateContactDto,
    recruiterEmployeeId: number,
  ): Promise<CandidateContact> {
    const candidate = await this.candidateRepo.findOne({ where: { id: dto.candidateId } });
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    const opportunity = await this.opportunityRepo.findOne({ where: { id: dto.opportunityId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    const contactTime = new Date(dto.contactTime);
    if (!opportunity.lastContactAt || contactTime > opportunity.lastContactAt) {
      opportunity.lastContactAt = contactTime;
      await this.opportunityRepo.save(opportunity);
    }
    const entity = this.repo.create({
      candidateId: dto.candidateId,
      opportunityId: dto.opportunityId,
      contactType: { id: dto.contactType } as ContactType,
      contactTime,
      callLength: dto.callLength,
      contactDesc: dto.contactDesc,
      phoneNumberDialed: dto.phoneNumberDialed,
      direction: dto.direction,
      recruiterEmployeeId,
    });
    const saved = await this.repo.save(entity);
    return this.findOne(saved.id);
  }

  async findAll(
    query: QueryCandidateContactsDto,
  ): Promise<{ items: CandidateContact[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.candidate', 'candidate')
      .leftJoinAndSelect('cc.opportunity', 'opportunity')
      .leftJoinAndSelect('cc.contactType', 'contactType')
      .leftJoinAndSelect('cc.recruiter', 'recruiter');
    if (query.candidateId) {
      qb.andWhere('cc.candidateId = :candidateId', { candidateId: query.candidateId });
    }
    if (query.opportunityId) {
      qb.andWhere('cc.opportunityId = :opportunityId', { opportunityId: query.opportunityId });
    }
    if (query.recruiterId) {
      qb.andWhere('cc.recruiterEmployeeId = :recruiterId', { recruiterId: query.recruiterId });
    }
    if (query.from) {
      qb.andWhere('cc.contactTime >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('cc.contactTime <= :to', { to: query.to });
    }
    qb.orderBy('cc.contactTime', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<CandidateContact> {
    const found = await this.repo.findOne({
      where: { id },
      relations: { candidate: true, opportunity: true, contactType: true, recruiter: true },
    });
    if (!found) {
      throw new NotFoundException('Candidate contact not found');
    }
    return found;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm jest src/candidate-contacts/candidate-contacts.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/candidate-contacts/candidate-contacts.service.ts src/candidate-contacts/candidate-contacts.service.spec.ts
git commit -m "feat(candidate-contacts): service (sella recruiter, valida candidato/oportunidad, filtros) + unit tests"
```

---

### Task 4: Controller + Module + registration

**Files:**
- Create: `src/candidate-contacts/candidate-contacts.controller.ts`
- Create: `src/candidate-contacts/candidate-contacts.module.ts`
- Modify: `src/main.module.ts` (add import + add `CandidateContactsModule` to the `imports` array)

**Interfaces:**
- Consumes: `CandidateContactsService`, `CreateCandidateContactDto`, `QueryCandidateContactsDto`, `CurrentUser`/`AuthUser` (`../config/current-user.decorator`), `CandidateContact`, `Candidate`, `Opportunity`.
- Produces: routes `POST /candidate-contacts`, `GET /candidate-contacts`, `GET /candidate-contacts/:id` (auth-only, NO admin role); `CandidateContactsModule`.

- [ ] **Step 1: Create the controller**

```typescript
// src/candidate-contacts/candidate-contacts.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CandidateContactsService } from './candidate-contacts.service';
import { CreateCandidateContactDto } from './dto/create-candidate-contact.dto';
import { QueryCandidateContactsDto } from './dto/query-candidate-contacts.dto';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('candidate-contacts')
export class CandidateContactsController {
  constructor(private readonly service: CandidateContactsService) {}

  @Post()
  create(@Body() dto: CreateCandidateContactDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.employeeId);
  }

  @Get()
  findAll(@Query() query: QueryCandidateContactsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
// src/candidate-contacts/candidate-contacts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateContact } from './candidate-contact.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { CandidateContactsService } from './candidate-contacts.service';
import { CandidateContactsController } from './candidate-contacts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CandidateContact, Candidate, Opportunity])],
  controllers: [CandidateContactsController],
  providers: [CandidateContactsService],
})
export class CandidateContactsModule {}
```

- [ ] **Step 3: Register the module in `main.module.ts`**

Add the import near the other module imports (after the `ContactHistoryModule` import line):

```typescript
import { CandidateContactsModule } from './candidate-contacts/candidate-contacts.module';
```

Add `CandidateContactsModule` to the `imports: [...]` array (put it right after `ContactHistoryModule,`):

```typescript
    ContactHistoryModule,
    CandidateContactsModule,
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/candidate-contacts/candidate-contacts.controller.ts src/candidate-contacts/candidate-contacts.module.ts src/main.module.ts
git commit -m "feat(candidate-contacts): controller (auth, sella recruiter) + módulo registrado"
```

---

### Task 5: e2e auth test + schema materialization

**Files:**
- Create: `test/candidate-contacts.e2e-spec.ts`

**Interfaces:**
- Consumes: `MainModule`.
- Produces: an e2e test asserting the route is wired and requires authentication.

- [ ] **Step 1: Write the e2e test (mirrors `test/metrics.e2e-spec.ts`)**

```typescript
// test/candidate-contacts.e2e-spec.ts
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { MainModule } from '../src/main.module';

describe('CandidateContacts (e2e)', () => {
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
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects unauthenticated access to candidate-contacts', () => {
    return request(app.getHttpServer())
      .get('/api/candidate-contacts')
      .expect(401);
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `pnpm jest --config test/jest-e2e.json candidate-contacts`
Expected: PASS (1 test). (Boots the app against the configured DB and asserts 401.)

- [ ] **Step 3: Materialize the `candidate_contacts` table in the DB**

The table is created by TypeORM `synchronize` (on when `NODE_ENV !== 'production'`). Run the app once in dev mode so the new entity's table is created in the configured database:

Run: `NODE_ENV=development PORT=3100 pnpm run start` — wait for `Nest application successfully started`, then stop it (Ctrl-C). Verify the table exists (optional): connect with psql and `\d candidate_contacts`.
Expected: the `candidate_contacts` table now exists in the DB. (Deployment then runs with `NODE_ENV=production`, synchronize off.)

- [ ] **Step 4: Full type-check + test suite**

Run: `pnpm exec tsc --noEmit && pnpm jest` (unit) and `pnpm jest --config test/jest-e2e.json` (e2e)
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add test/candidate-contacts.e2e-spec.ts
git commit -m "test(candidate-contacts): e2e de auth (401 sin sesión)"
```

---

## Manual verification (after deploy / or against a local dev run)

With an authenticated recruiter token, confirm the seal + visibility:

```bash
# login -> token
# POST a contact (no recruiter in body) -> 201, recruiter sealed
curl -sS -X POST "$BASE/api/candidate-contacts" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"candidateId":1,"opportunityId":1,"contactType":1,"contactTime":"2026-06-28T10:00:00.000Z","direction":"outbound","contactDesc":"Llamada inicial"}'
# GET filtered by candidate -> includes the row with recruiter/candidate/opportunity/contactType objects
curl -sS "$BASE/api/candidate-contacts?candidateId=1" -H "Authorization: Bearer $TOK"
```

Expected: POST returns the created contact with `recruiterEmployeeId` = the token's employee (not from the body); GET returns it with joined `candidate`, `opportunity`, `contactType`, `recruiter` objects.

## Self-Review notes (coverage vs spec §4)

- Entity fields, FKs, sealed recruiter, reused `contact_types` + `contact_direction` enum — Task 1. ✓
- Create DTO (no recruiter) + query DTO (candidateId/opportunityId/recruiterId/from/to + pagination) — Task 2. ✓
- Seal recruiter from token + validate candidate/opportunity (404) + touch `opportunity.lastContactAt` — Task 3. ✓
- GET joins for names + team-wide (no self-scope) — Task 3 (findAll) + Task 4 (no `@Roles`). ✓
- POST/GET/GET:id, auth-only (no admin) — Task 4. ✓
- Tests: seal + filters (unit, Task 3); unauth 401 (e2e, Task 5). ✓
- Schema materialization for deploy — Task 5 Step 3. ✓
