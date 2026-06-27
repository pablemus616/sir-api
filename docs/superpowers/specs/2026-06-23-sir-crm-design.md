# SIR — CRM/Microservicio para Outsourcing de RRHH — Diseño

Fecha: 2026-06-23 (rev. 2026-06-26: dashboard comercial / pipeline unificado)
Estado: aprobado para planificación

## 1. Contexto y modelo de negocio

SIR es una API (CRM/microservicio) para una agencia de **outsourcing/staffing** de RRHH. La agencia tiene **personal interno** (`employees`: comerciales y reclutadores) que:

- Hacen **gestión comercial** hacia una cartera de **clientes** (empresas) y sus contactos.
- Reciben **requests inbound** (leads externos que piden contacto) y deben atenderlos.
- **Reclutan candidatos externos** y los **colocan** en posiciones de los clientes.

Lo comercial y el reclutamiento **van de la mano**: el funnel comercial (oportunidad → propuesta → venta cerrada) y la colocación de un tercero son la misma historia. Una **oportunidad** = una **posición** que la agencia trabaja para un cliente; "**venta cerrada / contratación**" = colocar a un tercero (candidato) en esa posición (`placement`), y el **monto de la propuesta = el salario** de la posición (mueve los Quetzales y la comisión). El KPI central es la **contratación de terceros**.

El objetivo central del producto es el **dashboard de métricas**: actividad comercial, funnel de conversión, colocaciones e ingresos, con **filtros** por cliente / sector / área / fecha y **gráficas** (totales agrupados).

La API sirve a **dos clientes**: un frontend web (CRM interno) y una **app móvil**.

## 2. Objetivos y criterios de éxito

- Gestionar personal propio (`employees`) y usuarios/roles.
- Ver y gestionar la cartera de clientes y sus contactos, clasificados por **sector** (industria).
- Registrar y **monitorear la forma de contacto** (llamadas: número marcado, duración, cliente, puesto).
- Recibir requests inbound y saber si **fueron atendidas** (por quién, cuándo, y si convirtieron).
- Gestionar el **pipeline comercial unificado**: oportunidades con etapa, **probabilidad por etapa**, monto de propuesta, último contacto y próximo seguimiento.
- Gestionar el reclutamiento ligado a la oportunidad: candidatos → postulaciones → colocación (= venta cerrada).
- Exponer un **dashboard** con totales (oportunidades, ventas, conversión %, Quetzales) filtrable por cliente/sector/área/fecha y con gráficas por esas dimensiones.

Éxito = los flujos anteriores funcionan end-to-end, protegidos por auth/rol, y los endpoints de métricas devuelven agregaciones correctas construidas solo con métodos de TypeORM.

## 3. Decisiones de diseño (cerradas)

