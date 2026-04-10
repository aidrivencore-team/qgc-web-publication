# 11_RISK_ASSESSMENT.md — Mission Planner Risk Assessment

**Version:** 1.0  
**Date:** 2026-04-07  
**Scope:** Перекрёстный синтез рисков из документов 03-10  
**Method:** Cross-referencing all prior audit documents  

---

## 1. Risk Matrix

```
        ┌──────────────────────────────────────────────┐
        │         IMPACT                               │
        │     Low        Medium       High      Critical│
        ├──────────────────────────────────────────────┤
 L  High│ R12          R08,R09     R03,R06    R01      │
 I      │                                              │
 K  Med │              R11          R04,R07   R02      │
 E      │                                              │
 L  Low │              R10          R05                │
 I      │                                              │
 H  Min │                                              │
        └──────────────────────────────────────────────┘
```

---

## 2. Critical Risks (P0)

### R01 — Zero Test Coverage on Safety-Critical Code
- **Source:** 09_TESTING_AND_QUALITY §2.3
- **Description:** MAVLinkInterface (6898 строк), CurrentState (4891 строк), Firmware flash — **0 unit tests**. CI running with `test: off`.
- **Impact:** Любое изменение в протокольном стеке может привести к потере контроля над дроном
- **Likelihood:** High — частые коммиты без regression testing
- **Mitigation:** Включить `dotnet test` в CI, написать unit tests для packet parsing, command dispatch

### R02 — giveComport Race Condition
- **Source:** 07_COMMUNICATION_AND_PROTOCOLS §5.2, 05_ARCHITECTURE_DECISIONS §4.1
- **Description:** `volatile bool giveComport` используется как mutex для serial port access. Два потока могут одновременно пройти check и получить доступ.
- **Impact:** Corrupted serial data → unexpected drone behavior
- **Likelihood:** Medium — проявляется при concurrent operations (param download + mode change)
- **Mitigation:** Replace with `SemaphoreSlim` or `AsyncLock`

### R03 — HTTP API Without Authentication
- **Source:** 08_EXTERNAL_INTERFACES §9
- **Description:** Port 56781 — открытый HTTP/WebSocket без auth. Любой в локальной сети видит GPS, высоту, состояние дрона.
- **Impact:** Information disclosure, потенциальный reconnaissance для атаки
- **Likelihood:** High — WiFi telemetry links часто в shared networks
- **Mitigation:** Add bearer token auth, bind to localhost by default

---

## 3. High Risks (P1)

### R04 — Plugin/Script Full Trust Execution
- **Source:** 08_EXTERNAL_INTERFACES §2.2, §3.1
- **Description:** Plugins (DLL + .cs) и IronPython скрипты исполняются с полными правами процесса. Нет sandbox, нет permission model. PluginHost дает доступ ко ВСЕМУ: MAVLink, UI, файлы, сеть.
- **Impact:** Malicious plugin = полный контроль над GCS и всеми подключёнными дронами
- **Likelihood:** Medium — плагины обычно из доверенных источников, но нет verify
- **Mitigation:** AppDomain isolation (deprecated), Assembly load context, code signing

### R05 — WinForms Technology Lock-in
- **Source:** 05_ARCHITECTURE_DECISIONS §1.1, 06_MODULE_MAP §2
- **Description:** MissionPlanner.csproj target = `net472` (Windows-only). Core UI = WinForms. ExtLibs = netstandard2.0 (cross-platform), но UI привязан к Windows.
- **Impact:** Невозможность портирования на Linux/Mac/Web без полной переписки UI
- **Likelihood:** Low — не "сломается", но ограничивает развитие
- **Mitigation:** Gradual extraction: UI → thin shell, logic → shared library

### R06 — Empty Catch Blocks Masking Failures
- **Source:** 09_TESTING_AND_QUALITY §5.1
- **Description:** 352 catch-блока в 4 core файлах, ~56 из них пустые только в MainV2.cs. Ошибки подавляются без какого-либо logging.
- **Impact:** Скрытые failures → непредсказуемое состояние → потенциальная потеря данных
- **Likelihood:** High — происходит прямо сейчас при каждом run
- **Mitigation:** `grep -rn "catch {" | add log.Error(ex)` — systematic cleanup

### R07 — Synchronous I/O in Async Context
- **Source:** 10_PERFORMANCE_AND_SCALABILITY §2.2, 07_COMMUNICATION_AND_PROTOCOLS §4
- **Description:** `BaseStream.Read()` синхронный, обёрнут в `async` метод с `Task.Delay(1)` polling. 30 Sleep + 18 Delay вызовов в core файлах.
- **Impact:** Thread starvation, 15ms minimum latency, CPU spin waste
- **Likelihood:** Medium — работает "достаточно хорошо" при одном vehicle
- **Mitigation:** True async I/O с `ReadAsync()` + `CancellationToken`

---

## 4. Medium Risks (P2)

### R08 — God-Object Architecture
- **Source:** 05_ARCHITECTURE_DECISIONS §3, 06_MODULE_MAP §3
- **Description:** 4 класса > 4800 строк: MainV2 (4826), FlightData (6692), FlightPlanner (8556), MAVLinkInterface (6898). Каждый = multiple responsibilities, static singletons.
- **Impact:** Каждое изменение затрагивает несвязанные функции, невозможен рефакторинг
- **Likelihood:** High — каждый PR рискует regression
- **Mitigation:** Extract-class refactoring, dependency injection

