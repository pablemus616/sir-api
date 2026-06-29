# App Android Reclutadores — Mejoras v2 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. These are INCREMENTAL changes to the existing app at `~/AndroidStudioProjects/sir-mobile` (MVP already built, build green). Build on the existing code; do not rebuild from scratch.

**Goal:** Add 5 enhancements to the SIR recruiter app: (1) recruiters can create vacantes (opportunities) from the app; (2) swipe-to-refresh everywhere; (3) SIR brand theme (navy + teal) with a more interactive/animated UI; (4) contact shortcuts auto-select the método; (5) for calls, auto-capture the real call duration from the call log.

**Architecture:** Same stack (Kotlin, Compose, Hilt, Retrofit/serialization, DataStore, Navigation Compose, Material3). New backend calls: `POST /opportunities`, `GET /clients`, `GET /position-areas`, `GET /pipeline-stages` (all already non-admin GET-accessible; clients GET is open). Call duration uses `READ_CALL_LOG` (runtime permission via accompanist) with a manual fallback.

## Global Constraints

- Repo `~/AndroidStudioProjects/sir-mobile` (branch master). Build `./gradlew assembleDebug`; tests `./gradlew testDebugUnitTest`. Toolchain already resolved (AGP 9.2.1, no kotlin.android plugin, Hilt 2.60, `android.disallowKotlinSourceSets=false`).
- DI = Hilt; conventions = existing (ViewModel `StateFlow<UiState>` + `Channel<Event>`; screens take callbacks + `hiltViewModel()`; `collectAsStateWithLifecycle`; navigation via hoisted callbacks; `StateViews` for loading/empty/error; envelope `{ok,message,data}` + `Paginated<T>`; `toUserMessage(json)` for errors). Spanish UI.
- `recruiterEmployeeId` is sealed server-side — never send it. For create-vacante, `responsibleEmployeeId` = the logged-in recruiter (`AuthRepository.employeeId()`).
- Material3 from the Compose BOM already on the classpath includes `androidx.compose.material3.pulltorefresh.PullToRefreshBox` and `androidx.compose.animation.*`.

## SIR Brand Palette (from the web app `globals.css`, converted to Compose `Color`)

```
SirNavy      = Color(0xFF1B294B)  // primary (hsl 222 47% 20%)
SirNavyDeep  = Color(0xFF0F1729)  // foreground / dark bg (hsl 222 47% 11%)
SirTeal      = Color(0xFF5A9596)  // accent (hsl 181 25% 47%)
SirTealLight = Color(0xFFA6CFD0)  // dark-theme primary / highlight (hsl 181 26% 72%)
SlateBg      = Color(0xFFF8FAFC)  // background
SlateSurface = Color(0xFFFFFFFF)  // surface/card
SlateMuted   = Color(0xFFEEF2F7)  // secondary surface (hsl 220 20% 96%)
SlateBorder  = Color(0xFFE2E8F0)
SlateSubtle  = Color(0xFF64748B)  // muted text (hsl 220 10% 45%)
SirRed       = Color(0xFFEF4343)  // destructive (hsl 0 84% 60%)
White        = Color(0xFFFFFFFF)
```

## API Contract (new calls)

- `GET /clients?page&limit` → `{items:[{id,name,sector?}],total,page,limit}` (open to auth).
- `GET /position-areas?page&limit` → `{items:[{id,name,active}],...}`.
- `GET /pipeline-stages?page&limit` → `{items:[{id,name,sortOrder,probability,isWon,isLost,active}],...}`.
- `POST /opportunities` body: `{clientId*(int), responsibleEmployeeId*(int), pipelineStageId*(int), title?, areaId?, headcount?(>=1), seniority?(junior|mid|senior|lead), amount?, currency?, expectedCloseDate?}` → created Opportunity. (clientId/responsibleEmployeeId/pipelineStageId required.)

---

### Task 1: SIR theme + animated building blocks

**Files:** rewrite `ui/theme/Color.kt`, `ui/theme/Theme.kt`, `ui/theme/Type.kt`; create `ui/components/Interactive.kt`; modify `ui/navigation/NavGraph.kt` (animated transitions).

