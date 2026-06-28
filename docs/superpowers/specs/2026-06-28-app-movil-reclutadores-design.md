# Spec — App móvil de reclutadores (Android) + módulo backend `candidate-contacts`

Fecha: 2026-06-28
Estado: aprobado (brainstorming) — pendiente de plan de implementación.

## 1. Contexto y objetivo

Parte del ecosistema **SIR CRM** (backend NestJS `sir-api`, ya desplegado en `https://api.sir.com.gt`; web Next.js para admin/gestión). Esta entrega añade:

1. Una **app Android nativa** para usuarios **no-admin** (reclutadores/agentes de campo).
2. La **extensión de backend** que la soporta: registrar el **contacto con candidatos**.

**Objetivo central:** que el reclutador en campo **alimente cómo contactó a cada candidato** (llamada / mensaje / correo / WhatsApp), ligado a una vacante, además de navegar candidatos y puestos. Hoy el backend solo registra contacto con **contactos de cliente** (`contact-history`, lado comercial); el contacto con **candidatos** no existe y se crea aquí.

## 2. Usuarios y autenticación

- Usuarios **no-admin** (rol ≠ `admin`) con credenciales existentes del CRM.
- Auth **directa al backend** (no BFF, a diferencia de la web): `POST /api/auth/login` → `{ accessToken, refreshToken }`. El JWT se guarda en **DataStore cifrado**. Un `AuthInterceptor` adjunta `Authorization: Bearer`; ante **401 → `POST /api/auth/refresh` → reintento**; si el refresh falla → logout (volver a Login).
- El `employeeId` del reclutador viaja en el JWT; el backend lo **sella** en cada registro de contacto (el cliente nunca lo envía).
- Prerrequisito ya cubierto: los endpoints de lectura que la app usa (candidates, opportunities, catálogos, employees-nombres) ya son accesibles para no-admin (fix de authz reciente).

## 3. Alcance

**Incluye (MVP):**
- Login.
- Ver **puestos** = oportunidades abiertas (`opportunities?status=open`), con filtro opcional "solo mías" (responsable = yo).
- Buscar **candidatos** (nombre/email/estado) y **crear candidatos** (campos mínimos).
- Detalle de candidato + **historial de contactos**.
- **Registrar contacto candidato↔oportunidad** (núcleo), con atajos a llamar/WhatsApp/email.
- **Mover etapa de aplicación** (funnel del candidato en una vacante).

**Excluye (MVP):**
- Offline / cola de sincronización (la app es **online-first**).
- iOS (solo Android nativo; capa de datos se mantiene limpia por si se porta a KMP luego).
- Funciones de admin (catálogos CRUD, usuarios, roles, métricas globales).
- Lado comercial (contactos de cliente / `contact-history`).

## 4. Backend — módulo nuevo `candidate-contacts` (en `sir-api`)

Espeja el patrón ya probado de `contact-history`, pero para candidatos. Reusa el catálogo `contact_types` (call/email/meeting/whatsapp) y el enum `ContactDirection`.

**Entidad `CandidateContact`** (tabla `candidate_contacts`):
- `id` (PK)
- `candidateId` (int, req) + `candidate` (ManyToOne → Candidate, JoinColumn `candidate_id`)
- `opportunityId` (int, req) + `opportunity` (ManyToOne → Opportunity, JoinColumn `opportunity_id`)
- `contactType` (ManyToOne → ContactType, JoinColumn `contact_type`, req) — viaja como **objeto relación** en el wire
- `direction?` (enum `ContactDirection` inbound/outbound, nullable)
- `contactTime` (timestamptz, req)
- `contactDesc?` (text)
- `callLength?` (int, ≥0)
- `phoneNumberDialed?` (text)
- `recruiterEmployeeId` (int, req) + `recruiter` (ManyToOne → Employee, JoinColumn) — **sellado del token**
- `createdAt` (CreateDateColumn)

**DTOs:**
- `CreateCandidateContactDto`: `candidateId`(req int), `opportunityId`(req int), `contactType`(req int), `contactTime`(req ISO datetime), `direction?`(enum), `callLength?`(int ≥0), `contactDesc?`(string), `phoneNumberDialed?`(string). **No** incluye `recruiterEmployeeId`.
- `QueryCandidateContactsDto extends PaginationDto`: `candidateId?`, `opportunityId?`, `recruiterId?`, `from?`(ISO date), `to?`(ISO date).

**Controller** `@Controller('candidate-contacts')` (auth global; **sin** `@Roles('admin')`):
- `POST /candidate-contacts` → `service.create(dto, user.employeeId)` (sella recruiter). Valida que candidato y oportunidad existen (404 si no). Opcional: tocar `opportunity.lastContactAt` (como `contact-history`).
- `GET /candidate-contacts?candidateId&opportunityId&recruiterId&from&to&page&limit` → `findAll(query)` con `leftJoinAndSelect` de candidate/opportunity/contactType/recruiter (para mostrar nombres). Devuelve `{ items, total, page, limit }`. **Visible a todo el equipo** (no scopeado a "yo") para no duplicar outreach.
- `GET /candidate-contacts/:id` → `findOne` (relaciones cargadas).

**Integración:** registrar `CandidateContactsModule` en `main.module`. Gate del repo: `pnpm exec tsc --noEmit` + jest (e2e/unit). Tests: POST sella recruiter y NO acepta `recruiterEmployeeId` del cliente; GET filtra por candidateId/opportunityId; `contactType` inexistente/ inválido rechazado; (unauth → 401).