### R09 — Static Singleton Coupling
- **Source:** 05_ARCHITECTURE_DECISIONS §2, 10_PERFORMANCE_AND_SCALABILITY §5.3
- **Description:** `MainV2.comPort`, `MainV2.instance`, `FlightData.instance`, `FlightPlanner.instance`, `Settings.Instance` — ~20 static singletons. Делают тестирование и multi-instance невозможным.
- **Impact:** Untestable code, impossible horizontal scaling
- **Likelihood:** High — architectural constraint, not a "bug"
- **Mitigation:** DI container (AltitudeAngel already uses ServiceLocator as precedent)

### R10 — Unbounded Memory Growth
- **Source:** 10_PERFORMANCE_AND_SCALABILITY §3.3
- **Description:** Route history (List<PointLatLng>), ADSB planes (ConcurrentDictionary), SRTM cache, tlog files — все растут без limits.
- **Impact:** OOM после длительной работы (24+ часов)
- **Likelihood:** Low — обычные сессии < 4 часов
- **Mitigation:** TTL для ADSB, max size для routes, log rotation

### R11 — Credentials in Plaintext
- **Source:** 08_EXTERNAL_INTERFACES §9
- **Description:** `config.xml` (Settings) хранит все настройки (включая потенциальные credentials) в XML без шифрования. `SCS0005` (weak random) и `SCS0006` (weak hashing) подавлены в .editorconfig.
- **Impact:** Credential theft при доступе к файловой системе
- **Likelihood:** Medium — зависит от deployment environment
- **Mitigation:** DPAPI для secrets (Windows), keychain (Mac)

### R12 — Deprecated Legacy Code
- **Source:** Static analysis
- **Description:** 40 `[Obsolete]` methods в MAVLinkInterface.cs. IronPython 3.4.1 на net462. Commented-out code blocks по всему проекту.
- **Impact:** Maintenance burden, confusion при разработке
- **Likelihood:** High — code rot is continuous
- **Mitigation:** Remove dead code, replace deprecated methods

---

## 5. Framework & Dependency Risks

| Dependency | Version | Status | Risk |
|-----------|---------|--------|------|
| **.NET Framework** | 4.7.2 | Maintenance mode (no new features) | 🟡 — works but no innovation path |
| **WinForms** | .NET 4.7.2 | Legacy, ported to .NET 6+ | 🟡 — Windows-only |
| **IronPython** | 3.4.1 | Active but niche | 🟢 — low risk |
| **log4net** | 2.x | Stable, minimal updates | 🟢 — stable |
| **GMap.NET** | fork | Custom fork, no upstream | 🟡 — maintenance burden |
| **SharpKml** | bundled | Vendored copy | 🟡 — manual update |
| **netDxf** | bundled | Vendored copy | 🟡 — manual update |
| **DirectShowLib** | bundled | Windows-only, no updates | 🔴 — deprecated tech |
| **Mono compatibility** | runtime check | Fragile `Program.MONO` flag | 🟡 — silent failures |

---

## 6. Operational Risks

| Risk | Description | Impact | Mitigation |
|------|-----------|--------|-----------|
| **No staging environment** | Direct push → production | Users get untested builds | Add beta channel testing |
| **Single maintainer** | Michael Oborne = primary author | Bus factor = 1 | Documentation, contributor onboarding |
| **No automated rollback** | No versioned deployments | Bad build = manual install | Auto-update with rollback |
| **Telemetry log disk fill** | .tlog files grown unbounded | Disk full → GCS crash | Log rotation, size limits |
| **Network dependency** | Firmware, SRTM, maps = online | No-internet = degraded mode | Explicit offline mode |

---

## 7. Risk Prioritization Matrix

| Priority | Risk | Action | Effort | Safety Impact |
|----------|------|--------|--------|---------------|
| 🔴 **P0** | R01 — Zero tests | Enable CI tests + add protocol unit tests | Medium | **Critical** — drone safety |
| 🔴 **P0** | R02 — giveComport race | Replace with SemaphoreSlim | Low | **Critical** — data corruption |
| 🔴 **P0** | R03 — HTTP no auth | Bearer token + localhost-only default | Low | **High** — security |
| 🟡 **P1** | R06 — Empty catches | Add log.Error(ex) to all catch blocks | Medium | **High** — visibility |
| 🟡 **P1** | R04 — Plugin trust | Code signing for plugins | Medium | **High** — security |
| 🟡 **P1** | R07 — Sync I/O | Async I/O rewrite | High | **Medium** — reliability |
| 🟢 **P2** | R08 — God objects | Extract-class refactoring | Very High | **Medium** — maintainability |
| 🟢 **P2** | R09 — Singletons | DI container | Very High | **Medium** — testability |
| 🟢 **P2** | R10 — Memory growth | TTL + size limits | Low | **Low** — stability |
| 🟢 **P2** | R11 — Plaintext creds | DPAPI encryption | Low | **Medium** — security |
| 🟢 **P2** | R12 — Dead code | Remove deprecated methods | Low | **Low** — hygiene |

---

*Следующий шаг: 12_MODERNIZATION_ROADMAP.md*