1. **Un solo spec** cubre todo el sistema; la **implementación se fasea** (ver §18).
2. **`synchronize` por entorno**: `true` en dev (las entities manejan el esquema), `false` en prod. Sin migraciones ni DDL a mano.
3. **Autorización por rol** para v1 (`@Roles()` + `RolesGuard`). `permissions`/`role_permissions` quedan modeladas para granular en v2 sin re-trabajo.
4. **Auth**: JWT por header `Authorization: Bearer`, **sin cookies** (uniforme web + móvil). **Access token** JWT corto + **refresh token** opaco persistido en `sessions` (revocable, rotable). Ver §8.
5. **`user_roles` M:N** (un empleado puede tener varios roles).
6. **`candidates.source`** como `text` en v1 (lookup `candidate_sources` queda para v2).
7. **Sin `application_stage_history`** en v1 (funnel por snapshot de `stage` + conteos por fecha). Historial de etapas queda para v2.
8. **Paginación offset** (`page`/`limit`) en v1.
9. **Hard delete** restringido por rol (sin soft-delete en v1).
10. **Pipeline unificado**: `opportunities` es la entidad central y **reemplaza** a `vacancies`. Una oportunidad = una posición; candidatos postulan a ella; el `placement` es la venta/contratación.
11. **`pipeline_stages` como tabla configurable**: etapas reales (contacto inicial → entrevistas → propuesta → cierre) con **probabilidad por etapa** (editable por admin, sin tocar código).
12. **Catálogos de dimensiones**: `sectors` (industria del cliente, p.ej. call center) asociado a la empresa; `position_areas` (área funcional: IT, Ventas, Logística…) que **agrupa los puestos**. Ambas son dimensiones de filtro/gráfica.
13. **Dinero nuevo en `numeric(14,2)`**, moneda **`GTQ`** (mono-moneda v1). Las columnas de dinero **existentes** en el DDL (`employees.salary`) se mantienen como están para no romper el esquema.
14. **Métricas con set de filtros comunes** (rango de fechas, sector, área, cliente, responsable, etapa, estado). El dashboard muestra **totales**; las **gráficas** son esos mismos totales **agrupados** por dimensión (cliente/sector/área), respetando los filtros activos.
15. **Propuesta** = `proposal_sent_at` + `amount` en la oportunidad (cuenta "propuestas enviadas" y su monto). Tabla de versiones de propuesta queda para v2.

## 4. Restricciones de implementación

- **Sin comentarios** en el código.
- **Solo métodos de TypeORM** (repositorios y QueryBuilder). **Prohibido SQL crudo**, incluidas las métricas (se construyen con QueryBuilder).
- Seguir patrones existentes: Fastify, DTOs con class-validator, respuestas envueltas por `GlobalResponseInterceptor` (`{ ok, message, data }`), errores por `GlobalExceptionFilter`, prefijo `/api`, Throttler, Helmet.
- Controllers delgados; la lógica de negocio vive en services.

## 5. Arquitectura y convenciones

- NestJS 11 + Fastify + TypeORM 1.0 (Postgres). Un **módulo Nest por subsistema**; cada módulo es dueño de su entity (`*.entity.ts`) y la registra con `TypeOrmModule.forFeature([...])`. `autoLoadEntities: true` ya las recoge.
- DTOs `CreateX` / `UpdateX` (`PartialType`) con class-validator. El `ValidationPipe` global ya aplica `whitelist + forbidNonWhitelisted + transform`.
- Los controllers retornan el dato crudo; el interceptor global lo envuelve.
- Respuesta paginada estándar: `{ items, total, page, limit }`.
- Errores: los services lanzan `NotFoundException` / `ConflictException` / `BadRequestException` / `UnauthorizedException` / `ForbiddenException`; el filtro global los normaliza.

## 6. Cambios de configuración (TypeORM, en `main.module.ts`)

Dos cambios, ambos necesarios para que las entities calcen con el DDL existente sin que `synchronize` rompa nada:

- **`synchronize` por entorno**: `synchronize: configService.get('NODE_ENV') !== 'production'`.
- **`SnakeNamingStrategy`** (pequeña, sin dependencia nueva): mapea `firstName ↔ first_name`, `employeeId ↔ employee_id`. Sin esto, TypeORM esperaría columnas camelCase e intentaría crear columnas duplicadas sobre las tablas existentes. Garantiza que las entities mapean las tablas actuales **y** que las tablas nuevas nacen en snake_case.
- Mantener `logging: ['error','warn']`; activar `['schema']` temporalmente en el primer arranque para verificar que `synchronize` solo **crea** tablas nuevas y no hace `ALTER` destructivo sobre las existentes (ver §16).

## 7. Modelo de datos

Notación: PK = clave primaria; FK = foreign key; `?` = nullable; 🆕 = tabla/columna nueva; ✏️ = cambio sobre tabla existente. Tipos PG: `text`, `date`, `timestamptz`, `numeric(14,2)` (dinero nuevo), `double precision` (= `float` del DDL existente), `smallint`, `int`, `boolean`, `uuid`, `enum`.

