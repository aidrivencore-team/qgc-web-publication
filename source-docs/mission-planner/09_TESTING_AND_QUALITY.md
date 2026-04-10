# 09_TESTING_AND_QUALITY.md — Mission Planner Testing & Quality

**Version:** 1.1 (self-reviewed)  
**Date:** 2026-04-07  
**Scope:** Тестовая инфраструктура, CI/CD, code quality, logging, error handling  
**Method:** Static code analysis of test files, CI configs, and code patterns  

---

## 1. Тестовая инфраструктура — обзор

### Вердикт: Практически отсутствует

```
┌──────────────────────────────────────────────────────┐
│  ТЕСТОВАЯ ПИРАМИДА Mission Planner                  │
│                                                      │
│  Unit tests:        ~13 test methods (MSTest)        │
│  Integration tests: ~7 (network-dependent)           │
│  E2E/UI tests:      0                                │
│  Property tests:    0                                │
│  Benchmarks:        0                                │
│  Fuzzing:           0                                │
│                                                      │
│  Расчётное покрытие: < 0.1%                         │
│  CI запуск тестов:   ОТКЛЮЧЁН (test: off)            │
└──────────────────────────────────────────────────────┘
```

---

## 2. Существующие тесты

### 2.1 Проект MissionPlannerTests

**Файл:** `MissionPlannerTests/MissionPlannerTests.csproj`  
**Framework:** MSTest (`MSTest.TestFramework 2.2.10`)  
**Target:** `net472`

| Файл | Тестов | Тип | Что тестирует |
|------|--------|-----|--------------|
| `BoardDetectTests.cs` | 11 | Unit | USB VID/PID → board type mapping |
| `FirmwareTests.cs` | 1 | Integration | HTTP download firmware list |
| `FlightPlannerTests.cs` | 1 | Integration | WMS HTTP request |
| `DownloadTests.cs` | 3 | Integration | HTTP download + file size check |
| `GitHubContentTests.cs` | 2 | Integration | GitHub API: dir/file content |
| `httpclient.cs` (DroneCANTests) | 2 | Integration | DroneCAN firmware update lookup |

**Всего: 20 test methods** в 6 файлах на ~200,000 строк кода.

### 2.2 Качество тестов

**BoardDetectTests** (265 строк, 11 тестов) — единственные "настоящие" unit tests:
- Тестируют чистую функцию `BoardDetect.DetectBoard()`
- Не требуют сети, UI, или hardware
- Покрывают ~11 USB VID/PID комбинаций

**Остальные 5 файлов** — integration tests, зависящие от:
- Интернет-соединения (`google.com`, `firmware.ardupilot.org`, `github.com`, `mesonet.agron.iastate.edu`)
- Внешних API (GitHub REST, WMS servers, DroneCAN firmware server)
- Нет mock/stub — fail при отсутствии internet

### 2.3 Что НЕ тестируется (критические модули)

| Модуль | Строк | Тестов | Риск |
|--------|-------|--------|------|
| `MAVLinkInterface` | 6898 | 0 | 🔴 Протокольный движок — zero coverage |
| `CurrentState` | 4891 | 0 | 🔴 500+ свойств без validation |
| `FlightData` | 6692 | 0 | 🔴 UI + telemetry loop |
| `FlightPlanner` | 8556 | 1 (WMS only) | 🔴 Mission management logic |
| `MainV2` | 4826 | 0 | 🔴 App lifecycle + connect |
| `Settings` | 561 | 0 | 🔴 Config persistence |
| `Plugin/PluginLoader` | 341 | 0 | 🟡 Plugin loading |
| `srtm` | 761 | 0 | 🟡 Elevation data |
| `Firmware` | 1568 | 1 (HTTP only) | 🟡 Firmware flash logic |

---

## 3. CI/CD

### 3.1 Pipelines