- [ ] **Step 1: `Color.kt`** — replace with the SIR palette above (all the `val`s).
- [ ] **Step 2: `Theme.kt`** — light + dark `ColorScheme` from the palette and apply via `MaterialTheme`. Also drive the status-bar appearance.
```kotlin
private val LightColors = lightColorScheme(
    primary = SirNavy, onPrimary = White,
    secondary = SirTeal, onSecondary = White,
    tertiary = SirTeal, onTertiary = White,
    background = SlateBg, onBackground = SirNavyDeep,
    surface = SlateSurface, onSurface = SirNavyDeep,
    surfaceVariant = SlateMuted, onSurfaceVariant = SlateSubtle,
    outline = SlateBorder, error = SirRed, onError = White,
)
private val DarkColors = darkColorScheme(
    primary = SirTealLight, onPrimary = SirNavyDeep,
    secondary = SirTeal, onSecondary = White,
    background = SirNavyDeep, onBackground = White,
    surface = Color(0xFF16213B), onSurface = White,
    surfaceVariant = Color(0xFF1F2A44), onSurfaceVariant = Color(0xFFB6C2D9),
    outline = Color(0xFF2C3A57), error = SirRed, onError = White,
)
@Composable
fun SirTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, typography = Typography, content = content)
}
```
- [ ] **Step 3: `Type.kt`** — a fully-specified `Typography(...)` (Material3 defaults are fine; bump titleLarge/headlineSmall to FontWeight.SemiBold for a sharper look). Keep `FontFamily.Default`.
- [ ] **Step 4: `ui/components/Interactive.kt`** — reusable interactive primitives used across screens:
```kotlin
// PressableCard: a Card that scales down slightly while pressed (spring) for tactile feedback.
@Composable
fun PressableCard(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(stiffness = Spring.StiffnessMedium), label = "scale")
    ElevatedCard(
        onClick = onClick,
        interactionSource = interaction,
        modifier = modifier.graphicsLayer { scaleX = scale; scaleY = scale },
        content = content,
    )
}
// StatusChip / SectionFade helpers as needed (AnimatedVisibility wrappers).
```
- [ ] **Step 5: Animated nav transitions** in `NavGraph.kt` — add `enterTransition`/`exitTransition`/`popEnter`/`popExit` to the `NavHost` (slide+fade, ~280ms), like RotoAppstore.
- [ ] **Step 6:** `./gradlew assembleDebug` green. Commit `feat(theme): SIR brand palette (navy+teal) + animated nav + pressable card`.

---

### Task 2: Swipe-to-refresh on all lists/detail

**Files:** modify `ui/opportunities/OpportunitiesScreen.kt` + `OpportunitiesViewModel.kt`, `ui/candidates/CandidatesScreen.kt` + VM, `ui/candidatedetail/CandidateDetailScreen.kt` + VM.

**Pattern (apply to each):** add `refreshing: Boolean` to the UiState (or a separate flow); add a public `fun refresh()` to the VM that re-runs the load with `refreshing=true` then false; wrap the screen content in:
```kotlin
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = viewModel::refresh, modifier = Modifier.padding(paddingValues)) {
    // existing list/content (must be scrollable: LazyColumn fills it)
}
```
- [ ] Opportunities: `refresh()` re-fetches with the current `mineOnly`. Add `refreshing` to state.
- [ ] Candidates: `refresh()` re-runs the current search. Add `refreshing`.
- [ ] CandidateDetail: `refresh()` reloads candidate + history. Add `refreshing`.
- [ ] Each: `./gradlew assembleDebug` green. Commit `feat(refresh): swipe-to-refresh en puestos, candidatos y detalle`.

---

### Task 3: Crear vacante (opportunity) desde la app

**Files:** create `data/remote/ClientsApi.kt`, `PositionAreasApi.kt`, `PipelineStagesApi.kt`; DTOs (reuse `ClientDto`, `AreaDto`, `PipelineStageDto` from `OpportunityDto.kt`; add `ClientDto` GET list if not present); add `create` to `OpportunitiesApi.kt` + `CreateOpportunityRequest` DTO; `data/repository/CatalogRepository.kt` (clients/areas/stages) + extend `OpportunitiesRepository.create`; `ui/newopportunity/NewOpportunityViewModel.kt` + `NewOpportunityScreen.kt`; modify `Routes.kt` + `NavGraph.kt` + `OpportunitiesScreen.kt` (add FAB). Provide new Apis in `NetworkModule`.