### 7.1 Entities existentes (mapeo 1:1 con el DDL)

`Role(id, name)`, `Permission(id, name)`, `Employee(id, first_name, second_name?, last_name, sur_name?, national_id?, phone_number?, email?, birth_date?, hire_date?, salary?)`, `User(id, username, password, employee_id→employees)`, `Session(id uuid default uuidv7(), user_id→users, token unique, creation_date, refreshed_at, ip)`, `Client(id, name, sector?, employee_size?)`, `ClientContact(id, name, phone_number?, email?, client_id→clients)`, `ContactType(id, name)`, `ContactHistory(id, employee_id→employees, contact_id→client_contacts, contact_type→contact_types, contact_time, call_length?, contact_desc?)`.

Ajustes sobre existentes:

- `User.username` → **unique** (índice único; sensato para login). `User.password` se guarda **hasheado** (bcrypt).
- `Session.token` → guarda el **hash** del refresh token (no el token en claro), `unique`.
- `Client` ✏️ → `+ sector_id? FK -> sectors` 🆕 (catálogo). La columna `sector` (text) existente se conserva como **legacy** (no se borra para no romper el DDL); el catálogo `sector_id` es la dimensión nueva de filtro/gráfica.
- `ContactHistory` ✏️ (monitoreo de forma de contacto):
  - `+ phone_number_dialed? text` 🆕 (número al que se llamó).
  - `+ direction? enum contact_direction` 🆕 (`inbound | outbound`).
  - `+ opportunity_id? FK -> opportunities` 🆕 (liga el contacto a la oportunidad ⇒ trae cliente **y** puesto/área).
  - `call_length` existente se usa como **duración de la llamada** (segundos); no se duplica.

### 7.2 Cableado RBAC 🆕

- `role_permissions` 🆕 — M:N `Role ↔ Permission` (`@ManyToMany` + `@JoinTable`).
- `user_roles` 🆕 — M:N `User ↔ Role` (`@ManyToMany` + `@JoinTable`).

El `RolesGuard` v1 chequea **nombres de rol** del usuario. Los `permissions` quedan asociables a roles pero aún no se evalúan por endpoint (v2).

### 7.3 `contact_requests` ✏️ (que "fueron atendidas" sea medible)

```
contact_requests
  id PK · contact_name? · phone_number? · email? · request_desc? · was_handled boolean
  + created_at               timestamptz default now            🆕
  + handled_by_employee_id   FK -> employees   ?                 🆕
  + handled_at               timestamptz       ?                 🆕
  + resulting_client_id      FK -> clients     ?                 🆕  (lead -> cliente)
```

### 7.4 Catálogos de dimensiones 🆕

```
sectors 🆕  (industria del cliente: call center, BPO, retail…)
  id PK · name text unique · active boolean default true

position_areas 🆕  (área funcional que agrupa puestos: IT, Ventas, Logística, RRHH…)
  id PK · name text unique · active boolean default true

pipeline_stages 🆕  (etapas configurables con probabilidad de contratación)
  id PK
  name              text                       (Contacto inicial, Entrevista 1…)
  sort_order        int
  probability       smallint                   (0–100, "amarrada a la etapa")
  is_won            boolean default false       (etapa de cierre ganado)
  is_lost           boolean default false       (etapa de cierre perdido)
  active            boolean default true
```

### 7.5 Pipeline comercial unificado 🆕