| Platform | Файл | Status | Тесты? |
|----------|------|--------|--------|
| **GitHub Actions** | `.github/workflows/main.yml` | ✅ Активен | ❌ Нет |
| **Azure Pipelines** | `azure-pipelines.yml` | ✅ Настроен | ❌ Нет |
| **AppVeyor** | `appveyor.yml` | ✅ Настроен | ❌ `test: off` |

### 3.2 GitHub Actions `main.yml` — основной CI

```yaml
on: [push, workflow_dispatch, pull_request]
jobs:
  build:
    runs-on: windows-latest
    steps:
      - checkout (submodules, depth 10)
      - msbuild -restore -t:Build -p:Configuration=Release
      - archive → MissionPlannerBeta.zip
      - publish artifact
      # НЕТ шага test/dotnet test
  buildDebug:
    runs-on: windows-latest
    steps:
      - checkout + msbuild Debug
      # НЕТ шагов test
```

**Ключевое наблюдение:** CI **только собирает** проект. Тесты не запускаются ни в одном pipeline.

### 3.3 AppVeyor — `test: off`

```yaml
test: off            # ← тесты явно отключены
deploy: off          # деплой тоже отключён
```

### 3.4 Дополнительные workflows

| Файл | Назначение | Тесты? |
|------|----------|--------|
| `.github/workflows/android.yml` | Xamarin.Android → AAB/APK, Google Play deploy (internal track) | ❌ |
| `.github/workflows/mac.yml` | Xamarin.MacOS + Xamarin.iOS, DMG package, GitHub Release | ❌ |

### 3.5 Release process

```
Developer → push/PR to master
  ├── main.yml: Windows build → MissionPlannerBeta.zip artifact
  │              tag 'beta' → automatic GitHub Release (prerelease)
  ├── android.yml: Xamarin.Android → AAB → Google Play (internal track)
  │                tag 'beta' → APK GitHub Release  
  └── mac.yml: Xamarin.MacOS/iOS → DMG → GitHub Release
```

Нет staging, нет automated testing gate, нет canary deployment.

---

## 4. Code Quality

### 4.1 .editorconfig

Файл `.editorconfig` (69 строк) — единственный инструмент code quality:

| Правило | Severity | Комментарий |
|---------|----------|------------|
| `CA1031` — catch general exceptions | `suggestion` | Не enforced, проблема массовая |
| `CA1707` — underscores in identifiers | `suggestion` | Не enforced |
| `CA1051` — visible instance fields | **`silent`** | Подавлено |
| `CA1815` — override equals on value types | **`silent`** | Подавлено |
| `CS0612` — obsolete usage | **`silent`** | Подавлено |
| `SCS0006` — weak hashing | **`silent`** | Security issue подавлено |
| `SCS0005` — weak random | **`silent`** | Security issue подавлено |
| `AsyncVoidAnalyzer` | **`error`** | ✅ Единственное строгое правило |
| `AsyncFixer03` | **`error`** | ✅ Fire-and-forget async void |

**Паттерн:** Все critical warnings **подавлены до `silent`**, кроме async-void. Это маскирует проблемы, а не решает их.

### 4.2 StyleCop

Только в `ExtLibs/SharpAdbClient/stylecop.json` — внешняя зависимость, не в основном коде.

---

## 5. Error Handling

### 5.1 Catch-swallow pattern (массовая проблема)

**Статистика по 4 крупнейшим файлам:**

| Файл | `catch` блоков | Строк кода | Catch density |
|------|---------------|-----------|---------------|
| `MainV2.cs` | 107 | 4826 | 1 catch / 45 строк |
| `FlightPlanner.cs` | 125 | 8556 | 1 catch / 68 строк |
| `FlightData.cs` | 79 | 6692 | 1 catch / 85 строк |
| `MAVLinkInterface.cs` | 41 | 6898 | 1 catch / 168 строк |
| **Итого** | **352** | **26,972** | **1 catch / 77 строк** |

Типичный pattern:
```csharp
try {
    // critical operation
} catch {
    // empty — error silently swallowed
}
```