- [ ] **Step 1: DTO + Apis**
```kotlin
// add to OpportunityDto.kt
@Serializable data class CreateOpportunityRequest(
    val clientId: Int, val responsibleEmployeeId: Int, val pipelineStageId: Int,
    val title: String? = null, val areaId: Int? = null, val headcount: Int? = null,
    val seniority: String? = null,
)
// ClientsApi.kt
interface ClientsApi { @GET("clients") suspend fun list(@Query("limit") limit: Int = 200): ApiEnvelope<Paginated<ClientDto>> }
// PositionAreasApi.kt
interface PositionAreasApi { @GET("position-areas") suspend fun list(@Query("limit") limit: Int = 200): ApiEnvelope<Paginated<AreaDto>> }
// PipelineStagesApi.kt
interface PipelineStagesApi { @GET("pipeline-stages") suspend fun list(@Query("limit") limit: Int = 200): ApiEnvelope<Paginated<PipelineStageDto>> }
// add to OpportunitiesApi.kt
@POST("opportunities") suspend fun create(@Body body: CreateOpportunityRequest): ApiEnvelope<OpportunityDto>
```
(If `AreaDto` lacks `active`, that's fine — `ignoreUnknownKeys` handles it. `ClientDto(id,name,sector?)` already exists.)
- [ ] **Step 2: Repositories** — `CatalogRepository(clientsApi, areasApi, stagesApi)` with `clients()`, `areas()`, `stages()`; `OpportunitiesRepository.create(req)`. Add `@Provides` for the 3 Apis in `NetworkModule`.
- [ ] **Step 3: NewOpportunityViewModel** — `NewOpportunityUiState(loading, clients, areas, stages, clientId?, title, areaId?, headcount(=1), seniority?, saving, error?)`. `init`: load clients + areas + stages (in parallel via async or sequential). `submit()`: validate `clientId != null`; build `CreateOpportunityRequest(clientId!!, responsibleEmployeeId = auth.employeeId() ?: error, pipelineStageId = stages.minByOrNull{it.sortOrder}?.id ?: error("No hay etapas"), title, areaId, headcount, seniority)`; `repo.create`; on success → `Created(opp.id)` event; errors via `toUserMessage`. Events: `Created(id)`, `Error(msg)`.
- [ ] **Step 4: NewOpportunityScreen** — top bar "Nueva vacante" + back; a form: **Cliente** (required dropdown — `ExposedDropdownMenuBox` listing client names), **Título** (text), **Área** (optional dropdown), **Headcount** (number, default 1, stepper or text), **Seniority** (optional chips: Junior/Mid/Senior/Lead). Save button (disabled while saving / no client). Loading/error states. On `Created(id)` → `onCreated()` (pop back to Puestos, which refreshes).
- [ ] **Step 5: Wire nav** — add `Route.NewOpportunity` (`"newOpportunity"`), a `composable` in NavGraph, and a FAB "Nueva vacante" on `OpportunitiesScreen` → `onNewOpportunity()` → `nav.navigate(Route.NewOpportunity.path)`; on return refresh the puestos list.
- [ ] **Step 6:** `./gradlew assembleDebug` green. Commit `feat(opportunities): crear vacante desde la app`.

---

### Task 4: Shortcuts auto-set método + call duration from call log

**Files:** modify `ui/logcontact/LogContactViewModel.kt` + `LogContactScreen.kt`; create `util/CallLogReader.kt`; modify `AndroidManifest.xml` (add `READ_CALL_LOG`).

- [ ] **Step 1: Manifest** — add `<uses-permission android:name="android.permission.READ_CALL_LOG" />`.
- [ ] **Step 2: `util/CallLogReader.kt`** — read the most recent call's duration (seconds) for a dialed number:
```kotlin
object CallLogReader {
    /** Returns the duration (seconds) of the most recent call to [number] within the last [withinMs], or null. Requires READ_CALL_LOG. */
    fun lastCallDuration(context: Context, number: String?, withinMs: Long = 60 * 60 * 1000): Int? {
        return try {
            val since = System.currentTimeMillis() - withinMs
            val proj = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DURATION, CallLog.Calls.DATE)
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI, proj,
                "${CallLog.Calls.DATE} >= ?", arrayOf(since.toString()),
                "${CallLog.Calls.DATE} DESC",
            )?.use { c ->
                val digits = number?.filter { it.isDigit() }?.takeLast(8)
                while (c.moveToNext()) {
                    val num = c.getString(0)?.filter { it.isDigit() }?.takeLast(8)
                    if (digits == null || num == digits) return c.getInt(1)
                }
            }
            null
        } catch (_: SecurityException) { null }
    }
}
```
- [ ] **Step 3: LogContactViewModel** — add to state `phoneDialed`, `callLength?`, and a transient `pendingCallNumber?`. Add:
  - `fun pickShortcut(kind: String)` where kind ∈ {"call","whatsapp","email"}: set `selectedTypeId` to the contact-type whose `name == kind` (match the loaded `types`); for "call" also stash `pendingCallNumber = candidatePhone` and set `direction = "outbound"`.
  - `fun onReturnFromCall(durationSeconds: Int?)`: if non-null, set `callLength = durationSeconds`.
  - `fun setCallLength(v: Int?)` for manual entry.
  Build the POST with `callLength` (only meaningful for the call type) + `phoneNumberDialed`.
- [ ] **Step 4: LogContactScreen** — the three shortcut buttons now call `viewModel.pickShortcut("call"/"whatsapp"/"email")` AND fire the intent (`ContactIntents.dial/whatsapp/email`). For **call**: request `READ_CALL_LOG` via accompanist `rememberPermissionState`; when the screen resumes after a call (`LifecycleEventEffect(ON_RESUME)` guarded by a "call in progress" flag), call `CallLogReader.lastCallDuration(context, phone)` and pass to `viewModel.onReturnFromCall(...)`. Show the read duration in a "Duración (s)" field that's editable (manual fallback if permission denied / null). The duration field is visible only when the selected type is the call type.
- [ ] **Step 5: Test** — extend/verify a unit test that `pickShortcut("call")` selects the call type id and `onReturnFromCall(125)` sets `callLength=125` and the built request carries it. `./gradlew testDebugUnitTest` green.
- [ ] **Step 6:** `./gradlew assembleDebug` green. Commit `feat(log-contact): atajos autoseleccionan método + duración real de llamada (call log)`.

---

### Task 5: Animation & interactivity polish pass

**Files:** apply across `ui/opportunities`, `ui/candidates`, `ui/candidatedetail`, `ui/logcontact`, `ui/login` screens using Task 1's primitives.

- [ ] **Step 1:** Replace plain list `Card`s with `PressableCard` (Opportunities, Candidates, history rows).
- [ ] **Step 2:** `LazyColumn` items use `Modifier.animateItem()` for insert/remove/move animations.
- [ ] **Step 3:** Wrap loading↔content swaps in `AnimatedContent` or `Crossfade`; wrap empty/error in `AnimatedVisibility` (fade+expand).
- [ ] **Step 4:** Buttons: ensure primary actions use `Button`/`FilledTonalButton` with the brand colors; add a subtle scale/elevation on press where it reads well. Login: animate the submit button loading state (Crossfade text↔spinner).
- [ ] **Step 5:** `./gradlew assembleDebug` + `./gradlew testDebugUnitTest` green. Commit `feat(ui): pase de animaciones e interactividad (listas, transiciones, feedback)`.

---

## Self-Review
- Covers all 5 user requests: crear vacante (T3), swipe-to-refresh everywhere (T2), SIR colors + interactive/animated UI (T1+T5), shortcuts auto-set método (T4), call duration for calls (T4). ✓
- New endpoints all non-admin GET-accessible; create-vacante required fields (clientId, responsibleEmployeeId=me, pipelineStageId=first) covered. ✓
- READ_CALL_LOG is privacy-sensitive: requested at runtime, with a manual-entry fallback when denied/unavailable. ✓
- Reuses existing DTOs (ClientDto/AreaDto/PipelineStageDto) + conventions; no toolchain/version changes. ✓