```
opportunities 🆕  (posición que la agencia trabaja para un cliente; reemplaza a vacancies)
  id PK
  client_id                  FK -> clients
  area_id?                   FK -> position_areas      (IT/Ventas/Logística — dimensión de gráfica)
  responsible_employee_id    FK -> employees           (comercial dueño)
  client_contact_id?         FK -> client_contacts     (quién la pidió)
  pipeline_stage_id          FK -> pipeline_stages
  origin_contact_request_id? FK -> contact_requests    (lead inbound que la originó)
  title?            text                               (nombre específico del puesto)
  seniority?        enum seniority
  headcount         int       default 1
  probability       smallint  default 0                (snapshot; se setea desde la etapa al transicionar, override manual)
  amount?           numeric(14,2)                      (monto de la propuesta = salario propuesto)
  currency          text      default 'GTQ'
  status            enum opportunity_status default 'open'   (open | won | lost)
  source?           text
  last_contact_at?   timestamptz                       (último contacto)
  next_follow_up_at? timestamptz                       (próximo seguimiento)
  expected_close_date? date
  proposal_sent_at?  timestamptz                       (marca/cuenta "propuestas enviadas")
  won_at? timestamptz · lost_at? timestamptz · lost_reason? text
  created_at timestamptz default now
  updated_at timestamptz (@UpdateDateColumn)
```

### 7.6 Reclutamiento / Colocación 🆕

```
candidates 🆕
  id PK
  first_name · second_name? · last_name · sur_name? · national_id?
  phone_number? · email? · birth_date?
  headline?         text     (rol actual/deseado)
  source?           text     (referral/jobboard/inbound/linkedin…)
  expected_salary?  numeric(14,2)
  status            enum candidate_status  default 'new'
  notes?            text
  created_at        timestamptz default now

applications 🆕  (funnel candidato ↔ oportunidad)
  id PK
  candidate_id              FK -> candidates
  opportunity_id            FK -> opportunities
  referred_by_employee_id?  FK -> employees
  stage   enum application_stage default 'applied'
  source? text · notes? text
  applied_at timestamptz default now
  updated_at timestamptz  (@UpdateDateColumn)
  UNIQUE(candidate_id, opportunity_id)

placements 🆕  (colocación cerrada = "contratación / venta cerrada", KPI central)
  id PK
  application_id            FK -> applications
  candidate_id              FK -> candidates
  opportunity_id            FK -> opportunities
  placed_by_employee_id     FK -> employees
  placement_date            date
  start_date? date · end_date? date · end_reason? text
  agreed_salary? numeric(14,2) · fee? numeric(14,2)   (comisión agencia)
  status  enum placement_status default 'active'
  created_at timestamptz default now
```

### 7.7 Enums

- `candidate_status`: `new | active | placed | on_hold | discarded`
- `seniority`: `junior | mid | senior | lead`
- `opportunity_status`: `open | won | lost`
- `application_stage`: `applied | screening | interview | offer | hired | rejected | withdrawn`
- `placement_status`: `active | ended | cancelled`
- `contact_direction`: `inbound | outbound`

(El antiguo `vacancy_status` desaparece: el estado comercial vive en `opportunity_status` + la etapa en `pipeline_stages`.)

### 7.8 Constraints e índices

- `applications` UNIQUE(`candidate_id`, `opportunity_id`).
- `users.username` UNIQUE; `sessions.token` UNIQUE; `sectors.name` UNIQUE; `position_areas.name` UNIQUE.
- Índices en FKs de filtrado frecuente: `contact_history(employee_id, contact_time)`, `contact_history(opportunity_id)`, `applications(opportunity_id, stage)`, `placements(placement_date)`, `opportunities(client_id, status)`, `opportunities(pipeline_stage_id)`, `opportunities(area_id)`, `opportunities(next_follow_up_at)`, `clients(sector_id)`, `contact_requests(was_handled, created_at)`.

## 8. Auth & RBAC

### 8.1 Tokens (JWT Bearer, sin cookies)

- **Access token**: JWT firmado con `JWT_ACCESS_SECRET`, corto (`JWT_ACCESS_TTL`, p.ej. 15m). Payload: `{ sub: userId, employeeId, roles: string[], sid: sessionId }`. Se valida **stateless** en cada request (sin tocar BD).
- **Refresh token**: cadena aleatoria opaca (256 bits, base64url). Se entrega al cliente; en BD se guarda su **hash sha256** en `sessions.token` (única). TTL largo (`JWT_REFRESH_TTL`, p.ej. 30d). Una fila `sessions` = una sesión (con `ip`, `creation_date`, `refreshed_at`).

