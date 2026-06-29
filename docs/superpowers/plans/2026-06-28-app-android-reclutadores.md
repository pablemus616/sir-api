# App Android Reclutadores (SIR) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Android app for SIR non-admin recruiters to browse open positions (oportunidades), search/create candidates, log how they contacted each candidate (call/whatsapp/email/meeting) for a position, view a candidate's contact history, and move an application's stage — talking directly to the existing NestJS backend at `https://api.sir.com.gt/api` with JWT auth (Bearer + 401 refresh).

**Architecture:** Single-module Android app, Kotlin + Jetpack Compose, **MVVM**. **Hilt** for DI, **Retrofit + OkHttp + kotlinx.serialization** for networking, **DataStore (Preferences)** for token persistence, **Navigation Compose** (string routes). The backend wraps every response in `{ ok, message, data }` → a generic `ApiEnvelope<T>` unwrapped in a base call helper. Bearer token attached by an `AuthInterceptor`; an `Authenticator` performs `POST /auth/refresh` on 401 and retries (refresh-fail → clear session → relogin). DTOs are used directly as UI models (no separate domain-model layer — YAGNI for 1:1 mapping). Layering: `data/{remote,remote/dto,local,repository}` + `ui/{<feature>,components,navigation,theme}` + `di/`.

**Tech Stack:** Kotlin 2.2.10, AGP 9.2.1, compileSdk 36, minSdk 33, targetSdk 36, Java 11, Compose BOM 2026.02.01, Material3, Navigation Compose 2.8.5, Hilt 2.57.1 (KSP), DataStore-Preferences 1.1.1, Retrofit 2.11.0 + retrofit2-kotlinx-serialization-converter 1.0.0, OkHttp 4.12.0, kotlinx-serialization-json 1.7.3, coroutines 1.9.0, accompanist-permissions 0.36.0, Feather icons 1.1.1. Tests: JUnit4, OkHttp MockWebServer 4.12.0, kotlinx-coroutines-test 1.9.0, Turbine 1.1.0.

## Global Constraints