**Decisión de modelo:** el contacto se liga a **candidato + oportunidad directo**, NO requiere una `application`. Las aplicaciones (candidato↔oportunidad con etapa) se gestionan con los endpoints existentes (`POST /applications`, `PATCH /applications/:id/stage`).

## 5. App Android — arquitectura

- **Stack:** Kotlin, **Jetpack Compose** (UI), **MVVM** (ViewModel + `StateFlow`), **Retrofit + OkHttp + kotlinx.serialization** (red), **Hilt** (DI), **DataStore (Preferences) cifrado** (tokens), **Navigation Compose**.
- **Capas / paquetes:**
  - `core/` — cliente HTTP, `AuthInterceptor` (Bearer + refresh), `TokenStore` (DataStore), mapeo de errores (`ApiError` → mensaje ES), `Result`/estados de UI.
  - `data/` — Retrofit `*ApiService` + DTOs + `*Repository` por dominio.
  - `domain/` — modelos de dominio + casos de uso simples.
  - `ui/` — pantallas Compose + ViewModels + componentes; navegación.
  - `di/` — módulos Hilt.
- **Repositorios:** Auth, Candidates, Opportunities, Applications, CandidateContacts, ContactTypes.
- **API services** (mapeo REST):
  - Auth: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`.
  - Candidates: `GET /candidates` (search), `GET /candidates/:id`, `POST /candidates`.
  - Opportunities: `GET /opportunities` (status=open, filtros).
  - Applications: `GET /applications` (por candidato/oportunidad), `POST /applications`, `PATCH /applications/:id/stage`.
  - CandidateContacts: `POST /candidate-contacts`, `GET /candidate-contacts`.
  - ContactTypes: `GET /contact-types` (catálogo para el selector de tipo).

## 6. Pantallas y flujos

1. **Login** — usuario/contraseña → token; persiste sesión; navega a Puestos.
2. **Puestos** — lista de vacantes abiertas (buscable; toggle "solo mías"). Estados loading/empty/error. Tap → detalle/seguir a candidatos en contexto de la vacante.
3. **Candidatos** — búsqueda (nombre/email/estado), lista paginada. Botón **"Nuevo candidato"** (alta con campos mínimos: nombre(s)/apellido(s), teléfono, email, fuente). Tap → detalle.
4. **Detalle de candidato** — datos del candidato + **historial de contactos** (`GET /candidate-contacts?candidateId=…`, todos del equipo) + acciones: **Registrar contacto**, **Mover etapa** (si hay aplicación en la vacante en contexto).
5. **Registrar contacto** (núcleo) — selector de **tipo** (call/email/meeting/whatsapp desde `contact-types`), **dirección**, **fecha/hora** (default ahora), **notas**, **duración** (si llamada), **teléfono marcado**; candidato + oportunidad ya en contexto (la oportunidad es obligatoria). **Atajos:** botones "Llamar / WhatsApp / Email" disparan Intents nativos (`tel:`, `https://wa.me/…`, `mailto:`) y **prellenan** el formulario para que el reclutador confirme y guarde el registro (`POST /candidate-contacts`).
6. **Mover etapa de aplicación** — desde el candidato en una vacante; ofrece **solo transiciones legales** según la stage-machine (applied→screening→interview→offer→hired / rejected / withdrawn); `PATCH /applications/:id/stage`. Si aún no existe aplicación candidato↔oportunidad, permite crearla (`POST /applications`).

## 7. Manejo de errores

- `ApiError`/HTTP → mensaje en español (mapa de mensajes conocidos: 409 duplicado de aplicación, 400 transición ilegal, etc.).
- Cada pantalla: estados **loading / empty / error** explícitos.
- 401 → refresh transparente; si falla → Login.
- Sin red (online-first) → aviso claro ("sin conexión"); las acciones requieren internet.

## 8. Testing

- **App:** unit tests de repositorios y ViewModels con API simulada (MockWebServer o fakes); test del `AuthInterceptor` (401→refresh→retry, refresh-fail→logout). UI tests opcionales para el flujo de registrar contacto.
- **Backend:** unit/e2e del módulo `candidate-contacts` (POST sella recruiter / no acepta recruiter del cliente; GET filtra; contactType inválido rechazado; unauth 401), bajo el gate `tsc --noEmit` + jest del repo.

## 9. Decisiones y supuestos

- "Puestos" = oportunidades **abiertas**; filtro opcional responsable=yo.
- Contacto ligado a **candidato + oportunidad** (no a `application`).
- Historial de contactos **visible a todo el equipo**.
- Alta de candidato con **campos mínimos** (el resto se completa en la web admin).
- Online-first; Android-only; no funciones de admin.

## 10. Secuencia de implementación (para el plan)

1. **Backend** `candidate-contacts` (entidad + DTOs + service + controller + módulo + tests) → desplegar en `api.sir.com.gt`.
2. **App** Android:
   a. Scaffold del proyecto + DI + red + `TokenStore` + `AuthInterceptor`.
   b. Login + navegación + sesión persistida.
   c. Pantallas de lectura: Puestos + Candidatos (+ detalle + historial).
   d. **Registrar contacto** (núcleo) + atajos de Intent.
   e. Alta de candidato + mover etapa de aplicación.
   f. Pulido: errores, estados, tests.

## 11. Repos / ubicación

- **Backend:** `sir-api` (repo existente; `origin/main`).
- **App Android:** **nuevo proyecto** (ubicación a confirmar al iniciar, p. ej. `~/AndroidStudioProjects/sir-mobile`). Repo propio.