### 8.2 Flujos

- `POST /auth/login` (público): valida `username` + `password` (`bcrypt.compare`); crea fila `sessions` (hash del refresh, ip, creation_date); devuelve `{ accessToken, refreshToken }`.
- `POST /auth/refresh` (público): recibe el refresh; hashea y busca en `sessions`; si válido y no expirado, **rota** (nuevo refresh + `refreshed_at = now`) y emite nuevo access. Rotación = mitiga replay.
- `POST /auth/logout` (auth): borra la fila `sessions` de la sesión actual (`sid`).
- `GET /auth/me` (auth): usuario + roles + empleado.
- `GET /auth/sessions` (auth) / `DELETE /auth/sessions/:id` (auth): listar/revocar mis sesiones.

Los roles van dentro del access token; como es corto, cambios de rol se reflejan al siguiente refresh (aceptable).

### 8.3 Guards (globales vía `APP_GUARD`, en orden)

1. `ThrottlerGuard` (ya existe).
2. `JwtAuthGuard` 🆕: valida Bearer; adjunta `{ userId, employeeId, roles, sessionId }` al request. Se salta con `@Public()`.
3. `RolesGuard` 🆕: lee metadata de `@Roles('admin', …)`; sin decorador ⇒ basta estar autenticado.

`ApiKeyGuard` 🆕 (no global): protege **solo** el endpoint público de leads inbound (`POST /contact-requests`). Valida header `x-api-key` contra `INBOUND_API_KEY`. Ese route lleva `@Public()` (salta JWT) + `ApiKeyGuard` + el throttling global. Es el archivo `src/config/api-key.guard.ts`.

Decoradores nuevos en `src/config/`: `@Public()`, `@Roles()`, `@CurrentUser()`.

### 8.4 Roles base

`admin` (todo), `recruiter` (reclutamiento + comercial), `agent` (comercial/contacto). El `RolesGuard` compara contra estos nombres. Se siembran (§13).

## 9. Estructura de módulos

```
src/
  config/   global-exception.filter · global-response.interceptor (ya)
            snake-naming.strategy 🆕 · jwt-auth.guard 🆕 · roles.guard 🆕 · api-key.guard 🆕
            public.decorator 🆕 · roles.decorator 🆕 · current-user.decorator 🆕
            jwt.service 🆕 (firmar/verificar) · pagination.dto 🆕
  auth/ · users/ · roles/ (roles+permissions) · employees/
  clients/ · client-contacts/ · contact-types/ · contact-history/ · contact-requests/
  sectors/ · position-areas/ · pipeline-stages/ · opportunities/
  candidates/ · applications/ · placements/ · metrics/
```

## 10. Superficie de endpoints (todo bajo `/api`)