### 5.2 Logging

**Framework:** `log4net` (Apache log4net)

| Файл | `log.*` вызовов | Покрытие |
|------|----------------|---------|
| `MAVLinkInterface.cs` | 143 | Хорошее — ключевые protocol events |
| `MainV2.cs` | 115 | Среднее — lifecycle events |
| `FlightData.cs` | 42 | Низкое — UI-heavy, мало logging |

**Типичный паттерн:**
```csharp
private static readonly ILog log = 
    LogManager.GetLogger(MethodBase.GetCurrentMethod().DeclaringType);
```

Каждый крупный файл имеет свой `ILog`, но catch-swallow блоки часто **не логируют** ошибку.

### 5.3 Global exception handler

**Файл:** `Program.cs`
```csharp
Application.ThreadException += Application_ThreadException;
AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;
```

Глобальный handler ловит unhandled exceptions и показывает MessageBox. Но individual catch-swallow блоки маскируют ошибки до того, как они доходят до global handler.

---

## 6. Code Quality Metrics (по результатам анализа)

### 6.1 Testability blockers

| Проблема | Impact на тестирование |
|---------|----------------------|
| **Static globals** (`MainV2.comPort`, `Settings.Instance`) | Невозможно mock без фреймворков (Shims) |
| **WinForms coupling** | UI controls в бизнес-логике — тесты требуют STAThread |
| **No interfaces** (кроме `ICommsSerial`) | Dependency injection невозможно |
| **God-objects** | Single class = multiple responsibilities, untestable |
| **Hardcoded URLs** | Integration tests ≠ unit tests |
| **Static singletons** | `FlightData.instance`, `FlightPlanner.instance` — global state |

### 6.2 Code smells summary

| Smell | Количество | Пример |
|-------|-----------|--------|
| **God class** | 4 | MainV2, FlightData, FlightPlanner, MAVLinkInterface |
| **Empty catch** | ~100+ | По всему коду |
| **Magic numbers** | десятки | ARM=2989.0f, port=56781, timeout=1200ms |
| **String-based config** | 100+ | `Settings["key"]` без type safety |
| **Static coupling** | ~20 singletons | `MainV2.comPort`, `X.instance` pattern |
| **Dead/commented code** | обширно | Commented-out blocks в FlightPlanner, MAVLinkInterface |
| **TODO/FIXME markers** | 1 | Практически не используется |

### 6.3 Positive patterns

| Pattern | Где | Комментарий |
|---------|-----|------------|
| **AsyncVoid enforced** | `.editorconfig` | Единственное строгое правило — предотвращает async void fire-and-forget |
| **log4net everywhere** | Core files | Logging framework есть, хоть и не всегда используется |
| **ICommsSerial abstraction** | `ExtLibs/Interfaces` | Единственная значимая абстракция — транспорт можно mock |
| **MSTest project exists** | `MissionPlannerTests` | Инфраструктура есть, нужен контент |

---

## 7. Рекомендации по приоритету

| Приоритет | Действие | Effort | Impact |
|-----------|---------|--------|--------|
| 🔴 P0 | Включить `dotnet test` в CI pipeline | Low | High — gate on test failures |
| 🔴 P0 | Unit tests для `BoardDetect` pattern → extend to parsers | Low | Medium |
| 🟡 P1 | Extract interfaces from god-objects для testability | High | High |
| 🟡 P1 | Replace empty catches с `log.Error(ex)` | Medium | Medium — visibility |
| 🟡 P1 | Mock-based tests для `MAVLinkInterface` protocol logic | High | High — critical path |
| 🟢 P2 | Enforce CA1031 (no general catch) → error | Low | Medium |
| 🟢 P2 | Integration test suite с network mocks | Medium | Medium |
| 🟢 P2 | Change `SCS0005`/`SCS0006` severity → warning | Low | Low — security hygiene |

---

*Следующий шаг: 10_PERFORMANCE_AND_SCALABILITY.md*