- **Repo / package:** project at `~/AndroidStudioProjects/sir-mobile`; `namespace` = `applicationId` = `com.xnihilfx.sirmobile`.
- **Backend base URL:** `https://api.sir.com.gt/api` via `buildConfigField("String","API_BASE_URL", ...)`. HTTPS only — no cleartext / network-security-config needed.
- **Response envelope (every endpoint):** `{ ok: boolean, message: string, data: <payload> }`. Success: `ok=true`, `message="Success"`. Error: `ok=false` + `message` (+ `path`). List payloads are `{ items, total, page, limit }`.
- **Auth:** JWT Bearer access token on EVERY request (except login/refresh). On HTTP 401, refresh via `POST /auth/refresh {refreshToken}` → new `{accessToken, refreshToken}` → retry once; if refresh fails, clear the session and route to Login. `recruiterEmployeeId` is sealed server-side — the app NEVER sends it.
- **Versions are pinned to the values above** (they match the user's other apps). If the toolchain rejects a pinned version (AGP 9.2.1 + KSP are bleeding-edge), resolve to the nearest compatible version and note it in the task report — do NOT swap the library for a different one.
- **Build/test commands** (from project root; `ANDROID_HOME=/home/plemus/Android/Sdk` is set, JDK 21 present, project targets Java 11): build = `./gradlew assembleDebug`; unit tests = `./gradlew testDebugUnitTest`. First invocation downloads Gradle via the wrapper + dependencies (slow); subsequent runs use the daemon/cache.
- **Conventions (mirror the user's RotoAppstore app):** networking lives in `data/remote`; DTOs in `data/remote/dto`; one Retrofit `*ApiService` per domain; repositories are constructor-injected plain classes; ViewModels expose `StateFlow<XxxUiState>` (a `data class`) for rendered state + a `Channel<XxxEvent>(BUFFERED).receiveAsFlow()` (a `sealed interface`) for one-shot effects (errors/navigation); `runCatching { … }.onFailure { event }` inside `viewModelScope.launch`; screens are `XxxScreen(callbacks…, viewModel: XxxViewModel = hiltViewModel())` that collect state with `collectAsStateWithLifecycle()`, consume events in `LaunchedEffect(Unit)`, and navigate ONLY via hoisted callback lambdas (never pass NavController into a screen); routes are string-based (`sealed class Route(path)` with `build()` helpers + typed `navArgument`); theme is a single light `MaterialTheme` in `ui/theme`. Spanish UI copy and comments.

## API Contract (verbatim — write DTOs from this)

- `POST /auth/login` body `{username,password}` → data `{accessToken,refreshToken}`.
- `POST /auth/refresh` body `{refreshToken}` → data `{accessToken,refreshToken}` (rotates).
- `GET /auth/me` → data `{id, username, employeeId, roles:[{id,name}], employee:{id,firstName,secondName?,lastName,surName?,phoneNumber?,email?, …}}`.
- `POST /auth/logout` (no body) → data `null`.
- `GET /candidates?name&email&status&source&page&limit` → data `{items:Candidate[],total,page,limit}`. `GET /candidates/:id` → Candidate (+`applications`). `POST /candidates` body `{firstName*,lastName*,secondName?,surName?,nationalId?,phoneNumber?,email?,birthDate?,headline?,source?,expectedSalary?,status?,notes?}`. `status ∈ {new,active,placed,on_hold,discarded}`.
- Candidate fields: `{id,firstName,secondName?,lastName,surName?,nationalId?,phoneNumber?,email?,birthDate?,headline?,source?,expectedSalary?,status,notes?,createdAt}`.
- `GET /opportunities?status&responsibleEmployeeId&clientId&sectorId&areaId&stageId&followUpDue&page&limit` → data `{items:Opportunity[],…}`. Opportunity (list relations: client, area, pipelineStage, responsibleEmployee): `{id,title?,status,headcount,seniority?,amount?,currency,responsibleEmployeeId,clientId,client:{id,name,sector?},areaId?,area:{id,name}?,pipelineStageId,pipelineStage:{id,name,sortOrder,isWon,isLost},responsibleEmployee:{id,firstName,secondName?,lastName,surName?},lastContactAt?,nextFollowUpAt?,expectedCloseDate?,createdAt,updatedAt}`. `status ∈ {open,won,lost}`.
- `GET /applications?opportunityId&candidateId&stage&page&limit` → `{items:Application[],…}`. `POST /applications` body `{candidateId*,opportunityId*,stage?,source?,notes?}` (dup (candidate,opportunity) → 409). `PATCH /applications/:id/stage` body `{stage}` (string). Application: `{id,candidateId,opportunityId,stage,source?,notes?,appliedAt,updatedAt,candidate?,opportunity?}`. `stage ∈ {applied,screening,interview,offer,hired,rejected,withdrawn}`. Legal transitions: applied→{screening,rejected,withdrawn}; screening→{interview,rejected,withdrawn}; interview→{offer,rejected,withdrawn}; offer→{hired,rejected,withdrawn}; hired/rejected/withdrawn = terminal. Illegal → 400.
- `POST /candidate-contacts` body `{candidateId*,opportunityId*,contactType*(int id),contactTime*(ISO),direction?,callLength?,contactDesc?,phoneNumberDialed?}` (NO recruiterEmployeeId). `GET /candidate-contacts?candidateId&opportunityId&recruiterId&from&to&page&limit` → `{items:CandidateContact[],…}`. CandidateContact (relations: candidate, opportunity, contactType, recruiter): `{id,candidateId,opportunityId,contactType:{id,name},contactTime,callLength?,contactDesc?,phoneNumberDialed?,direction?,recruiterEmployeeId,recruiter:{id,firstName,…},createdAt}`. `direction ∈ {inbound,outbound}`.
- `GET /contact-types?page&limit` → `{items:[{id,name}],…}`. Seeded: call,email,meeting,whatsapp.

---

## File Structure

```
~/AndroidStudioProjects/sir-mobile/
├── settings.gradle.kts, build.gradle.kts (root), gradle.properties, gradlew(+ wrapper)
├── gradle/libs.versions.toml
└── app/
    ├── build.gradle.kts, proguard-rules.pro
    └── src/
        ├── main/AndroidManifest.xml
        ├── main/java/com/xnihilfx/sirmobile/
        │   ├── SirApp.kt                         (@HiltAndroidApp)
        │   ├── MainActivity.kt                   (@AndroidEntryPoint)
        │   ├── MainViewModel.kt                  (start route from session)
        │   ├── data/
        │   │   ├── remote/
        │   │   │   ├── ApiEnvelope.kt            (ApiEnvelope<T>, Paginated<T>)
        │   │   │   ├── ApiResult.kt + ApiError.kt(error mapping)
        │   │   │   ├── AuthInterceptor.kt, TokenAuthenticator.kt
        │   │   │   ├── AuthApi.kt, CandidatesApi.kt, OpportunitiesApi.kt,
        │   │   │   │   ApplicationsApi.kt, CandidateContactsApi.kt, ContactTypesApi.kt
        │   │   │   └── dto/ (Auth*, Candidate*, Opportunity*, Application*, CandidateContact*, ContactType*)
        │   │   ├── local/ SessionStore.kt        (DataStore: token, refreshToken, employeeId, name)
        │   │   └── repository/ AuthRepository, CandidatesRepository, OpportunitiesRepository,
        │   │       ApplicationsRepository, CandidateContactsRepository, ContactTypesRepository
        │   ├── di/ NetworkModule.kt, AppModule.kt
        │   └── ui/
        │       ├── theme/ Color.kt, Theme.kt, Type.kt
        │       ├── navigation/ Routes.kt, NavGraph.kt
        │       ├── components/ (StateViews.kt: Loading/Empty/Error, fields, buttons)
        │       ├── login/ LoginScreen.kt, LoginViewModel.kt
        │       ├── opportunities/ OpportunitiesScreen.kt, OpportunitiesViewModel.kt
        │       ├── candidates/ CandidatesScreen.kt, CandidatesViewModel.kt, NewCandidateScreen.kt, NewCandidateViewModel.kt
        │       ├── candidatedetail/ CandidateDetailScreen.kt, CandidateDetailViewModel.kt
        │       ├── logcontact/ LogContactScreen.kt, LogContactViewModel.kt
        │       └── movestage/ MoveStageScreen.kt, MoveStageViewModel.kt
        └── test/java/com/xnihilfx/sirmobile/ (unit tests)
```

---

### Task 1: Project scaffold + Gradle config (build green, empty app)

**Files:** create the Gradle/project skeleton listed below. Copy the Gradle wrapper from the user's existing app so no global Gradle is needed.

- [ ] **Step 1: Copy the Gradle wrapper** from a working project:
```bash
mkdir -p ~/AndroidStudioProjects/sir-mobile
cp -r ~/AndroidStudioProjects/RotoAppstore/gradle ~/AndroidStudioProjects/sir-mobile/gradle
cp ~/AndroidStudioProjects/RotoAppstore/gradlew ~/AndroidStudioProjects/RotoAppstore/gradlew.bat ~/AndroidStudioProjects/sir-mobile/
```
Then overwrite `gradle/libs.versions.toml` (next step).

- [ ] **Step 2: `gradle/libs.versions.toml`**
```toml
[versions]
agp = "9.2.1"
kotlin = "2.2.10"
ksp = "2.2.10-2.0.2"
hilt = "2.57.1"
hiltNavigationCompose = "1.2.0"
coreKtx = "1.18.0"
lifecycle = "2.10.0"
activityCompose = "1.13.0"
composeBom = "2026.02.01"
navigationCompose = "2.8.5"
retrofit = "2.11.0"
retrofitKotlinxConverter = "1.0.0"
okhttp = "4.12.0"
kotlinxSerialization = "1.7.3"
coroutines = "1.9.0"
datastore = "1.1.1"
securityCrypto = "1.1.0-alpha06"
accompanistPermissions = "0.36.0"
coreSplashscreen = "1.0.1"
feather = "1.1.1"
junit = "4.13.2"
mockwebserver = "4.12.0"
turbine = "1.1.0"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-core-splashscreen = { group = "androidx.core", name = "core-splashscreen", version.ref = "coreSplashscreen" }
androidx-lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycle" }
androidx-lifecycle-runtime-compose = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-navigation-compose = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigationCompose" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-compiler", version.ref = "hilt" }
androidx-hilt-navigation-compose = { group = "androidx.hilt", name = "hilt-navigation-compose", version.ref = "hiltNavigationCompose" }
retrofit = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-kotlinx-serialization-converter = { group = "com.jakewharton.retrofit", name = "retrofit2-kotlinx-serialization-converter", version.ref = "retrofitKotlinxConverter" }
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-logging-interceptor = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "kotlinxSerialization" }
kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }
androidx-security-crypto = { group = "androidx.security", name = "security-crypto-ktx", version.ref = "securityCrypto" }
accompanist-permissions = { group = "com.google.accompanist", name = "accompanist-permissions", version.ref = "accompanistPermissions" }
feather-icons = { group = "br.com.devsrsouza.compose.icons", name = "feather", version.ref = "feather" }
junit = { group = "junit", name = "junit", version.ref = "junit" }
okhttp-mockwebserver = { group = "com.squareup.okhttp3", name = "mockwebserver", version.ref = "mockwebserver" }
kotlinx-coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }
turbine = { group = "app.cash.turbine", name = "turbine", version.ref = "turbine" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

- [ ] **Step 3: root `settings.gradle.kts`**
```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "SirMobile"
include(":app")
```

- [ ] **Step 4: root `build.gradle.kts`**
```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
}
```
And `gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

- [ ] **Step 5: `app/build.gradle.kts`**
```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.xnihilfx.sirmobile"
    compileSdk { version = release(36) { minorApiLevel = 1 } }

    defaultConfig {
        applicationId = "com.xnihilfx.sirmobile"
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"https://api.sir.com.gt/api\"")
    }
    buildTypes {
        debug { isMinifyEnabled = false }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_11; targetCompatibility = JavaVersion.VERSION_11 }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11) } }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization.converter)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.accompanist.permissions)
    implementation(libs.feather.icons)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
```

- [ ] **Step 6: Manifest** `app/src/main/AndroidManifest.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <application
        android:name=".SirApp"
        android:allowBackup="true"
        android:label="SIR Reclutadores"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true" android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
    <queries>
        <intent><action android:name="android.intent.action.DIAL" /></intent>
        <intent><action android:name="android.intent.action.SENDTO" /><data android:scheme="mailto" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
</manifest>
```

- [ ] **Step 7: Minimal app entrypoints + theme** so it compiles and shows a screen.
`SirApp.kt`:
```kotlin
package com.xnihilfx.sirmobile
import android.app.Application
import dagger.hilt.android.HiltAndroidApp
@HiltAndroidApp
class SirApp : Application()
```
`ui/theme/Color.kt`, `Type.kt`, `Theme.kt` — a single light theme:
```kotlin
// Color.kt
package com.xnihilfx.sirmobile.ui.theme
import androidx.compose.ui.graphics.Color
val Blue600 = Color(0xFF2563EB); val Blue700 = Color(0xFF1D4ED8)
val Slate50 = Color(0xFFF8FAFC); val Slate900 = Color(0xFF0F172A); val White = Color(0xFFFFFFFF)
```
```kotlin
// Type.kt
package com.xnihilfx.sirmobile.ui.theme
import androidx.compose.material3.Typography
val Typography = Typography()
```
```kotlin
// Theme.kt
package com.xnihilfx.sirmobile.ui.theme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
private val LightColors = lightColorScheme(primary = Blue600, onPrimary = White, background = Slate50, surface = White, onSurface = Slate900)
@Composable fun SirTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = LightColors, typography = Typography, content = content)
```
`MainActivity.kt` (placeholder content; NavGraph wired in Task 6):
```kotlin
package com.xnihilfx.sirmobile
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.Text
import com.xnihilfx.sirmobile.ui.theme.SirTheme
import dagger.hilt.android.AndroidEntryPoint
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { SirTheme { Text("SIR Reclutadores") } }
    }
}
```

- [ ] **Step 8: Build it**
Run: `cd ~/AndroidStudioProjects/sir-mobile && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`. If a pinned version is rejected by AGP 9.2.1/KSP, bump to the nearest compatible version (record it) — keep the same library set.

- [ ] **Step 9: Init git + commit**
```bash
cd ~/AndroidStudioProjects/sir-mobile
printf "*.iml\n.gradle/\n/local.properties\n/.idea/\n/build/\n/app/build/\n/captures/\n.externalNativeBuild/\n.cxx/\n*.apk\nkey.jks\n" > .gitignore
git init -q && git add -A && git commit -q -m "chore: scaffold SIR reclutadores Android app (Hilt+Compose+Retrofit, build green)"
```

---

### Task 2: Network core — envelope, Json, error mapping, Retrofit (Hilt NetworkModule)

**Files:** Create `data/remote/ApiEnvelope.kt`, `data/remote/ApiError.kt`, `di/NetworkModule.kt`. Test: `test/.../EnvelopeAndErrorTest.kt`.

**Interfaces:**
- Produces: `ApiEnvelope<T>(ok,message,data)`, `Paginated<T>(items,total,page,limit)`, `ApiException(userMessage,code)`, `Throwable.toUserMessage(json): String`, and Hilt-provided `Json`, `OkHttpClient` (logging only, no auth yet), `Retrofit`. Consumed by all `*Api` and repositories.

- [ ] **Step 1: Failing test** `test/java/com/xnihilfx/sirmobile/EnvelopeAndErrorTest.kt`
```kotlin
package com.xnihilfx.sirmobile
import com.xnihilfx.sirmobile.data.remote.ApiEnvelope
import com.xnihilfx.sirmobile.data.remote.Paginated
import com.xnihilfx.sirmobile.data.remote.parseErrorMessage
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test
class EnvelopeAndErrorTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    @Test fun unwraps_paginated_envelope() {
        val body = """{"ok":true,"message":"Success","data":{"items":[{"id":1,"name":"call"}],"total":1,"page":1,"limit":20}}"""
        val env = json.decodeFromString<ApiEnvelope<Paginated<ContactTypeProbe>>>(body)
        assertEquals(true, env.ok); assertEquals(1, env.data?.total); assertEquals("call", env.data?.items?.first()?.name)
    }
    @Test fun extracts_error_message_from_envelope() {
        val body = """{"ok":false,"message":"Transición de etapa no permitida","path":"/api/applications/1/stage"}"""
        assertEquals("Transición de etapa no permitida", parseErrorMessage(json, body))
    }
    @kotlinx.serialization.Serializable data class ContactTypeProbe(val id: Int, val name: String)
}
```

- [ ] **Step 2: Run → FAIL** `./gradlew testDebugUnitTest --tests "*EnvelopeAndErrorTest*"` (unresolved references).

- [ ] **Step 3: Implement** `data/remote/ApiEnvelope.kt`
```kotlin
package com.xnihilfx.sirmobile.data.remote
import kotlinx.serialization.Serializable
@Serializable data class ApiEnvelope<T>(val ok: Boolean = false, val message: String? = null, val data: T? = null)
@Serializable data class Paginated<T>(val items: List<T> = emptyList(), val total: Int = 0, val page: Int = 1, val limit: Int = 20)
```
`data/remote/ApiError.kt`
```kotlin
package com.xnihilfx.sirmobile.data.remote
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException
class ApiException(val userMessage: String, val code: Int? = null) : RuntimeException(userMessage)
@kotlinx.serialization.Serializable private data class ErrorBody(val ok: Boolean = false, val message: String? = null)
fun parseErrorMessage(json: Json, body: String?): String? =
    body?.takeIf { it.isNotBlank() }?.let { runCatching { json.decodeFromString<ErrorBody>(it).message }.getOrNull() }
fun Throwable.toUserMessage(json: Json): String = when (this) {
    is ApiException -> userMessage
    is HttpException -> {
        val raw = response()?.errorBody()?.string()
        parseErrorMessage(json, raw) ?: when (code()) {
            401 -> "Sesión expirada. Inicia sesión de nuevo."
            403 -> "No tienes permiso para esta acción."
            404 -> "No encontrado."
            409 -> "Registro duplicado."
            in 500..599 -> "Error del servidor. Intenta más tarde."
            else -> "Error ${code()}."
        }
    }
    is IOException -> "Sin conexión. Revisa tu internet."
    else -> message ?: "Error desconocido."
}
```

- [ ] **Step 4: Implement** `di/NetworkModule.kt` (no auth interceptor yet — added in Task 4)
```kotlin
package com.xnihilfx.sirmobile.di
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.xnihilfx.sirmobile.BuildConfig
import dagger.Module; import dagger.Provides; import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
@Module @InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun json(): Json = Json {
        ignoreUnknownKeys = true; isLenient = true; encodeDefaults = false
        explicitNulls = false; coerceInputValues = true
    }
    @Provides @Singleton fun logging(): HttpLoggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
    }
    @Provides @Singleton fun okHttp(logging: HttpLoggingInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(logging).build()
    @Provides @Singleton fun retrofit(client: OkHttpClient, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
}
```

- [ ] **Step 5: Run → PASS**, then **commit** (`feat(network): envelope, error mapping, Json + Retrofit module`).

---

### Task 3: Session storage (DataStore) — token, refreshToken, employeeId, name

**Files:** Create `data/local/SessionStore.kt`. Test: `SessionStoreTest.kt`.

**Interfaces:**
- Produces: `SessionStore` (Hilt `@Singleton`, `@Inject constructor(@ApplicationContext context)`) with: `val accessToken: String?` and `val refreshToken: String?` (synchronous in-memory cache for the OkHttp interceptor), `val employeeId: Int?`, `val displayName: String?`, `val sessionFlow: Flow<Boolean>` (logged-in or not), `suspend fun save(access:String, refresh:String, employeeId:Int, name:String)`, `suspend fun updateTokens(access:String, refresh:String)`, `suspend fun clear()`, `suspend fun load()` (call once at startup to hydrate the cache). Consumed by Task 4 (interceptor/authenticator), Task 5 (AuthRepository), Task 6 (MainViewModel).

- [ ] **Step 1: Failing test** — uses a real DataStore on a temp dir via Robolectric-free approach: instead, test the in-memory cache + persistence contract through a small fake is overkill; assert the cache logic directly. `SessionStoreTest.kt`:
```kotlin
package com.xnihilfx.sirmobile
import com.xnihilfx.sirmobile.data.local.SessionStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
class SessionStoreTest {
    @Test fun save_then_cache_exposes_tokens_and_employee() = runTest {
        val store = SessionStore.inMemory()           // test factory backing to a MutableMap
        store.save(access = "a1", refresh = "r1", employeeId = 7, name = "Ana")
        assertEquals("a1", store.accessToken); assertEquals("r1", store.refreshToken)
        assertEquals(7, store.employeeId); assertEquals("Ana", store.displayName)
        store.updateTokens("a2", "r2")
        assertEquals("a2", store.accessToken); assertEquals("r2", store.refreshToken)
        store.clear()
        assertNull(store.accessToken); assertNull(store.employeeId)
    }
}
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `data/local/SessionStore.kt` — DataStore-backed with a synchronous in-memory cache; provide an `inMemory()` test factory that skips DataStore.
```kotlin
package com.xnihilfx.sirmobile.data.local
import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import javax.inject.Inject
import javax.inject.Singleton
private val Context.dataStore by preferencesDataStore(name = "sir_session")
@Singleton
class SessionStore private constructor(private val persist: Persistence) {
    interface Persistence {
        suspend fun read(): Map<String, String>
        suspend fun write(values: Map<String, String>)
        suspend fun clearAll()
    }
    @Volatile var accessToken: String? = null; private set
    @Volatile var refreshToken: String? = null; private set
    @Volatile var employeeId: Int? = null; private set
    @Volatile var displayName: String? = null; private set
    private val _loggedIn = MutableStateFlow(false)
    val sessionFlow: Flow<Boolean> = _loggedIn.asStateFlow()
    suspend fun load() {
        val m = persist.read()
        accessToken = m[K_ACCESS]; refreshToken = m[K_REFRESH]
        employeeId = m[K_EMP]?.toIntOrNull(); displayName = m[K_NAME]
        _loggedIn.value = accessToken != null
    }
    suspend fun save(access: String, refresh: String, employeeId: Int, name: String) {
        accessToken = access; refreshToken = refresh; this.employeeId = employeeId; displayName = name
        persist.write(mapOf(K_ACCESS to access, K_REFRESH to refresh, K_EMP to employeeId.toString(), K_NAME to name))
        _loggedIn.value = true
    }
    suspend fun updateTokens(access: String, refresh: String) {
        accessToken = access; refreshToken = refresh
        persist.write(mapOf(K_ACCESS to access, K_REFRESH to refresh))
    }
    suspend fun clear() {
        accessToken = null; refreshToken = null; employeeId = null; displayName = null
        persist.clearAll(); _loggedIn.value = false
    }
    companion object {
        private const val K_ACCESS = "access"; private const val K_REFRESH = "refresh"
        private const val K_EMP = "emp"; private const val K_NAME = "name"
        fun inMemory(): SessionStore = SessionStore(object : Persistence {
            private val m = mutableMapOf<String, String>()
            override suspend fun read() = m.toMap()
            override suspend fun write(values: Map<String, String>) { m.putAll(values) }
            override suspend fun clearAll() { m.clear() }
        })
        fun create(context: Context): SessionStore {
            val ds = context.dataStore
            return SessionStore(object : Persistence {
                override suspend fun read(): Map<String, String> {
                    val p = ds.data.first()
                    return buildMap {
                        p[stringPreferencesKey(K_ACCESS)]?.let { put(K_ACCESS, it) }
                        p[stringPreferencesKey(K_REFRESH)]?.let { put(K_REFRESH, it) }
                        p[stringPreferencesKey(K_EMP)]?.let { put(K_EMP, it) }
                        p[stringPreferencesKey(K_NAME)]?.let { put(K_NAME, it) }
                    }
                }
                override suspend fun write(values: Map<String, String>) {
                    ds.edit { e -> values.forEach { (k, v) -> e[stringPreferencesKey(k)] = v } }
                }
                override suspend fun clearAll() { ds.edit { it.clear() } }
            })
        }
    }
}
```
Add to `di/AppModule.kt` (create it): `@Provides @Singleton fun sessionStore(@ApplicationContext c: Context) = SessionStore.create(c)`.
```kotlin
package com.xnihilfx.sirmobile.di
import android.content.Context
import com.xnihilfx.sirmobile.data.local.SessionStore
import dagger.Module; import dagger.Provides; import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
@Module @InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton fun sessionStore(@ApplicationContext c: Context): SessionStore = SessionStore.create(c)
}
```

- [ ] **Step 4: Run → PASS. Commit** (`feat(session): DataStore-backed SessionStore with sync cache`).

---

### Task 4: Auth interceptor + 401 refresh authenticator (CRITICAL)

**Files:** Create `data/remote/AuthInterceptor.kt`, `data/remote/TokenAuthenticator.kt`, `data/remote/AuthApi.kt` (+ its DTOs in `dto/AuthDto.kt`). Modify `di/NetworkModule.kt` to install the interceptor + authenticator. Test: `AuthFlowTest.kt` (MockWebServer).

**Interfaces:**
- Consumes: `SessionStore` (Task 3), `Json` (Task 2).
- Produces: `AuthInterceptor` (adds `Authorization: Bearer <accessToken>` when present and the request has no Authorization header), `TokenAuthenticator` (on 401: synchronously POST `/auth/refresh`, on success `session.updateTokens` + retry original with new token; on failure `session.clear()` and give up), `AuthApi` Retrofit interface. DTOs: `LoginRequest`, `RefreshRequest`, `AuthTokens`, `MeDto`, `RoleDto`, `EmployeeDto`.

- [ ] **Step 1: DTOs** `data/remote/dto/AuthDto.kt`
```kotlin
package com.xnihilfx.sirmobile.data.remote.dto
import kotlinx.serialization.Serializable
@Serializable data class LoginRequest(val username: String, val password: String)
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class AuthTokens(val accessToken: String, val refreshToken: String)
@Serializable data class RoleDto(val id: Int, val name: String)
@Serializable data class EmployeeDto(val id: Int, val firstName: String, val secondName: String? = null, val lastName: String, val surName: String? = null, val phoneNumber: String? = null, val email: String? = null)
@Serializable data class MeDto(val id: Int, val username: String, val employeeId: Int, val roles: List<RoleDto> = emptyList(), val employee: EmployeeDto? = null)
```

- [ ] **Step 2: AuthApi** `data/remote/AuthApi.kt`
```kotlin
package com.xnihilfx.sirmobile.data.remote
import com.xnihilfx.sirmobile.data.remote.dto.*
import retrofit2.http.*
interface AuthApi {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): ApiEnvelope<AuthTokens>
    @POST("auth/refresh") suspend fun refresh(@Body body: RefreshRequest): ApiEnvelope<AuthTokens>
    @GET("auth/me") suspend fun me(): ApiEnvelope<MeDto>
    @POST("auth/logout") suspend fun logout(): ApiEnvelope<Unit>
}
```

- [ ] **Step 3: Failing test** `test/.../AuthFlowTest.kt` (MockWebServer drives a real OkHttp stack with the interceptor+authenticator):
```kotlin
package com.xnihilfx.sirmobile
import com.xnihilfx.sirmobile.data.local.SessionStore
import com.xnihilfx.sirmobile.data.remote.AuthInterceptor
import com.xnihilfx.sirmobile.data.remote.TokenAuthenticator
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
class AuthFlowTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun client(session: SessionStore, baseUrl: String) = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(session))
        .authenticator(TokenAuthenticator(session, json, baseUrl))
        .build()
    @Test fun attaches_bearer_token() = runTest {
        val server = MockWebServer(); server.enqueue(MockResponse().setResponseCode(200).setBody("{}")); server.start()
        val session = SessionStore.inMemory().apply { save("ACC","REF",1,"x") }
        client(session, server.url("/").toString()).newCall(Request.Builder().url(server.url("/candidates")).build()).execute()
        val recorded = server.takeRequest()
        assertEquals("Bearer ACC", recorded.getHeader("Authorization"))
        server.shutdown()
    }
    @Test fun on_401_refreshes_then_retries_with_new_token() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"message":"unauthorized"}"""))      // first call
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"message":"Success","data":{"accessToken":"NEW","refreshToken":"NEWREF"}}""")) // refresh
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))                                              // retry
        server.start()
        val session = SessionStore.inMemory().apply { save("OLD","REF",1,"x") }
        val resp = client(session, server.url("/").toString()).newCall(Request.Builder().url(server.url("/candidates")).build()).execute()
        assertEquals(200, resp.code)
        server.takeRequest(); val refreshReq = server.takeRequest(); val retry = server.takeRequest()
        assertTrue(refreshReq.path!!.endsWith("auth/refresh"))
        assertEquals("Bearer NEW", retry.getHeader("Authorization"))
        assertEquals("NEW", session.accessToken)
        server.shutdown()
    }
    @Test fun on_refresh_failure_clears_session_and_gives_up() = runTest {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))                                    // first call
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"message":"bad refresh"}""")) // refresh fails
        server.start()
        val session = SessionStore.inMemory().apply { save("OLD","REF",1,"x") }
        val resp = client(session, server.url("/").toString()).newCall(Request.Builder().url(server.url("/candidates")).build()).execute()
        assertEquals(401, resp.code)
        assertNull(session.accessToken)
        server.shutdown()
    }
}
```

- [ ] **Step 4: Run → FAIL.**

- [ ] **Step 5: Implement** `data/remote/AuthInterceptor.kt`
```kotlin
package com.xnihilfx.sirmobile.data.remote
import com.xnihilfx.sirmobile.data.local.SessionStore
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
class AuthInterceptor @Inject constructor(private val session: SessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val token = session.accessToken
        if (token == null || req.header("Authorization") != null || req.url.encodedPath.contains("auth/")) {
            return chain.proceed(req)
        }
        return chain.proceed(req.newBuilder().header("Authorization", "Bearer $token").build())
    }
}
```
`data/remote/TokenAuthenticator.kt` — synchronous refresh using a one-shot OkHttp call (kept simple; no Retrofit re-entry):
```kotlin
package com.xnihilfx.sirmobile.data.remote
import com.xnihilfx.sirmobile.data.local.SessionStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
class TokenAuthenticator @Inject constructor(
    private val session: SessionStore,
    private val json: Json,
    private val baseUrl: String,
) : Authenticator {
    @Synchronized override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null            // already retried once
        val current = session.accessToken
        // If another thread already refreshed, just retry with the new token.
        val sentToken = response.request.header("Authorization")?.removePrefix("Bearer ")
        if (current != null && current != sentToken) {
            return response.request.newBuilder().header("Authorization", "Bearer $current").build()
        }
        val refresh = session.refreshToken ?: return null
        val newTokens = runCatching { refreshBlocking(refresh) }.getOrNull()
        if (newTokens == null) { runBlocking { session.clear() }; return null }
        runBlocking { session.updateTokens(newTokens.accessToken, newTokens.refreshToken) }
        return response.request.newBuilder().header("Authorization", "Bearer ${newTokens.accessToken}").build()
    }
    private fun refreshBlocking(refreshToken: String): com.xnihilfx.sirmobile.data.remote.dto.AuthTokens {
        val client = OkHttpClient()
        val body = """{"refreshToken":"$refreshToken"}""".toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url(baseUrl.trimEnd('/') + "/auth/refresh").post(body).build()
        client.newCall(req).execute().use { r ->
            val text = r.body?.string().orEmpty()
            require(r.isSuccessful) { "refresh failed ${r.code}" }
            val env = json.decodeFromString<ApiEnvelope<com.xnihilfx.sirmobile.data.remote.dto.AuthTokens>>(text)
            return env.data ?: error("no tokens")
        }
    }
    private fun responseCount(response: Response): Int { var r: Response? = response; var c = 1; while (r?.priorResponse != null) { c++; r = r.priorResponse }; return c }
}
```

- [ ] **Step 6: Wire into `di/NetworkModule.kt`** — replace `okHttp(...)` provider and add the AuthApi + a `@Named("baseUrl")` string:
```kotlin
import com.xnihilfx.sirmobile.data.remote.AuthInterceptor
import com.xnihilfx.sirmobile.data.remote.TokenAuthenticator
import com.xnihilfx.sirmobile.data.remote.AuthApi
import com.xnihilfx.sirmobile.data.local.SessionStore
// ...
@Provides @Singleton fun okHttp(logging: HttpLoggingInterceptor, session: SessionStore, json: Json): OkHttpClient =
    OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(AuthInterceptor(session))
        .authenticator(TokenAuthenticator(session, json, BuildConfig.API_BASE_URL))
        .addInterceptor(logging)
        .build()
@Provides @Singleton fun authApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)
```

- [ ] **Step 7: Run → PASS** (`./gradlew testDebugUnitTest --tests "*AuthFlowTest*"`). Then full `./gradlew assembleDebug`. **Commit** (`feat(auth): bearer interceptor + 401 refresh authenticator (tested)`).

---

### Task 5: AuthRepository (login → /me → persist; logout)

**Files:** Create `data/repository/AuthRepository.kt`. Test: `AuthRepositoryTest.kt` (MockWebServer + real Retrofit/AuthApi).

**Interfaces:**
- Consumes: `AuthApi`, `SessionStore`, `Json`.
- Produces: `AuthRepository` (`@Inject`): `suspend fun login(username,password)` (login → save tokens → call `/auth/me` → store employeeId + display name), `suspend fun logout()` (best-effort `authApi.logout()` then `session.clear()`), `val loggedIn: Flow<Boolean>`, `fun employeeId(): Int?`, `fun displayName(): String?`. Throws `ApiException`/HttpException on failure (mapped by callers via `toUserMessage`).

- [ ] **Step 1: Failing test** — login stores tokens + employee from `/me`:
```kotlin
// AuthRepositoryTest.kt (essentials)
@Test fun login_persists_tokens_and_employee() = runTest {
    val server = MockWebServer()
    server.enqueue(MockResponse().setBody("""{"ok":true,"message":"Success","data":{"accessToken":"A","refreshToken":"R"}}"""))
    server.enqueue(MockResponse().setBody("""{"ok":true,"message":"Success","data":{"id":3,"username":"ana","employeeId":12,"roles":[{"id":2,"name":"recruiter"}],"employee":{"id":12,"firstName":"Ana","lastName":"López"}}}"""))
    server.start()
    val session = SessionStore.inMemory()
    val api = retrofitFor(server.url("/").toString()).create(AuthApi::class.java)  // helper builds Retrofit w/ kotlinx converter
    val repo = AuthRepository(api, session)
    repo.login("ana", "pw")
    assertEquals("A", session.accessToken); assertEquals(12, session.employeeId); assertEquals("Ana López", session.displayName)
    server.shutdown()
}
```
(Provide a small `retrofitFor(baseUrl)` test helper in the test file building Retrofit with the kotlinx converter + an OkHttpClient that includes `AuthInterceptor(session)`.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `data/repository/AuthRepository.kt`
```kotlin
package com.xnihilfx.sirmobile.data.repository
import com.xnihilfx.sirmobile.data.local.SessionStore
import com.xnihilfx.sirmobile.data.remote.AuthApi
import com.xnihilfx.sirmobile.data.remote.dto.LoginRequest
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton
@Singleton
class AuthRepository @Inject constructor(private val api: AuthApi, private val session: SessionStore) {
    val loggedIn: Flow<Boolean> = session.sessionFlow
    fun employeeId(): Int? = session.employeeId
    fun displayName(): String? = session.displayName
    suspend fun login(username: String, password: String) {
        val tokens = api.login(LoginRequest(username.trim(), password)).data ?: error("Respuesta inválida")
        // Persist tokens first so the /me request is authenticated by the interceptor.
        session.save(tokens.accessToken, tokens.refreshToken, employeeId = -1, name = "")
        val me = api.me().data ?: error("Respuesta inválida")
        val emp = me.employee
        val name = listOfNotNull(emp?.firstName, emp?.lastName).joinToString(" ").ifBlank { me.username }
        session.save(tokens.accessToken, tokens.refreshToken, employeeId = me.employeeId, name = name)
    }
    suspend fun logout() { runCatching { api.logout() }; session.clear() }
}
```

- [ ] **Step 4: Run → PASS. Commit** (`feat(auth): AuthRepository login/me/logout`).

---

### Task 6: App startup + navigation skeleton + Login screen

**Files:** Create `MainViewModel.kt` (rewrite), `ui/navigation/Routes.kt`, `ui/navigation/NavGraph.kt`, `ui/login/LoginViewModel.kt`, `ui/login/LoginScreen.kt`, `ui/components/StateViews.kt`. Modify `MainActivity.kt`.

**Interfaces:**
- Consumes: `AuthRepository`, `SessionStore`.
- Produces: `Route` (Login, Opportunities, Candidates, CandidateDetail, LogContact, NewCandidate, MoveStage), `SirNavGraph(startRoute)`, working Login → Opportunities flow. `MainViewModel.startState: StateFlow<StartState>` (Loading/Ready(startRoute)).

- [ ] **Step 1: Routes** `ui/navigation/Routes.kt`
```kotlin
package com.xnihilfx.sirmobile.ui.navigation
sealed class Route(val path: String) {
    data object Login : Route("login")
    data object Opportunities : Route("opportunities")
    data object Candidates : Route("candidates?opportunityId={opportunityId}") {
        const val ARG_OPP = "opportunityId"
        fun build(opportunityId: Int) = "candidates?opportunityId=$opportunityId"
    }
    data object NewCandidate : Route("newCandidate")
    data object CandidateDetail : Route("candidate/{candidateId}?opportunityId={opportunityId}") {
        const val ARG_CAND = "candidateId"; const val ARG_OPP = "opportunityId"
        fun build(candidateId: Int, opportunityId: Int) = "candidate/$candidateId?opportunityId=$opportunityId"
    }
    data object LogContact : Route("logContact/{candidateId}/{opportunityId}") {
        const val ARG_CAND = "candidateId"; const val ARG_OPP = "opportunityId"
        fun build(candidateId: Int, opportunityId: Int) = "logContact/$candidateId/$opportunityId"
    }
    data object MoveStage : Route("moveStage/{candidateId}/{opportunityId}") {
        const val ARG_CAND = "candidateId"; const val ARG_OPP = "opportunityId"
        fun build(candidateId: Int, opportunityId: Int) = "moveStage/$candidateId/$opportunityId"
    }
}
```

- [ ] **Step 2: Reusable state views** `ui/components/StateViews.kt` — `@Composable LoadingView()`, `EmptyView(text)`, `ErrorView(message, onRetry)` (centered Box + CircularProgressIndicator / Text / Button). Keep simple.

- [ ] **Step 3: MainViewModel + MainActivity** — hydrate session, decide start route:
```kotlin
// MainViewModel.kt
@HiltViewModel
class MainViewModel @Inject constructor(private val session: SessionStore) : ViewModel() {
    sealed interface StartState { data object Loading: StartState; data class Ready(val route: String): StartState }
    private val _state = MutableStateFlow<StartState>(StartState.Loading)
    val state: StateFlow<StartState> = _state.asStateFlow()
    init { viewModelScope.launch { session.load(); _state.value = StartState.Ready(if (session.accessToken != null) Route.Opportunities.path else Route.Login.path) } }
}
```
`MainActivity` collects `state`; while Loading keep splash; on Ready render `SirTheme { SirNavGraph(startRoute = route) }`. Use `installSplashScreen()` with `setKeepOnScreenCondition { vm.state.value is Loading }`.

- [ ] **Step 4: LoginViewModel** (UiState + Event pattern)
```kotlin
data class LoginUiState(val username: String = "", val password: String = "", val loading: Boolean = false)
sealed interface LoginEvent { data object Success: LoginEvent; data class Error(val message: String): LoginEvent }
@HiltViewModel
class LoginViewModel @Inject constructor(private val auth: AuthRepository, private val json: Json): ViewModel() {
    private val _state = MutableStateFlow(LoginUiState()); val state = _state.asStateFlow()
    private val _events = Channel<LoginEvent>(Channel.BUFFERED); val events = _events.receiveAsFlow()
    fun onUsername(v: String) = _state.update { it.copy(username = v) }
    fun onPassword(v: String) = _state.update { it.copy(password = v) }
    fun submit() {
        val s = _state.value
        if (s.username.isBlank() || s.password.isBlank()) { _events.trySend(LoginEvent.Error("Ingresa usuario y contraseña")); return }
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            runCatching { auth.login(s.username, s.password) }
                .onSuccess { _state.update { it.copy(loading = false) }; _events.trySend(LoginEvent.Success) }
                .onFailure { e -> _state.update { it.copy(loading = false) }; _events.trySend(LoginEvent.Error(e.toUserMessage(json))) }
        }
    }
}
```

- [ ] **Step 5: LoginScreen** — username/password OutlinedTextFields + a submit button (loading spinner), `collectAsStateWithLifecycle`, `LaunchedEffect` collecting events (Error→Snackbar/Toast, Success→`onAuthenticated()`).

- [ ] **Step 6: NavGraph** wiring Login→Opportunities (other destinations added in later tasks as stubs now, replaced later):
```kotlin
@Composable fun SirNavGraph(startRoute: String) {
    val nav = rememberNavController()
    NavHost(nav, startDestination = startRoute) {
        composable(Route.Login.path) { LoginScreen(onAuthenticated = { nav.navigate(Route.Opportunities.path) { popUpTo(Route.Login.path){inclusive=true} } }) }
        composable(Route.Opportunities.path) { /* OpportunitiesScreen — Task 7 */ }
        // candidates/detail/logContact/newCandidate/moveStage — added in their tasks
    }
}
```

- [ ] **Step 7: Build + run smoke** `./gradlew assembleDebug`. Manually (or note for manual QA) login works against the real API. **Commit** (`feat(nav+login): startup routing + login screen`).

---

### Task 7: Puestos (Opportunities) — list of open positions

**Files:** `data/remote/dto/OpportunityDto.kt`, `data/remote/OpportunitiesApi.kt`, `data/repository/OpportunitiesRepository.kt`, `ui/opportunities/OpportunitiesViewModel.kt`, `ui/opportunities/OpportunitiesScreen.kt`. Wire route in NavGraph.

**Interfaces:**
- Produces: `OpportunityDto` (+ nested `ClientDto`, `AreaDto`, `PipelineStageDto`, reuse `EmployeeDto`), `OpportunitiesApi.list(...)`, `OpportunitiesRepository.openOpportunities(mineOnly, employeeId, query)`. `OpportunitiesScreen(onOpportunityClick: (oppId:Int)->Unit, onLogout)`.

- [ ] **Step 1: DTO** `dto/OpportunityDto.kt`
```kotlin
@Serializable data class ClientDto(val id: Int, val name: String, val sector: String? = null)
@Serializable data class AreaDto(val id: Int, val name: String)
@Serializable data class PipelineStageDto(val id: Int, val name: String, val sortOrder: Int = 0, val isWon: Boolean = false, val isLost: Boolean = false)
@Serializable data class OpportunityDto(
    val id: Int, val title: String? = null, val status: String, val headcount: Int = 1,
    val seniority: String? = null, val amount: Double? = null, val currency: String = "GTQ",
    val responsibleEmployeeId: Int, val clientId: Int, val client: ClientDto? = null,
    val areaId: Int? = null, val area: AreaDto? = null, val pipelineStageId: Int,
    val pipelineStage: PipelineStageDto? = null, val responsibleEmployee: EmployeeDto? = null,
    val lastContactAt: String? = null, val nextFollowUpAt: String? = null, val createdAt: String? = null,
)
```

- [ ] **Step 2: Api** `OpportunitiesApi.kt`
```kotlin
interface OpportunitiesApi {
    @GET("opportunities") suspend fun list(
        @Query("status") status: String? = "open",
        @Query("responsibleEmployeeId") responsibleEmployeeId: Int? = null,
        @Query("page") page: Int = 1, @Query("limit") limit: Int = 50,
    ): ApiEnvelope<Paginated<OpportunityDto>>
}
```

- [ ] **Step 3: Repository** — returns `List<OpportunityDto>`; `mineOnly` passes `responsibleEmployeeId`. Provide `@Provides` for `OpportunitiesApi` in NetworkModule.
```kotlin
@Singleton class OpportunitiesRepository @Inject constructor(private val api: OpportunitiesApi) {
    suspend fun openOpportunities(mineOnly: Boolean, employeeId: Int?): List<OpportunityDto> =
        api.list(status = "open", responsibleEmployeeId = if (mineOnly) employeeId else null, page = 1, limit = 100).data?.items.orEmpty()
}
```

- [ ] **Step 4: ViewModel** — `OpportunitiesUiState(loading, items, mineOnly, query, error?)`; supports a local text filter over `title`/`client.name` and a `mineOnly` toggle; `load()` calls repo with `auth.employeeId()`. Event: `Error(message)`.

- [ ] **Step 5: Screen** — top app bar (title "Puestos", logout action), a `mineOnly` FilterChip, a search field, a `LazyColumn` of cards (title or "Vacante #id", client name, area, pipeline stage, headcount). Loading/Empty/Error states. Card tap → `onOpportunityClick(opp.id)` → navigate to Candidates in that opportunity's context (`Route.Candidates.build(opp.id)`).

- [ ] **Step 6: Build + test** `./gradlew assembleDebug`. **Commit** (`feat(opportunities): puestos list (open, mine filter)`).

---

### Task 8: Candidates — search list + create candidate

**Files:** `dto/CandidateDto.kt`, `CandidatesApi.kt`, `CandidatesRepository.kt`, `ui/candidates/CandidatesViewModel.kt` + `CandidatesScreen.kt`, `ui/candidates/NewCandidateViewModel.kt` + `NewCandidateScreen.kt`. Wire routes.

**Interfaces:**
- Produces: `CandidateDto`, `CreateCandidateRequest`, `CandidatesApi.search/get/create`, `CandidatesRepository`. `CandidatesScreen(opportunityId:Int, onCandidateClick:(candId:Int)->Unit, onNewCandidate, onBack)`, `NewCandidateScreen(onCreated:(candId:Int)->Unit, onBack)`.

- [ ] **Step 1: DTOs** `dto/CandidateDto.kt`
```kotlin
@Serializable data class CandidateDto(
    val id: Int, val firstName: String, val secondName: String? = null, val lastName: String, val surName: String? = null,
    val nationalId: String? = null, val phoneNumber: String? = null, val email: String? = null,
    val headline: String? = null, val source: String? = null, val status: String = "new", val notes: String? = null,
    val createdAt: String? = null,
) { val fullName: String get() = listOfNotNull(firstName, secondName, lastName, surName).joinToString(" ") }
@Serializable data class CreateCandidateRequest(
    val firstName: String, val lastName: String, val phoneNumber: String? = null,
    val email: String? = null, val source: String? = null,
)
```

- [ ] **Step 2: Api** `CandidatesApi.kt`
```kotlin
interface CandidatesApi {
    @GET("candidates") suspend fun search(
        @Query("name") name: String? = null, @Query("status") status: String? = null,
        @Query("page") page: Int = 1, @Query("limit") limit: Int = 30,
    ): ApiEnvelope<Paginated<CandidateDto>>
    @GET("candidates/{id}") suspend fun get(@Path("id") id: Int): ApiEnvelope<CandidateDto>
    @POST("candidates") suspend fun create(@Body body: CreateCandidateRequest): ApiEnvelope<CandidateDto>
}
```

- [ ] **Step 3: Repository** — `search(name,status)`, `create(req)`. `@Provides` `CandidatesApi`.

- [ ] **Step 4: ViewModels** — `CandidatesViewModel`: `CandidatesUiState(loading, query, status?, items, error?)`, debounced search (re-query on query change via a `MutableStateFlow` + `debounce(300)` + `flatMapLatest`), `load()`. `NewCandidateViewModel`: form state (firstName, lastName, phone, email, source) + `submit()` (validate firstName/lastName non-blank) → `create` → `Created(id)` event.

- [ ] **Step 5: Screens** — `CandidatesScreen`: search field, status filter (optional), LazyColumn of candidate cards (fullName, phone/email, status chip), FAB "Nuevo candidato" → `onNewCandidate()`, card tap → `onCandidateClick(id)` (carry the `opportunityId` from the route). `NewCandidateScreen`: form fields + save; on success → `onCreated(id)` (navigate to its detail or back to the list).

- [ ] **Step 6: Build + test. Commit** (`feat(candidates): search list + create`).

---

### Task 9: Candidate detail + contact history

**Files:** `dto/CandidateContactDto.kt`, `CandidateContactsApi.kt`, `CandidateContactsRepository.kt` (GET part), `ui/candidatedetail/CandidateDetailViewModel.kt` + `CandidateDetailScreen.kt`. Wire route.

**Interfaces:**
- Produces: `CandidateContactDto` (+ `ContactTypeDto`), `CandidateContactsApi.list/create`, `CandidateContactsRepository`. `CandidateDetailScreen(candidateId:Int, opportunityId:Int, onLogContact:(c,o)->Unit, onMoveStage:(c,o)->Unit, onBack)`.

- [ ] **Step 1: DTOs** `dto/CandidateContactDto.kt`
```kotlin
@Serializable data class ContactTypeDto(val id: Int, val name: String)
@Serializable data class CandidateContactDto(
    val id: Int, val candidateId: Int, val opportunityId: Int, val contactType: ContactTypeDto? = null,
    val contactTime: String, val callLength: Int? = null, val contactDesc: String? = null,
    val phoneNumberDialed: String? = null, val direction: String? = null,
    val recruiterEmployeeId: Int, val recruiter: EmployeeDto? = null, val createdAt: String? = null,
)
```

- [ ] **Step 2: Api** `CandidateContactsApi.kt`
```kotlin
interface CandidateContactsApi {
    @GET("candidate-contacts") suspend fun list(
        @Query("candidateId") candidateId: Int? = null, @Query("opportunityId") opportunityId: Int? = null,
        @Query("page") page: Int = 1, @Query("limit") limit: Int = 50,
    ): ApiEnvelope<Paginated<CandidateContactDto>>
}
```
(The `create` method + its `CreateCandidateContactRequest` DTO are added in Task 10.)

- [ ] **Step 3: Repository** — `historyFor(candidateId)` (the `create` method is added in Task 10). `@Provides` `CandidateContactsApi`.

- [ ] **Step 4: ViewModel** — loads candidate (`CandidatesRepository.get`) + history (`historyFor`), `CandidateDetailUiState(loading, candidate?, contacts, error?)`. Reload on resume after logging a contact.

- [ ] **Step 5: Screen** — header (candidate name, phone, email, status), action buttons "Registrar contacto" → `onLogContact(candidateId, opportunityId)` and "Mover etapa" → `onMoveStage(...)`, then a list of contact-history rows (type name + direction + relative time + recruiter name + notes). Loading/Empty ("Sin contactos aún")/Error.

- [ ] **Step 6: Build + test. Commit** (`feat(candidate-detail): info + contact history`).

---

### Task 10: Registrar contacto (core) + intent shortcuts

**Files:** `dto/ContactTypeDto` already exists; add `CreateCandidateContactRequest` to `dto/CandidateContactDto.kt`; `ContactTypesApi.kt`, `ContactTypesRepository.kt`; `ui/logcontact/LogContactViewModel.kt` + `LogContactScreen.kt`; `util/ContactIntents.kt`. Wire route. Test: `LogContactViewModelTest.kt` (Turbine).

**Interfaces:**
- Produces: `CreateCandidateContactRequest`, `ContactTypesApi`, `ContactTypesRepository`, `ContactIntents` (dial/whatsapp/email), `LogContactScreen(candidateId, opportunityId, onSaved, onBack)`.

- [ ] **Step 1: Request DTO** (append to `dto/CandidateContactDto.kt`)
```kotlin
@Serializable data class CreateCandidateContactRequest(
    val candidateId: Int, val opportunityId: Int, val contactType: Int, val contactTime: String,
    val direction: String? = null, val callLength: Int? = null, val contactDesc: String? = null,
    val phoneNumberDialed: String? = null,
)
```

- [ ] **Step 2: ContactTypesApi + repo, and extend CandidateContactsApi/repo with `create`**
```kotlin
interface ContactTypesApi { @GET("contact-types") suspend fun list(@Query("limit") limit: Int = 50): ApiEnvelope<Paginated<ContactTypeDto>> }
@Singleton class ContactTypesRepository @Inject constructor(private val api: ContactTypesApi) {
    suspend fun all(): List<ContactTypeDto> = api.list().data?.items.orEmpty()
}
```
Add the POST method to `data/remote/CandidateContactsApi.kt` (created in Task 9):
```kotlin
    @POST("candidate-contacts") suspend fun create(@Body body: CreateCandidateContactRequest): ApiEnvelope<CandidateContactDto>
```
And add to `CandidateContactsRepository`: `suspend fun create(req: CreateCandidateContactRequest): CandidateContactDto = api.create(req).data ?: error("Respuesta inválida")`. Provide `ContactTypesApi` via `@Provides` in NetworkModule.

- [ ] **Step 3: Intents** `util/ContactIntents.kt` — `fun dial(context, phone)` (`Intent(ACTION_DIAL, "tel:$phone")` — DIAL needs no permission; use ACTION_CALL only if CALL_PHONE granted), `fun whatsapp(context, phone)` (`https://wa.me/<digits>`), `fun email(context, address)` (`mailto:`). Each `startActivity`. Strip non-digits for wa.me; prepend country code 502 if the number is 8 digits (Guatemala) — keep a small helper `normalizeGt(phone)`.

- [ ] **Step 4: Failing ViewModel test** (Turbine) — submitting builds the correct request (contactTime ISO, sealed recruiter NOT sent) and emits `Saved`; validation: a contactType must be selected.
```kotlin
@Test fun submit_posts_contact_and_emits_saved() = runTest {
    val repo = FakeContactsRepo()                 // records the request
    val vm = LogContactViewModel(repo, FakeContactTypesRepo(listOf(ContactTypeDto(1,"call"))), json, candidateId=5, opportunityId=9)
    vm.onTypeSelected(1); vm.onDirection("outbound"); vm.onNotes("Llamada inicial"); vm.submit()
    vm.events.test { assertEquals(LogContactEvent.Saved, awaitItem()) }
    assertEquals(5, repo.last!!.candidateId); assertEquals(9, repo.last!!.opportunityId); assertEquals(1, repo.last!!.contactType)
    assertNotNull(repo.last!!.contactTime)        // ISO timestamp set by the VM
}
```
(ViewModel takes candidateId/opportunityId via an `@AssistedInject` factory OR reads them from `SavedStateHandle`. Use `SavedStateHandle` — simpler with hiltViewModel + nav args.)

- [ ] **Step 5: Implement LogContactViewModel** — state: `(loading, types, selectedTypeId?, direction, notes, callLength?, phoneDialed?, saving)`. On init load `contactTypes`. `submit()`: require `selectedTypeId != null` (else Error event); build `CreateCandidateContactRequest(candidateId, opportunityId, contactType=selectedTypeId, contactTime = nowIso(), direction, callLength, contactDesc=notes, phoneNumberDialed=phoneDialed)`; `repo.create`; on success → `Saved` event; map errors via `toUserMessage`. `nowIso()` = `java.time.Instant.now().toString()`. Read `candidateId`/`opportunityId` from `SavedStateHandle`.

- [ ] **Step 6: Implement LogContactScreen** — type selector (chips from contactTypes: call/whatsapp/email/meeting), direction toggle (in/out, default outbound), notes field, optional call-length field (shown when type==call), and the **shortcut buttons** "Llamar / WhatsApp / Email" that fire `ContactIntents.*` using the candidate's phone/email (passed in or loaded) AND pre-fill the form (set selectedType to the matching type + phoneDialed). A "Guardar" button posts. On `Saved` → `onSaved()` (pop back to detail, which reloads history).

- [ ] **Step 7: Build + tests. Commit** (`feat(log-contact): core contact logging + intent shortcuts (tested)`).

---

### Task 11: Mover etapa de aplicación (stage machine)

**Files:** `dto/ApplicationDto.kt`, `ApplicationsApi.kt`, `ApplicationsRepository.kt`, `domain/ApplicationStages.kt` (transition map), `ui/movestage/MoveStageViewModel.kt` + `MoveStageScreen.kt`. Wire route. Test: `ApplicationStagesTest.kt`.

**Interfaces:**
- Produces: `ApplicationDto`, `CreateApplicationRequest`, `ChangeStageRequest`, `ApplicationsApi`, `ApplicationsRepository`, `ApplicationStages.nextLegal(stage): List<String>`. `MoveStageScreen(candidateId, opportunityId, onDone, onBack)`.

- [ ] **Step 1: DTOs + stage machine**
```kotlin
// dto/ApplicationDto.kt
@Serializable data class ApplicationDto(val id: Int, val candidateId: Int, val opportunityId: Int, val stage: String, val source: String? = null, val notes: String? = null, val appliedAt: String? = null)
@Serializable data class CreateApplicationRequest(val candidateId: Int, val opportunityId: Int, val stage: String? = null)
@Serializable data class ChangeStageRequest(val stage: String)
```
```kotlin
// domain/ApplicationStages.kt — mirrors backend APPLICATION_TRANSITIONS exactly
object ApplicationStages {
    val transitions = mapOf(
        "applied" to listOf("screening", "rejected", "withdrawn"),
        "screening" to listOf("interview", "rejected", "withdrawn"),
        "interview" to listOf("offer", "rejected", "withdrawn"),
        "offer" to listOf("hired", "rejected", "withdrawn"),
        "hired" to emptyList(), "rejected" to emptyList(), "withdrawn" to emptyList(),
    )
    fun nextLegal(stage: String): List<String> = transitions[stage].orEmpty()
    fun label(stage: String): String = when (stage) {
        "applied" -> "Postulado"; "screening" -> "Filtro"; "interview" -> "Entrevista"; "offer" -> "Oferta"
        "hired" -> "Contratado"; "rejected" -> "Rechazado"; "withdrawn" -> "Retirado"; else -> stage
    }
}
```

- [ ] **Step 2: Api + repo**
```kotlin
interface ApplicationsApi {
    @GET("applications") suspend fun list(@Query("candidateId") candidateId: Int? = null, @Query("opportunityId") opportunityId: Int? = null): ApiEnvelope<Paginated<ApplicationDto>>
    @POST("applications") suspend fun create(@Body body: CreateApplicationRequest): ApiEnvelope<ApplicationDto>
    @PATCH("applications/{id}/stage") suspend fun changeStage(@Path("id") id: Int, @Body body: ChangeStageRequest): ApiEnvelope<ApplicationDto>
}
```
`ApplicationsRepository.findFor(candidateId, opportunityId)` (first match), `create(...)`, `changeStage(id, stage)`.

- [ ] **Step 3: Test** `ApplicationStagesTest.kt` — `assertEquals(listOf("screening","rejected","withdrawn"), ApplicationStages.nextLegal("applied"))`; `assertTrue(ApplicationStages.nextLegal("hired").isEmpty())`.

- [ ] **Step 4: ViewModel** — load (or create if none) the application for (candidate, opportunity); state: `(loading, application?, legalNext, saving, error?)`. `move(stage)` → `repo.changeStage`; if no application exists, "Crear aplicación" first (`repo.create` with stage applied). Events: `Moved`, `Error`.

- [ ] **Step 5: Screen** — shows current stage label; if no application, a "Crear aplicación" button; otherwise a list of legal next stages as buttons; tapping one calls `move(stage)`. On `Moved` → `onDone()`.

- [ ] **Step 6: Build + tests. Commit** (`feat(applications): move stage with legal transitions`).

---

### Task 12: Polish — wire all routes, states, final build + full test run

**Files:** finalize `ui/navigation/NavGraph.kt` (all destinations), audit every screen for loading/empty/error states + Spanish copy; add a logout action that calls `AuthRepository.logout()` and routes to Login (`popUpTo(0)`).

- [ ] **Step 1:** Complete `SirNavGraph` with every composable destination + typed `navArgument`s (IntType for ids; the optional `opportunityId` defaults via `defaultValue`). Navigation only via hoisted callbacks.
- [ ] **Step 2:** Verify each screen renders Loading/Empty/Error (use `StateViews`); confirm no screen receives a NavController.
- [ ] **Step 3:** Full build + all unit tests:
Run: `cd ~/AndroidStudioProjects/sir-mobile && ./gradlew assembleDebug testDebugUnitTest`
Expected: `BUILD SUCCESSFUL`, all unit tests green.
- [ ] **Step 4: Commit** (`feat(app): wire all routes + polish states; MVP complete`).

---

## Self-Review

**Spec coverage (vs `2026-06-28-app-movil-reclutadores-design.md`):**
- §2 auth (login direct, token in DataStore, Bearer + 401 refresh, employeeId from /me) → Tasks 3,4,5,6. ✓
- §3 scope: login (6), puestos open + mine (7), candidates search + create (8), detail + history (9), log contact + shortcuts (10), move stage (11). ✓
- §5 architecture (data/remote+local+repository, ui, di; envelope; per-domain Api + repo) → Tasks 2–11. ✓ (Hilt/DataStore per the user's later decision; no separate domain-model layer — YAGNI, noted.)
- §6 screens/flows all mapped. ✓ Intent shortcuts → Task 10. Stage machine (legal transitions, create-if-missing) → Task 11. ✓
- §7 error handling (ApiError→ES, loading/empty/error, 401 refresh, offline message) → Task 2 (`toUserMessage`) + StateViews (6) + Task 4 + Task 12. ✓
- §8 testing: interceptor/refresh (Task 4), repos (Task 5), error/envelope (Task 2), a ViewModel via Turbine (Task 10), stage machine (Task 11). ✓ (UI tests intentionally out of MVP — noted.)

**Placeholder scan:** complete code given for backbone (Tasks 1–6) and all DTOs/APIs/repos + the critical contact-log and stage-machine logic; feature-screen Compose bodies are specified by state shape + key elements + the documented Screen/ViewModel convention rather than verbatim pixel layout (the implementer follows the established pattern). No TBD/TODO. Version-compat caveat for the bleeding-edge AGP/KSP is called out in Global Constraints with an explicit resolution rule.

**Type consistency:** `ApiEnvelope<T>`/`Paginated<T>` used uniformly; `EmployeeDto` reused across auth/opportunity/contact; `ContactTypeDto` defined in Task 9, reused in Task 10; `CreateCandidateContactRequest` + the `create` method both live in Task 10 (the cross-task forward reference was removed — Task 9's Api/repo only does `list`). `SessionStore` cache fields (`accessToken`/`refreshToken`/`employeeId`/`displayName`) consistent across Tasks 3–6. Routes' `build()` signatures match their `navArgument`s.