| Recurso | Endpoints | Acceso |
|---|---|---|
| auth | `POST /auth/login` ·`POST /auth/refresh` ·`POST /auth/logout` ·`GET /auth/me` ·`GET /auth/sessions` ·`DELETE /auth/sessions/:id` | público (login/refresh) / auth |
| users | CRUD ·`POST /users/:id/roles` ·`DELETE /users/:id/roles/:roleId` | admin |
| roles | CRUD ·`POST /roles/:id/permissions` ·`DELETE /roles/:id/permissions/:permId` | admin |
| permissions | CRUD | admin |
| employees | CRUD | admin |
| sectors | CRUD | admin |
| position-areas | CRUD | admin |
| pipeline-stages | CRUD (`?active`) | admin |
| clients | CRUD (`?sectorId`) ·`GET /clients/:id` (con contactos) | auth |
| client-contacts | CRUD (`?clientId=`) | auth |
| contact-types | CRUD | admin |
| contact-history | `POST` (sella employee del `@CurrentUser`; campos de llamada) ·`GET` (filtros: employee/contacto/cliente/tipo/oportunidad/dirección/rango fechas, paginado) ·`GET /:id` | auth |
| contact-requests | `POST` (**público + API key**) ·`GET` (`?wasHandled=`, paginado) ·`GET /:id` ·`PATCH /:id/handle` | público / auth |
| opportunities | CRUD ·`GET` (filtros: cliente/sector/área/etapa/estado/responsable/seguimiento-vencido, paginado) ·`PATCH /:id/stage` ·`PATCH /:id/proposal` ·`PATCH /:id/follow-up` ·`PATCH /:id/win` ·`PATCH /:id/lose` | auth |
| candidates | CRUD ·`GET` (búsqueda nombre/email/status/source, paginado) ·`GET /:id` (con applications) | auth |
| applications | `POST` ·`GET` (`?opportunityId&candidateId&stage`) ·`GET /:id` ·`PATCH /:id/stage` | auth |
| placements | `POST` (cierra hire = venta) ·`GET` (`?clientId&recruiterId&status&rango fechas`) ·`GET /:id` ·`PATCH /:id` | auth |
| metrics | `GET /metrics/{overview,commercial,pipeline,contacts,requests,recruitment/funnel,placements}` y `GET /metrics/charts/{by-client,by-sector,by-area}` (filtros comunes §12) | admin |

## 11. Reglas de negocio (en services)

- `PATCH /contact-requests/:id/handle`: setea `was_handled = true`, `handled_at = now`, `handled_by_employee_id = currentUser.employeeId`, y opcional `resulting_client_id`.
- `POST /contact-history`: sella `employee_id = currentUser.employeeId`. Si trae `opportunity_id`, actualiza `opportunity.last_contact_at = contact_time` (si es más reciente).
- `PATCH /opportunities/:id/stage`: setea `pipeline_stage_id`; `probability := stage.probability` (salvo override explícito en el body). Si `stage.is_won` ⇒ `status = 'won'`, `won_at = now`; si `stage.is_lost` ⇒ `status = 'lost'`, `lost_at = now`, `lost_reason` opcional. Rechaza etapa inactiva (`BadRequestException`).
- `PATCH /opportunities/:id/proposal`: setea `proposal_sent_at = now` (si null) y `amount` (monto de la propuesta).
- `PATCH /opportunities/:id/follow-up`: setea `next_follow_up_at`.
- `PATCH /opportunities/:id/win` · `/lose`: atajos que fijan `status` + `won_at`/`lost_at` (+ `lost_reason`) y mueven a la etapa `is_won`/`is_lost` correspondiente.
- `PATCH /applications/:id/stage`: máquina de estados; transiciones válidas
  `applied → screening → interview → offer → hired`, y desde casi cualquier estado activo → `rejected`/`withdrawn`. Rechaza transiciones inválidas (`BadRequestException`).
- `POST /placements` (desde una `application`): valida que la application exista; setea `application.stage = 'hired'`; copia `candidate_id`/`opportunity_id`; sella `placed_by_employee_id = currentUser.employeeId`. Si el nº de placements activos de la oportunidad alcanza su `headcount` ⇒ `opportunity.status = 'won'` + `won_at = now` (venta cerrada / contratación).

## 12. Métricas (QueryBuilder, sin SQL crudo)

### 12.1 Filtros comunes

Los endpoints comerciales aceptan el mismo set de filtros (todos opcionales): `from`, `to` (rango sobre la fecha relevante), `sectorId`, `areaId`, `clientId`, `responsibleEmployeeId`, `stageId`, `status`. El dashboard devuelve **totales** ya filtrados; las **gráficas** (`/metrics/charts/*`) devuelven esos mismos totales **agrupados** por la dimensión del endpoint, respetando los filtros.

### 12.2 Endpoints

- `GET /metrics/overview`: KPIs snapshot — nº clientes, oportunidades abiertas, valor de pipeline (Σ `amount` abiertas), candidatos activos, placements del mes, requests pendientes (`was_handled = false`).
- `GET /metrics/commercial`: **total oportunidades**, **total ventas** (`status='won'`), **conversión %** (won/total y won/propuestas), **propuestas enviadas** (conteo y Σ `amount` con `proposal_sent_at` no nulo), **valor ganado = total Quetzales** (Σ `amount` de won), **valor ponderado/forecast** (Σ `amount * probability / 100` de abiertas).
- `GET /metrics/pipeline`: conteo y Σ `amount` por etapa (`pipeline_stages`); funnel contacto → propuesta → venta.
- `GET /metrics/contacts` (monitoreo de contacto): conteo de `contact_history`, Σ y promedio de `call_length` (duración), agrupado por empleado / `contact_type` / dirección; soporta `clientId`.
- `GET /metrics/requests`: total inbound, atendidas, **tasa de atención**, **tiempo medio de respuesta** (`handled_at - created_at`), convertidas a cliente y tasa de conversión.
- `GET /metrics/recruitment/funnel`: conteo de `applications` por `stage`; ratios de conversión entre etapas (snapshot); `hired` vs `rejected` en el periodo (por `updated_at`).
- `GET /metrics/placements` (`?clientId&recruiterId`): nº de placements, ingreso (`Σ fee`), **time-to-fill** medio (`placement_date - opportunity.created_at`), agrupado por reclutador/cliente.
- `GET /metrics/charts/by-client` · `by-sector` · `by-area`: totales (oportunidades, ventas, Σ Quetzales) agrupados por cliente / `sectors` / `position_areas`.

Implementación: `repository.createQueryBuilder().select(...).addSelect('AVG(...)', ...).where('... BETWEEN :from AND :to').groupBy(...)`. Nada de `entityManager.query()` con SQL en string.

## 13. Seeds 🆕

Con `synchronize` las tablas nacen vacías; sin seed no hay login ni catálogos. Script de seed idempotente (comando aparte, p.ej. `src/database/seed.ts` ejecutable con ts-node):

- Roles base: `admin`, `recruiter`, `agent`.
- Un `employee` + `user` admin inicial (credenciales desde `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`, password hasheado), con rol `admin`.
- `contact_types` base: `call`, `email`, `meeting`, `whatsapp`.
- `sectors` base: `call center`, `BPO`, `retail`, `tecnología`, `manufactura`.
- `position_areas` base: `IT`, `Ventas`, `Logística`, `RRHH`, `Finanzas`, `Operaciones`.
- `pipeline_stages` base (probabilidad amarrada a la etapa): `Contacto inicial` (10), `Calificado` (25), `Entrevista 1` (40), `Entrevista 2` (60), `Propuesta enviada` (75), `Negociación` (90), `Ganada` (100, `is_won`), `Perdida` (0, `is_lost`).

## 14. Testing (TDD)

Tienes jest + supertest + config e2e. Foco en la lógica no trivial, no CRUD exhaustivo:

- **Unit (repos mockeados)**: `AuthService` (login, refresh con rotación, logout), `JwtAuthGuard`/`RolesGuard`, transición de etapa de `opportunities` (probabilidad desde etapa + win/lose), máquina de estados de `applications`, cierre de `placement` → `won` de la oportunidad, y las agregaciones de `metrics` comercial (con datos controlados).
- **e2e**: flujo auth (login → endpoint protegido → refresh → logout), inbound con API key, y un flujo comercial completo oportunidad → propuesta → application → placement → métrica de venta.

## 15. Variables de entorno

Existentes: `PG_HOST`, `PG_USER`, `PG_PASS`, `PG_DB`, `PORT`.
Nuevas: `NODE_ENV` (gobierna `synchronize`), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (def. `15m`), `JWT_REFRESH_TTL` (def. `30d`), `INBOUND_API_KEY`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`.

## 16. Riesgos y verificaciones

- **API TypeORM 1.0**: confirmar en el primer arranque que la sintaxis de decoradores/QueryBuilder usada existe (PK identity, enums PG, `@UpdateDateColumn`, `@ManyToMany`). Mapear `sessions.id` para respetar el `default uuidv7()` existente.
- **`synchronize` no destructivo**: primer arranque con `logging: ['schema']`; verificar en logs que solo hay `CREATE TABLE` de las tablas nuevas (y los índices/uniques nuevos), sin `ALTER`/`DROP` sobre las existentes. Las PK `generated always as identity` deben mapearse con estrategia identity para evitar diffs.
- **`clients.sector` (text legacy) vs `sector_id` (FK)**: el DDL trae `sector` text; añadimos `sector_id` sin tocar el text. La entity mapea ambas; no renombrar ni borrar `sector` en v1 (evita `ALTER` destructivo). El catálogo es la dimensión nueva; migrar los valores text al catálogo es tarea de datos aparte.
- **FKs que no siguen la convención `_id`**: en `contact_history` las columnas existentes son `contact_id` (→ `client_contacts`) y `contact_type` (→ `contact_types`, **sin** `_id`). La relación `contactType` debe llevar `@JoinColumn({ name: 'contact_type' })`; si no, la `SnakeNamingStrategy` esperaría `contact_type_id` y `synchronize` crearía una columna duplicada. Revisar todos los `@JoinColumn` contra el DDL real.
- **`numeric` vs JS**: TypeORM devuelve `numeric` como `string`; las métricas que suman Quetzales deben castear/parsear en el QueryBuilder (`CAST(... AS double precision)` vía `.addSelect`) o convertir el resultado en el service, no en el cliente.
- **Orden de guards** `APP_GUARD`: Throttler → JwtAuth → Roles. Verificar que `@Public()` realmente salta JwtAuth.
- **`forbidNonWhitelisted`** global: los DTOs deben declarar todas las props esperadas o las requests fallarán con 400.

## 17. Fuera de alcance / v2

- Autorización **granular por permiso** (evaluar `permissions` por endpoint).
- `application_stage_history` (funnel por cohortes, tiempo en etapa).
- Lookup `candidate_sources`; normalización del `title` del puesto a un catálogo fino.
- Tabla de **versiones de propuesta** (historial de montos/ofertas por oportunidad).
- Oportunidad **multi-puesto** (un deal comercial que abarque varias posiciones distintas).
- Migrar `clients.sector` (text legacy) al catálogo `sectors` y eliminar la columna text.
- Soft delete (`@DeleteDateColumn`).
- Refresh token en cookie httpOnly para el cliente web (hoy Bearer uniforme).
- Paginación por cursor.
- Multi-moneda (hoy `GTQ` fijo).

## 18. Fases de implementación (la implementación se fasea aunque el spec sea único)

1. **Cimientos**: config (synchronize por entorno + SnakeNamingStrategy), entities de todo el modelo, arranque verificado (§16).
2. **Auth & RBAC**: jwt.service, guards/decoradores, `auth` module, seeds, `users`/`roles`/`permissions`.
3. **CRM core**: `employees`, `clients` (+sector), `client-contacts`, `contact-types`, catálogos `sectors`/`position-areas`/`pipeline-stages`.
4. **Actividad**: `contact-history` (campos de llamada), `contact-requests` (incl. endpoint público + API key).
5. **Comercial & Reclutamiento**: `opportunities` (etapas/probabilidad/seguimiento/propuesta/win-lose), `candidates`, `applications` (máquina de estados), `placements` (cierre = venta/contratación).
6. **Métricas & Dashboard**: filtros comunes + endpoints de agregación y gráficas (`commercial`, `pipeline`, `charts/*`, `contacts`, `requests`, `recruitment/funnel`, `placements`).
7. **Tests** de lo no trivial a lo largo de cada fase (TDD).
