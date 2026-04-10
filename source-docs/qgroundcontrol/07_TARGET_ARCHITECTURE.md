# Target Architecture: Maritime Ground Control Station

> **Документ:** Target Architecture — Maritime GCS
> **Дата:** 2026-04-05
> **Базис:** Gap Analysis (06_GAP_ANALYSIS_FINAL.md), codebase audit corpus (01–15), исходный код QGC 4.x (Qt6/C++20), ArduPilot Rover/Boat firmware plugin
> **Область:** Профессиональная GCS для автономных надводных аппаратов (ASV), 1–5 судов, field operator

---

## 1. Executive Summary

Целевая архитектура профессиональной Ground Control Station для maritime ASV-операций строится на следующих ограничениях, принятых как проектные аксиомы:

1. **Связь нестабильна.** 915MHz радиомодем: 10–50 кбит/с, потери пакетов — норма. Система обязана управлять аппаратом без интернета.
2. **Отказ GCS ≠ остановка миссии.** Аппарат продолжает выполнять задачу по внутреннему failsafe до восстановления связи.
3. **Оператор имеет верховный приоритет.** Никакая логика автономии не может переопределить явную команду оператора.
4. **Масштаб: 1–5 судов.** Избыточная инфраструктура — враг надёжности при данном масштабе.
5. **Стадия:** Масштабирование от MVP до профессиональной платформы. Архитектура не требует 18 месяцев до первого работающего продукта.

**Рекомендуемый путь:** Форк QGC → API extraction (Phase 1, 3–5 месяцев) → декаплинг UI (Phase 2) → чистая архитектура при подтверждённом масштабировании (Phase 3+). Детали — в §§5, 11, 12.

---

## 2. Architectural Principles

Принципы упорядочены по приоритету. Ни один нижестоящий принцип не может нарушить вышестоящий.

### P1 — Safety First: Operator Authority Is Absolute

Оператор всегда имеет право прервать любую автономную операцию. Команды `HOLD`, `EMERGENCY_STOP`, `RTL` проходят по кратчайшему пути к MAVLink engine, минуя любую бизнес-логику, валидацию миссии и сетевые абстракции.

**Следствие:** Critical command path и non-critical data path — физически разные code paths. Смешение не допускается.

### P2 — Offline Resilience: Local Control Is Non-Negotiable

Вся управляющая логика (ARM, mode change, guided commands, emergency stop, mission upload/abort) работает без сети. Backend, если он существует, — это enhancement, не dependency для управления.

**Следствие:** Vehicle state machine, MAVLink engine, failsafe logic — всегда локальные компоненты.

### P3 — Graceful Degradation Over Binary Failure

При деградации (потеря связи с backend, потеря UI процесса, потеря GPS) система переходит в предсказуемое состояние, а не падает. Каждый уровень деградации явно определён и задокументирован (§9).

### P4 — Predictability Over Cleverness

Детерминированное поведение важнее умного. Failsafe реакция на потерю связи — всегда: SmartRTL → RTL, в заданном порядке, без «умного» анализа ситуации в runtime. Оператор должен знать заранее, что произойдёт.

**Следствие:** Autonomy layer является advisory, не executive. Финальное решение — всегда autopilot firmware или оператор.

### P5 — Separation of Critical and Non-Critical Paths

Real-time control path (telemetry receive, command send, failsafe) и non-critical path (logging, analytics, UI updates, mission sync) — разные потоки, разные буферы, разные приоритеты. Перегрузка некритического пути не влияет на критический.

### P6 — Zero-Trust on Interfaces

Любой внешний интерфейс (REST API, WebSocket, AIS feed, plugin) предполагает недоверенный источник. Команды, пришедшие через API, проходят те же проверки (operator authority, vehicle state, mode constraints), что и команды из локального UI.

**Следствие:** Авторизация и валидация команд — в Control Layer, не в API Layer.

### P7 — Observability and Auditability

Каждое действие оператора с временной меткой записывается в audit log. Это операционная необходимость для коммерческой эксплуатации на воде: страховые требования, расследование инцидентов, обучение персонала.

### P8 — Maritime-First, Not Generic UAV

Архитектура проектируется для надводных аппаратов: нет высоты — есть глубина; нет takeoff/land — есть dock; нет RC-пульта как primary — есть GCS как primary; нет авиационного регулирования — есть COLREGS и портовые нормы.

### P9 — Modular Platform, Not Plugin Marketplace

Модульность означает clean internal boundaries, а не runtime plugin loading. Компонентная структура позволяет команде независимо работать над слоями. Публичный plugin API — только при появлении внешних потребителей.

### P10 — Deployment Flexibility

Система работает в трёх конфигурациях без изменения бизнес-логики:
- **Single machine** (edge laptop): все компоненты на одном устройстве
- **Split** (edge laptop + remote monitoring server): backend на отдельном сервере
- **Cloud** (full cloud backend): при SaaS бизнес-модели

Переход между конфигурациями управляется через конфигурационные параметры (env vars / config file), а не через изменение кода.

> Переход на Split или Cloud потребует конфигурации network endpoints, TLS-сертификатов и auth-токенов. Бизнес-логика (failsafe, mission, parameter store, audit) остаётся неизменной.

---

## 3. Recommended Architecture Style

### Выбранный стиль: Layered Modular Monolith с API Boundary

**Определение:** Единый deployable (Phase 1) с модульной внутренней структурой (clean module boundaries, dependency inversion) и явным API layer между UI и backend. Начиная с Phase 2 — UI выносится в отдельный OS-процесс.

**Почему не Microservices:**
- При 2–5 разработчиках microservices = N deployment pipelines + N monitoring targets + N failure points
- Distributed state для 1–5 судов не даёт преимуществ, только latency и complexity
- Стоимость: distributed tracing, service mesh, contract testing — неоправданный overhead на данном масштабе

**Почему не Cloud-Native с первого дня:**
- Maritime channel (915MHz, 10–50 кбит/с) не позволяет cloud roundtrip для control commands
- Cloud dependency делает control loop зависимым от интернета — нарушает P2
- Time-to-market 16–24+ мес. неприемлем при необходимости валидации продукта

**Почему не чистый QGC-монолит навсегда:**
- Нет возможности подключить внешние системы (AIS, fleet management, remote monitoring)
- UI и backend неразделимы — невозможно заменить UI или добавить web dashboard
- Нет auth/audit — неприемлемо для коммерческой эксплуатации

**Компромиссы этого стиля:**
- Phase 1: Qt vendor lock-in сохраняется (QML UI, C++ backend) — цена скорости вывода на рынок
- Phase 1: API quality ограничена `Qt6::HttpServer + QWebSocketServer` — не production-grade web framework (caveat — см. ниже)
- Phase 2+: При росте продукта потребуется переход на чистый backend runtime (Rust/Go)

> **Qt HttpServer caveat:** `Qt6::HttpServer` — embedded HTTP модуль без production-grade features: нет middleware pipeline, нет type-safe routing, нет OpenAPI schema generation, нет rate limiting. Routing и JSON serialization — ручной код. При ~10–15 endpoints (Phase 1) это управляемо. При ~50+ endpoints (Phase 2) потребуется миграция на полноценный HTTP framework (cpp-httplib, uWebSockets или смена runtime). Этот переход требует явного планирования.

### Обоснование выбора QGC Fork

QGC Fork + API extraction принят потому, что:
- MAVLink engine, FactSystem, MissionManager, FirmwarePlugin — проверенный код, работающий в production-флотах. Баг-риск в critical path ниже, чем у любой greenfield реализации
- TTM: 3–5 мес. до working maritime GCS vs 10–14 мес. при greenfield
- Qt license risk управляется: переход на Rust/Go backend планируется в Phase 3 при подтверждённом масштабировании

Стратегический вектор — эволюция к Edge Desktop (новый Rust/Go backend) при выполнении трёх условий:
1. Product-market fit подтверждён реальными операциями
2. Qt license cost становится блокером при масштабировании
3. Команда выросла и может поддерживать два runtime

---

## 4. Architecture Levels

### Level 1: MVP Architecture (Phase 1, 3–5 месяцев)

**Цель:** Работающая maritime GCS, заменяющая QGC для single boat operation, с API layer для последующего декаплинга UI.

```
┌─────────────────────────────────────────────────────────────────┐
│                   Operator Machine (Laptop/Desktop)              │
│                                                                   │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐ │
│  │  Maritime UI             │   │  Backend Process (QGC Fork)  │ │
│  │  (QML — boat-customized) │   │                              │ │
│  │                          │◄─►│  ┌────────────────────────┐  │ │
│  │  ┌─────────────────────┐ │API│  │ MAVLink Engine          │  │ │
│  │  │ FlyView (boat UI)   │ │WS │  │ (existing, proven)      │  │ │
│  │  │ PlanView            │ │   │  ├────────────────────────┤  │ │
│  │  │ SetupView           │ │   │  │ Vehicle State / Facts  │  │ │
│  │  │ AnalyzeView         │ │   │  ├────────────────────────┤  │ │
│  │  └─────────────────────┘ │   │  │ Mission Manager        │  │ │
│  └──────────────────────────┘   │  ├────────────────────────┤  │ │
│                                  │  │ REST+WS API Layer      │  │ │
│                                  │  │ (Qt HttpServer)        │  │ │
│                                  │  ├────────────────────────┤  │ │
│                                  │  │ SQLite Store           │  │ │
│                                  │  │ (params, maps,         │  │ │
│                                  │  │  missions, audit)      │  │ │
│                                  │  └────────────┬───────────┘  │ │
│                                  └───────────────┼──────────────┘ │
│                                                  │ Serial/UDP/TCP  │
└──────────────────────────────────────────────────┼────────────────┘
                                                   │ Radio/USB
                                              ┌────▼────┐
                                              │   ASV   │
                                              └─────────┘
```

**MVP Scope:**
- Boat-customized QML UI (скрыть aerial-only controls)
- REST/WS API layer поверх QGC C++ backend
- Advisory operator lock (UUID-based, один активный controlling operator)
- Operator ID + SQLite action log
- Boat-safe failsafe defaults из коробки
- CSV telemetry enabled by default с задокументированной schema
- Maritime pre-launch checklist

**MVP Non-scope:** AIS overlay, multi-vehicle, remote monitoring, video streaming, web UI, cloud sync

---

### Level 2: Production Architecture (Phase 2, 4–6 месяцев после Phase 1)

**Цель:** Отдельный UI процесс, multi-vehicle support (2–5 судов), maritime extensions, optional remote monitoring.

```
┌────────────────────────────────────────────────────────────────────┐
│                    Operator Machine                                 │
│                                                                     │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐ │
│  │  Web UI / Tauri App  │     │  Maritime Backend (C++ or Rust/Go│ │
│  │                      │     │  — separate OS process)          │ │
│  │  ┌─────────────────┐ │     │                                  │ │
│  │  │ FlyView         │ │     │  ┌──────────────────────────┐   │ │
│  │  │ PlanView        │◄├─WS─►│  │ Vehicle State Manager    │   │ │
│  │  │ SetupView       │ │REST │  │ (1–5 vehicles, in-memory)│   │ │
│  │  │ AnalyzeView     │ │     │  ├──────────────────────────┤   │ │
│  │  │ Maritime Ext.   │ │     │  │ MAVLink Engine           │   │ │
│  │  │ (AIS, Depth,    │ │     │  │ + FirmwareAdapter        │   │ │
│  │  │  MOB, Checklist)│ │     │  │ (ArduPilot Boat)         │   │ │
│  │  └─────────────────┘ │     │  ├──────────────────────────┤   │ │
│  └──────────────────────┘     │  │ Mission Manager           │   │ │
│                                │  ├──────────────────────────┤   │ │
│  ┌──────────────────────┐     │  │ Maritime Services         │   │ │
│  │ Optional: Remote     │     │  │ (AIS parser, Depth,       │   │ │
│  │ Monitoring Dashboard │◄────┤  │  Drift detect, MOB alert) │   │ │
│  │ (read-only web)      │     │  ├──────────────────────────┤   │ │
│  └──────────────────────┘     │  │ Auth / Audit Service      │   │ │
│                                │  ├──────────────────────────┤   │ │
│                                │  │ SQLite + Parquet export   │   │ │
│                                │  └────────────┬─────────────┘   │ │
│                                └───────────────┼─────────────────┘ │
│                                                │ Serial/UDP (1–5)  │
└────────────────────────────────────────────────┼───────────────────┘
                                                 │ Radio
                                          ┌──────▼──────┐
                                          │  ASV 1..5   │
                                          └─────────────┘
```

**Production additions:**
- Отдельный UI процесс (web/Tauri), подключённый через WS/REST
- Multi-vehicle support (2–5 судов, vehicle selector, exclusive control lock per vehicle)
- AIS overlay, depth monitoring, drift detection, MOB alert
- Nautical charts (OpenSeaMap tiles / S-57 support)
- Video: GStreamer → RTSP → WebRTC endpoint для web UI
- Telemetry: structured SQLite recording + Parquet export
- RBAC: operator / observer / admin
- Optional remote monitoring (read-only REST → web dashboard)
- Survey patterns: grid survey для гидрографических съёмок

---

### Level 3: Future Evolution Architecture (Phase 3+, по необходимости)

**Цель:** Переход к distributed architecture без переписки бизнес-логики — при масштабировании до fleet management или SaaS (более 10 судов).

```
┌──────────────────┐    ┌──────────────────────────────────────────┐
│  Field Edge Node │    │  Cloud / On-Premise Backend               │
│  (Laptop)        │    │                                           │
│                  │    │  ┌─────────────┐  ┌───────────────────┐  │
│  ┌─────────────┐ │    │  │ Fleet API   │  │ Mission Store     │  │
│  │ MAVLink     │◄├────┤  │ (REST/WS)   │  │ (multi-tenant)    │  │
│  │ Engine      │ │VPN/│  ├─────────────┤  ├───────────────────┤  │
│  │ (Rust/Go)   │ │LTE │  │ Auth (RBAC) │  │ Telemetry Store   │  │
│  ├─────────────┤ │    │  ├─────────────┤  │ (TimescaleDB)     │  │
│  │ Local State │ │    │  │ Vehicle     │  ├───────────────────┤  │
│  │ (offline    │ │    │  │ Proxy State │  │ Analytics         │  │
│  │  capable)   │ │    │  └─────────────┘  └───────────────────┘  │
│  └─────────────┘ │    └──────────────────────────────────────────┘
└──────────────────┘                   ▲
         │ Radio/USB                   │ Web Browser
    ┌────▼────┐              ┌─────────┴──────────┐
    │  ASV    │              │  Web Dashboard      │
    └─────────┘              │  (Fleet monitoring) │
                             └────────────────────┘
```

**Условия перехода на Level 3:**
- >10 одновременных судов
- Multi-tenant (несколько независимых операторов/клиентов)
- Регуляторные требования к cloud-based audit trail
- SaaS бизнес-модель

---

## 5. System Layers

### Layer 1 — Operator Interaction Layer

**Назначение:** Единственная точка взаимодействия человека с системой. Отображение состояния, ввод команд, навигация по функциям.

**Внутри:**
- FlyView: карта, telemetry widgets, guided action bar, status indicators
- PlanView: mission editor, waypoint management, geofence editor
- SetupView: sensor calibration, failsafe configuration, parameter editor
- AnalyzeView: log review, telemetry replay, diagnostics
- Maritime extensions: AIS overlay, depth gauge, MOB button, drift alert

**Что НЕ должно попадать в этот слой:**
- MAVLink parsing / encoding
- State machine logic (connection, mission execution)
- Failsafe decision making
- Auditability logic

**Ключевые интерфейсы:**
- `GET /vehicles` — список подключённых аппаратов
- `GET /vehicles/{id}/state` — текущее состояние (position, mode, battery, armed)
- `WS /telemetry/{id}` — stream телеметрии (10–20 Hz для UI)
- `POST /vehicles/{id}/commands/{cmd}` — guided commands (GoTo, ChangeMode, RTL, Stop)

---

### Layer 2 — Mission-Critical Control Layer

**Назначение:** Обработка всех команд управления аппаратом с гарантией доставки и подтверждения. Главный safety boundary системы.

**Внутри:**
- Command dispatcher (validation → encoding → send → await ACK)
- Operator authority enforcer (проверка соответствия команды текущему состоянию и режиму)
- Emergency stop path (прямой MAVLink COMMAND_LONG, минует очередь)
- Mode change logic (включая boat-specific mode constraints)
- Arm/Disarm logic (pre-arm check evaluation)

**Что НЕ должно попадать в этот слой:**
- UI rendering logic
- Telemetry aggregation / analytics
- Mission planning
- Проверка личности оператора — ответственность Identity Layer; проверка полномочий на действие — здесь

**Ключевые интерфейсы:**
- Input: validated operator commands от API layer
- Output: MAVLink COMMAND_LONG / DO_SET_MODE / SET_ATTITUDE_TARGET
- Internal: CommandACK state machine, retry logic

**Criticality: CRITICAL** — деградация этого слоя равнозначна потере управления.

---

### Layer 3 — Telemetry / State Layer

**Назначение:** Приём и нормализация входящего MAVLink потока. Поддержание актуального состояния всех подключённых аппаратов.

**Внутри:**
- MAVLink stream parser (byte → structure → dispatch по message ID)
- Vehicle state store (position, attitude, mode, battery, GPS, armed, connection status)
- FactSystem / ParameterStore (2000+ ArduPilot params с метаданными: min/max, units)
- InitialConnectStateMachine (детерминированная синхронизация при подключении)
- Telemetry fanout: raw path → Control Layer, throttled path → UI Layer, archive path → Storage

**Что НЕ должно попадать в этот слой:**
- Бизнес-логика принятия решений — ответственность Control или Autonomy layers
- UI update logic
- Отслеживание выполнения миссии

**Ключевые интерфейсы:**
- Input: raw MAVLink bytes от Transport Layer
- Output (fanout): state events → Control, throttled updates → UI WS, raw frames → archiver

---

### Layer 4 — Mission Planning Layer

**Назначение:** Создание, редактирование, сохранение, загрузка и синхронизация миссий с аппаратом.

**Внутри:**
- Mission plan model (список waypoints, GeoFence, rally points)
- Mission upload protocol (MISSION_COUNT → MISSION_ITEM → MISSION_ACK, с retry)
- Mission download protocol (from vehicle to GCS)
- Plan persistence (SQLite: missions, versions, metadata)
- Survey pattern generator (grid, corridor — для морских обследований)

**Что НЕ должно попадать в этот слой:**
- Real-time mission execution — ответственность Vehicle State / FirmwareAdapter
- Переключение режимов полёта — ответственность Control Layer
- Map tile management

**Ключевые интерфейсы:**
- `GET /missions`, `POST /missions`, `PUT /missions/{id}` — CRUD
- `POST /vehicles/{id}/missions/upload` — загрузка на борт
- `GET /vehicles/{id}/missions/current` — текущая миссия на борту

---

### Layer 5 — Autonomy Supervision Layer

**Назначение:** Мониторинг и advisory-уведомления для операторов о ходе автономных операций. Исключительно advisory, не executive.

**Внутри:**
- Mission progress tracker (текущий waypoint, прогресс, ETA)
- Geofence monitor (предупреждения при приближении к границам)
- Drift detection (отклонение от запланированного пути)
- Anomaly detection (timeout между waypoints, неожиданная смена режима)

**Что НЕ должно попадать в этот слой:**
- Прямые команды аппарату (исключительно Control Layer по команде оператора)
- Изменение failsafe параметров в runtime

**Ключевые интерфейсы:**
- Input: state events от Telemetry Layer
- Output: alert notifications → UI (read-only предупреждения)

---

### Layer 6 — Configuration / Calibration Layer

**Назначение:** Чтение, изменение и сохранение параметров автопилота. Процедуры калибровки датчиков.

**Внутри:**
- Parameter read/write (FactSystem: typed access, validation, range check)
- Calibration state machines (compass, accelerometer, radio)
- Failsafe parameter configuration
- Boat-specific default profiles (pre-configured safe defaults per vessel type)
- Parameter backup/restore (SQLite local cache)

**Что НЕ должно попадать в этот слой:**
- Real-time commands (это Control Layer)
- UI presentation logic

**Ключевые интерфейсы:**
- `GET /vehicles/{id}/params` — все параметры с метаданными
- `PATCH /vehicles/{id}/params/{name}` — изменение параметра
- `POST /vehicles/{id}/calibrations/{type}` — запуск процедуры калибровки

---

### Layer 7 — Communication / Integration Gateway

**Назначение:** Управление физическими соединениями с аппаратами и внешним сервером мониторинга. Только transport и connection lifecycle.

**Внутри:**
- LinkManager: Serial, UDP, TCP connections
- Connection state machine (подключение → синхронизация → работа → потеря связи → reconnect)
- MAVLink signing / key management
- forwardMavlink (ретрансляция для параллельного GCS)
- External server client (sync с remote monitoring сервером)

**Что НЕ должно попадать в этот слой:**
- Mission logic
- Vehicle state (только routing, не хранение)
- Auth logic
- AIS parsing — ответственность BC5 (Maritime Extensions). AIS не является MAVLink-транспортом; размещение критического transport и non-critical AIS-логики нарушает P5.
- Weather API calls — ответственность Extension Layer (BC5).

---

### Layer 8 — Diagnostics / Logging / Replay

**Назначение:** Запись телеметрии и событий, воспроизведение для анализа, диагностика.

**Внутри:**
- Telemetry recorder (.tlog binary + CSV with documented schema)
- Operator audit log (SQLite: action, timestamp, operator_id, vehicle_id, params)
- Log file manager (rotation, cleanup, export)
- Log replay engine (воспроизведение из .tlog)
- System diagnostics (connection quality metrics, packet loss, latency trends)

**Что НЕ должно попадать в этот слой:**
- Control logic
- Real-time UI updates (только запись, не fanout)

---

### Layer 9 — Identity / Access / Audit

**Назначение:** Идентификация оператора, контроль разрешений, неизменяемый журнал действий.

**Phase 1:**
- Operator ID (идентификация при запуске, без пароля)
- Action log (кто, что, когда, с каким результатом)

**Phase 2:**
- RBAC: roles operator / observer / admin; permission-based action gating
- Session management (timeout, re-identification)
- Audit log integrity (append-only; hash-chain по необходимости)

**Что НЕ должно попадать в этот слой:**
- Бизнес-логика управления
- UI presentation

---

### Layer 10 — Extension / Integration Layer

**Назначение:** Точка расширения системы без изменения core. Только для некритических дополнений.

**Внутри:**
- Plugin registry (регистрация дополнительных UI-виджетов, maritime sensors)
- External data feeds (depth sounder, NMEA instruments, weather station)
- Export connectors (fleet management systems, mission archive)

**Ограничения:**
- Плагины не имеют прямого доступа к Control Layer
- Отказ плагина не влияет на core операции
- Phase 1: внутренние модули в monorepo, не runtime-loaded plugins

---

## 6. Bounded Contexts / Major Modules

### BC1 — Vehicle Control

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Принять команду оператора, выполнить на борту, подтвердить результат |
| **In-scope** | Arm/Disarm, mode change, guided navigation (GoTo, RTL, Hold), emergency stop, speed/heading change |
| **Out-of-scope** | Mission planning, parameter management, telemetry recording |
| **Interfaces** | Input: validated commands from API; Output: MAVLink COMMAND/SET_MODE; Events: ACK/NACK |
| **Criticality** | CRITICAL |

### BC2 — Vehicle Monitoring

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Приём и распределение входящей телеметрии. Поддержание актуального состояния |
| **In-scope** | Position, attitude, mode, battery, GPS, armed, connection quality, sensor status |
| **Out-of-scope** | Decision making, command issuing, analytics aggregation |
| **Interfaces** | Input: MAVLink stream; Output: state change events (pub/sub internal), REST/WS state to UI |
| **Criticality** | HIGH |

### BC3 — Mission Management

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Создание, хранение, загрузка и скачивание миссий |
| **In-scope** | Waypoint CRUD, GeoFence, survey patterns, upload/download protocol with ACK, persistence |
| **Out-of-scope** | Real-time execution tracking (это Vehicle Monitoring), flight mode control |
| **Interfaces** | REST API; MAVLink mission protocol; SQLite storage |
| **Criticality** | MEDIUM |

### BC4 — Configuration Management

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Чтение и запись параметров автопилота. Валидация. Калибровка |
| **In-scope** | FactSystem/ParameterStore, calibration state machines, parameter backup |
| **Out-of-scope** | Runtime commands, mission planning |
| **Interfaces** | REST API (params CRUD); MAVLink PARAM_REQUEST/SET; SQLite cache |
| **Criticality** | MEDIUM |

### BC5 — Maritime Extensions

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Maritime-specific данные и alerts, не покрытые стандартным MAVLink |
| **In-scope** | AIS vessel parsing (NMEA), depth monitoring, drift detection, MOB alert, pre-launch maritime checklist |
| **Out-of-scope** | Core vehicle control, parameter management |
| **Interfaces** | Input: AIS NMEA stream, echosunder NMEA; Output: vessel objects → UI, alerts → Autonomy Supervision |
| **Criticality** | MEDIUM |

### BC6 — Operator Identity & Audit

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Установить кто управляет, что разрешено, записать действие |
| **In-scope** | Operator identification, role assignment, action logging, permission checks |
| **Out-of-scope** | UI, vehicle control logic |
| **Interfaces** | Internal: permission query API; Storage: SQLite audit log |
| **Criticality** | MEDIUM (HIGH при регуляторных требованиях) |

### BC7 — Data Recording & Analysis

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Запись всех данных операции. Воспроизведение. Экспорт |
| **In-scope** | .tlog recording, CSV export, log replay, system metrics |
| **Out-of-scope** | Real-time control, analytics aggregation (Phase 2+) |
| **Interfaces** | Input: telemetry fanout stream; Output: files (SQLite, CSV, .tlog) |
| **Criticality** | LOW (non-critical path) |

### BC8 — Communication Transport

| Атрибут | Значение |
|---------|---------|
| **Responsibility** | Физическое соединение с аппаратом. Routing байт. Connection lifecycle |
| **In-scope** | Serial, UDP, TCP link management, MAVLink signing, reconnect logic |
| **Out-of-scope** | Message interpretation, state management |
| **Interfaces** | Output: raw bytes → MAVLink parser; Input: encoded MAVLink bytes from Control |
| **Criticality** | CRITICAL |

---

## 7. Hard Boundaries

### B1 — UI vs Control Logic

**Правило:** UI процесс не содержит логики принятия решений. UI отображает состояние и транслирует intent оператора в API-вызовы. Вся валидация (можно ли ARM в текущем состоянии) — в Control Layer.

**Нарушение:** `activeVehicle.armed = true` напрямую из QML — прямая запись состояния из UI. В целевой архитектуре вместо этого: `POST /vehicles/{id}/commands/arm`.

**Исключение Phase 1:** В QGC fork прямой QML→C++ binding временно допустим до полного формирования API layer.

---

### B2 — Local Edge Control vs Remote Services

**Правило:** Управляющая логика (arm, mode change, emergency stop, mission execution) работает без подключения к любому удалённому сервису. Remote services — только для synchronization, monitoring, analytics.

**Нарушение:** Control-команда проходит через remote server перед отправкой на аппарат.

---

### B3 — Real-Time Telemetry Path vs Analytics Path

**Правило:** Telemetry fanout разделяет два пути:
- **Real-time path:** MAVLink → Vehicle State → UI WS (target: <100ms end-to-end, throttled at 10–20 Hz)
- **Analytics path:** MAVLink → Data Recorder → storage (unbounded latency, batch-friendly)

**Нарушение:** Запись в storage блокирует real-time path. Disk I/O и query execution — только в analytics path.

---

### B4 — Operator Commands vs Autonomy Decisions

**Правило:** Autonomy Supervision Layer только уведомляет. Команды аппарату отправляются только по явному действию оператора или по pre-configured failsafe firmware (на борту аппарата, не на GCS).

**Нарушение:** GCS автоматически меняет режим или waypoint без подтверждения оператора в ответ на alert.

**Исключение:** Emergency stop по hardware watchdog — это safety mechanism, не autonomy.

---

### B5 — Core Platform vs Extensions

**Правило:** Extensions (plugins, AIS, weather, external integrations) не имеют прямого доступа к Control Layer и Vehicle State. Они получают данные через read-only API и публикуют события через advisory channel.

**Нарушение:** Plugin вызывает `vehicle->sendMavlinkCommand()` напрямую.

---

### B6 — Live Operational State vs Historical Data

**Правило:** Операционное состояние (Vehicle State store) — горячие данные в памяти, source of truth = последние данные от аппарата. Исторические данные — в storage. Разные endpoints, разные latency expectations.

**Нарушение:** UI запрашивает исторические данные из того же store, который поддерживает live state.

---

### B7 — Trusted Control Channels vs External Integrations

**Правило:** Trusted channels: local UI → backend (localhost, authenticated), физический Serial/USB к аппарату. External: REST API от remote dashboard, AIS feed, fleet management webhook — все считаются untrusted и требуют validation/auth.

**Нарушение:** REST API команда на arm выполняется без operator authority check, только на основе наличия valid token.

---

## 8. Offline / Degraded Operations

### 8.1 Уровни деградации

```
LEVEL 0 — Полная операция
  Все компоненты онлайн. UI, backend, аппарат подключены.

LEVEL 1 — Нет интернета (только radio)
  Недоступны: online maps, remote monitoring, AIS из интернет-фидов.
  ─ НЕ ЗАТРОНУТО: управление аппаратом, телеметрия, миссии, локальные функции
  ─ МИТИГАЦИЯ: offline tile cache (SQLite), local AIS serial feed при наличии устройства

LEVEL 2 — Потеря UI процесса
  Desktop UI упал или отключился.
  ─ НЕ ЗАТРОНУТО: аппарат продолжает выполнение миссии (firmware autonomous)
  ─ НЕ ЗАТРОНУТО: backend процесс продолжает запись телеметрии
  ─ МИТИГАЦИЯ: onboard failsafe предотвращает неконтролируемое состояние
  ─ ДЕЙСТВИЕ ОПЕРАТОРА: перезапустить UI, переподключиться. Состояние восстанавливается из Vehicle State store.

LEVEL 3 — Потеря радиосвязи (Communication Lost)
  GCS не достигает аппарата.
  ─ ПОВЕДЕНИЕ АППАРАТА: бортовой failsafe по pre-configured одиночному параметру:
      FS_GCS_ENABLE=1: детекция timeout. Рекомендуемый FS_GCS_TIMEOUT для boat: 10s.
      FS_ACTION: задаётся оператором до миссии. Варианты: Hold(0), RTL(1), SmartRTL(2), Disarm(4).
      Рекомендация для boat: FS_ACTION=2 (SmartRTL) — возврат по записанному треку.
      Если SmartRTL невозможен (трек не записан): firmware деградирует до RTL.
  ─ ВАЖНО: Автоматического каскада FS_ACTION=3→1→4 нет. Это единственный параметр.
      Деградация SmartRTL→RTL — внутренняя логика firmware, не GCS-конфигурируемая.
  ─ ПОВЕДЕНИЕ GCS: статус «Comms Lost», попытки reconnect каждую 1s
  ─ ДЕЙСТВИЕ ОПЕРАТОРА: поддерживать визуальный контакт, ожидать reconnect или физическое восстановление
  ─ ЗАБЛОКИРОВАНО: все команды аппарату

LEVEL 4 — Падение backend процесса (Phase 2+, при отдельном UI процессе)
  Backend процесс недоступен. UI продолжает работу.
  ─ ПОВЕДЕНИЕ UI: отображает последнее известное состояние (cached), статус «Backend offline»
  ─ НЕ ЗАТРОНУТО: аппарат продолжает миссию (собственный autopilot)
  ─ МИТИГАЦИЯ: local state cache в UI, попытки reconnect
  ─ ЗАБЛОКИРОВАНО: отправка команд через API
  ─ НЕ ЗАБЛОКИРОВАНО: отображение состояния (cached), diagnostics
```

### 8.2 Что работает локально (offline-capable)

| Функция | Offline? | Примечание |
|---------|----------|-----------|
| Vehicle control (arm, mode, guided) | ✅ | Не требует интернета |
| Mission upload/download | ✅ | Прямой MAVLink |
| Telemetry display | ✅ | Прямой MAVLink |
| Offline maps | ✅ | SQLite tile cache (предзагружен) |
| Parameter editing | ✅ | Прямой MAVLink + local cache |
| Telemetry recording | ✅ | Local SQLite/CSV |
| Audit log | ✅ | Local SQLite |
| Failsafe configuration | ✅ | Прямой MAVLink |
| AIS (serial device) | ✅ | При наличии NMEA serial device |

### 8.3 Что деградирует без интернета

| Функция | Деградация | Митигация |
|---------|-----------|-----------|
| Online map tiles | Недоступны | Предзагрузить регион перед выходом |
| AIS internet feed | Недоступен | Serial AIS device |
| Remote monitoring dashboard | Недоступен | Локальный UI остаётся |
| Weather data | Недоступен | Pre-mission briefing |
| Nautical chart updates | Недоступны | Предзагрузить |

### 8.4 Что заблокировано при деградации

| Ситуация | Заблокировано | Причина |
|----------|--------------|---------|
| Communication Lost | Все команды аппарату | Нет подтверждения доставки |
| Communication Lost | Force Arm | Оператор не имеет visual confirmation |
| Нет идентифицированного оператора | Arm | Unknown operator = no accountability |
| Backend offline (Phase 2+) | Команды через API | Нет routing |

---

## 9. Interaction Model

### Mode 1 — Field Mode (Primary)

**Context:** Полевой оператор с ноутбуком у воды. 1–2 аппарата. Нестабильная связь.

**Interaction:**
- Desktop app (Qt или Tauri), fullscreen или maximized
- Primary view: FlyView с картой, telemetry overlay, guided action bar
- Secondary view: PlanView для миссий
- Keyboard shortcuts для быстрых действий (HOLD: Space, RTL: F1, Stop: Esc)
- Все элементы управления — крупные (читаемы на солнце, в перчатках)
- Статус: визуальные + звуковые алерты (потеря связи = sound alert)
- Offline: обязателен

**Non-negotiable:** HOLD и Emergency Stop доступны с любого экрана в один клик.

---

### Mode 2 — Command Center Mode (Phase 2+)

**Context:** Береговой оператор, стационарное рабочее место, несколько мониторов, стабильный LAN/LTE.

**Interaction:**
- Web dashboard (read + control)
- Multi-vehicle overview map
- Per-vehicle telemetry panels
- Mission status overview
- Alerts center

**Ограничения:**
- Control commands проходят через backend. Latency tolerance: <500ms — предел human perception. Не safety limit: аппарат выполнит команду независимо от GCS latency.
- Concurrent control: только один активный controlling operator на аппарат (lock механизм).

---

### Mode 3 — Engineering Mode

**Context:** Инженер на борту или в мастерской. Конфигурация, калибровка, тестирование.

**Interaction:**
- SetupView (parameters, calibration procedures, failsafe config)
- Parameter editor с поиском
- Sensor calibration wizards
- Field log viewer
- SITL connection (симулятор вместо реального аппарата)

**Отличие от Field Mode:** Нет блокировок на изменение параметров. Предупреждения вместо жёстких ограничений.

---

### Mode 4 — Maintenance Mode

**Context:** Техническое обслуживание между операциями. Диагностика, firmware update, отчётность.

**Interaction:**
- Log analysis (review past operations)
- Telemetry replay
- Diagnostic reports (connection quality, packet loss trends)
- Firmware update flow
- Audit log review

**Offline:** Большинство функций работает offline (local logs). Firmware download требует интернет.

---

### Mode 5 — Training / Simulation Mode

**Context:** Обучение операторов без реального аппарата. ArduPilot SITL boat.

**Interaction:**
- Идентично Field Mode, с SITL backend вместо физического Serial-соединения
- Без физических failsafe (симулированные)
- Запись действий для разбора с инструктором

---

## 10. Maritime-Specific Requirements

### 10.1 Длительные автономные миссии

**Проблема:** Морской аппарат может выполнять миссию 4–12 часов без постоянного присутствия оператора у монитора.

**Требования:**
- Mission progress persistence (при перезапуске GCS — система восстанавливает текущее положение аппарата)
- Waypoint timeout alerts (аппарат не перешёл к следующему waypoint в ожидаемое время)
- ETA tracking с учётом оставшегося заряда батареи
- Battery reservation failsafe: автоматический RTL при достижении порога возврата
- «Mission complete» notification: звуковой + визуальный алерт

**Ключевые параметры:** `WP_RADIUS`, `WP_SPEED`, `BATT_LOW_VOLT`, `BATT_FS_LOW_ACT`

---

### 10.2 Нестабильная связь

**Проблема:** 915MHz radio: 10–50 кбит/с, packet loss до 30% — норма в портах с электромагнитными помехами.

**Требования:**
- Link quality indicator (RSSI + packet loss %) всегда виден оператору
- Telemetry throttling: приоритет critical messages (HEARTBEAT, ATTITUDE, GLOBAL_POSITION) над non-critical
- Command retry: автоматический повтор команды (до 3 раз) с ACK timeout
- Reconnect: автоматический reconnect при восстановлении с полной ресинхронизацией состояния
- Pre-configured FS_GCS_TIMEOUT: рекомендуемое значение для boat — 10s (vs 5s для aerial)

---

### 10.3 Навигация на воде

**Проблема:** Морское судно не имеет высоты, не взлетает, не садится. Навигационные концепции отличаются от авиационных.

**Требования:**
- Убрать aerial-only controls: Takeoff, Land, Altitude change, VTOL Transition
- Station Keeping (Loiter / Hold) — основной режим удержания позиции, не просто «пауза»
- SmartRTL как предпочтительный return mode (обходит препятствия по пройденному треку)
- Dock mode support в UI (target marker integration)
- Negative thrust (задний ход): поддержка в guided commands
- Speed limits: ограничения скорости в зависимости от зоны (порт vs открытая вода)
- Circle / grid survey для гидрографических съёмок

---

### 10.4 AIS и навигационная обстановка

**Проблема:** На воде работают другие суда. Оператор должен видеть окружающий трафик.

**Требования:**
- AIS vessel overlay на карте (суда в радиусе 10 NM)
- Два источника AIS: serial NMEA device (primary, offline-capable) + internet AIS feed (secondary)
- CPA alert (Closest Point of Approach): предупреждение при риске сближения
- MMSI lookup: по клику — данные судна (name, type, speed, heading)
- AIS logging: запись AIS трафика для инцидент-анализа

---

### 10.5 MOB (Man Overboard)

**Проблема:** В коммерческих maritime операциях наличие MOB процедуры — стандартное требование.

**Требования:**
- Выделенная MOB кнопка: один клик → аппарат направляется к текущей позиции GCS (или указанной GPS точке)
- MOB mode: аппарат удерживает позицию (Loiter) до команды оператора
- MOB event: запись в audit log с timestamp и координатами
- Защита от случайного нажатия: delay confirmation (удержание)
- Доступна с любого экрана

---

### 10.6 Самодиагностика

**Проблема:** Морской аппарат работает удалённо, нередко без возможности быстрого физического доступа.

**Требования:**
- Pre-launch checklist: maritime-specific проверки перед ARM (GPS fix quality, compass status, battery %, depth sensor, AIS active, anchor stowed, emergency stop test)
- System health dashboard: состояние всех датчиков в одном месте
- Predictive alerts: «батарея деградировала — возможно не хватит на полную миссию»
- Connection quality trending: деградация RSSI за последние N минут — сигнал о нарастающей проблеме
- Post-mission report: автоматически генерируемый summary (дистанция, время, max скорость, ошибки, события)

---

### 10.7 COLREGS и навигационные зоны (Phase 2+)

**Требования:**
- Geofence zones: no-go zones, shallow water areas, exclusion zones
- Speed zones: ограничение скорости в зонах (порт: 3 knots max)
- AIS-based CPA warning: алерт при риске столкновения
- Navigation lights status indicator (при наличии MAVLink-контроля)

---

## 11. Roadmap

### 11.1 Phase 1: Core Deliverables (3–5 месяцев)

Реализуется в рамках QGC Fork:

- [ ] Boat-customized QML UI (убрать aerial controls, приоритизировать boat modes)
- [ ] REST + WebSocket API layer (Qt HttpServer + QWebSocketServer)
- [ ] Advisory operator lock (UUID-based, один активный controlling operator)
- [ ] Operator ID + SQLite action log
- [ ] Maritime pre-launch checklist (расширить RoverChecklist.qml)
- [ ] Failsafe safe defaults (FS_GCS_ENABLE=1, FS_ACTION=2 SmartRTL as default)
- [ ] CSV telemetry enabled by default с задокументированной schema
- [ ] Offline maps: предзагрузка региона обязательна в setup workflow

### 11.2 Architectural Enablement (Phase 1, no immediate implementation)

Архитектурные требования к кодовой базе, обеспечивающие эволюцию без структурных переписок:

- [ ] API layer достаточно стабилен для замены UI процесса без изменения backend
- [ ] Vehicle State store независим от QML binding (чистый C++ state, QML читает через Q_PROPERTY)
- [ ] Audit log schema допускает добавление RBAC без миграции данных
- [ ] Mission storage в SQLite с ID и metadata (не только файловая система)

### 11.3 Phase 2 Capabilities (4–6 месяцев после Phase 1)

- [ ] Отдельный UI процесс (Tauri/Electron + React или web)
- [ ] Multi-vehicle support (2–5 судов, exclusive control lock per vehicle)
- [ ] AIS overlay (NMEA serial + internet feed)
- [ ] Depth monitoring (NMEA echosunder)
- [ ] MOB button
- [ ] Video: GStreamer → RTSP → WebRTC
- [ ] Structured telemetry: SQLite tables + Parquet export
- [ ] RBAC: operator / observer / admin
- [ ] Remote read-only web dashboard
- [ ] Survey patterns: grid survey для гидрографии
- [ ] Post-mission report generation

### 11.4 Exploratory (Research, No Commitment)

| Тема | Trigger для активации |
|------|----------------------|
| CPA / COLREGS advisory | При получении commercial operating permits |
| Cloud-native backend | При SaaS бизнес-модели или >10 operators |
| Swarm coordination | При fleet >5 одновременных судов |
| AI-assisted path planning | При наличии training data из реальных операций |
| S-57/S-63 charts | При требованиях coastal authorities |
| Digital twin | При enterprise clients (defense, research) |
| Edge IoT gateway (Raspberry Pi) | Если оператор и радиомодем физически разнесены |

### 11.5 Anti-Patterns to Avoid

| Anti-pattern | Почему опасен | Что вместо |
|-------------|--------------|-----------|
| Cloud dependency for control loop | Потеря связи с cloud = потеря управления | Local edge control; cloud — optional enhancement |
| Stateless UI | Backend crash = UI blind | UI local state cache + graceful degradation |
| Autonomy layer with executive authority | AI решает за оператора | Advisory only — оператор всегда последний |
| gRPC/MQTT broker для 1–5 судов | Ops overhead без выигрыша | Direct WebSocket; broker при >20 vessels |
| Full microservices с Day 1 | N pipelines × team of 5 = untenable | Modular monolith; extract service только обоснованно |
| Web-only control UI | Serial access, reliability, tab crash | Desktop для управления; web для мониторинга |
| TimescaleDB на MVP | Infrastructure overhead | SQLite + CSV; TimescaleDB только при аналитических требованиях |
| Plugin SDK до появления 3+ внешних потребителей | Documentation, versioning, compatibility matrix | Internal modules в monorepo |
| Full RBAC / IAM с Day 1 | Auth systems ≠ core competency | Operator ID + action log; RBAC в Phase 2 |
| Полная переписка QGC до валидации продукта | 10–14 мес. риска без подтверждённого рынка | Fork + extract; rewrite после market validation |

---

## 12. Final Recommendation

### Рекомендуемая архитектура

**Edge-first layered modular system** с явным разделением на:
- **Control Layer** (critical path, operator authority enforced, MAVLink direct)
- **Telemetry Layer** (state management, no decision making)
- **Mission Layer** (planning, upload, persistence)
- **Maritime Extensions** (AIS, MOB, depth — advisory only)

Развёртывание: локальный binary процесс на машине оператора. UI — отдельный процесс (Phase 2), взаимодействующий через REST + WebSocket API. Все вертикали — offline-capable. Cloud и remote monitoring — optional enhancement, не dependency для управляющего контура.

### Отличие от QGC-monolith

| Dimension | QGC Monolith | Target Architecture |
|-----------|-------------|---------------------|
| UI coupling | C++/QML, жёстко связан с логикой | Отдельный процесс, API-connected |
| External integration | Невозможна без форка | REST/WS API — первоклассный гражданин |
| Multi-operator | Один оператор, один процесс | Concurrent operators с authority management |
| Maritime specifics | Generic UAV GCS, Rover = afterthought | Maritime-first: AIS, MOB, depth, COLREGS |
| Audit | Нет | Action log из коробки (Phase 1) |
| Degraded mode | Не определён | Явно задокументирован, 4 уровня |
| Telemetry recording | .tlog binary | CSV schema + SQLite + Parquet export |
| Online dependency | Только для карт | None для core operation |

### Почему архитектура устойчива на несколько лет вперёд

1. **API boundary** между UI и backend делает UI независимо заменяемым. QML → Tauri → Web — без переписки backend.
2. **Staged migration** (Phase 1 → Phase 2 → Phase 3): Phase 1 не создаёт архитектурный тупик — API layer, audit log, SQLite storage переносятся в чистую архитектуру без потери данных.
3. **Maritime-first assumptions** (offline, 1–5 vessels, field operator) — правильный уровень абстракции для 3–5 лет роста продукта без смены архитектурной модели.
4. **Hard boundaries** (§7) предотвращают architectural drift: критические части системы изолированы от влияния новых функций.
5. **Anti-pattern list** (§11.5) явно фиксирует что делать нельзя — предотвращает преждевременный переход к cloud-native или microservices.

**Три условия для пересмотра стратегии:**
1. Целевой масштаб превышает 20 одновременных судов → рассматривать message broker и distributed state
2. Модель операций меняется на command center → web-first становится приемлемым
3. Qt license cost становится блокером → ускорить миграцию backend на Rust/Go

---

## Appendix: Key Source References

| Утверждение | Источник |
|------------|---------|
| 15 режимов ArduPilot Rover/Boat | `ArduRoverFirmwarePlugin.cc:11-46` |
| `supportsNegativeThrust() = true` | `ArduRoverFirmwarePlugin.h:37` |
| `pauseFlightMode() → Hold` | `ArduRoverFirmwarePlugin.cc:83-86` |
| `guidedModeChangeAltitude()` → not supported | `ArduRoverFirmwarePlugin.cc:73-76` |
| InitialConnectStateMachine | `src/Vehicle/InitialConnectStateMachine.h:23` |
| MAVLink Signing реализован | `src/Comms/LinkInterface.cc:41-51` |
| `saveCsvTelemetry` существует | `src/Vehicle/Vehicle.cc:3825`, `MavlinkSettings.h:20` |
| `forwardMavlink` — ретрансляция MAVLink | `src/Comms/MAVLinkProtocol.cc:156-173` |
| `Qt6::HttpServer` linked в проекте | `src/Utilities/Network/CMakeLists.txt` |
| FS_GCS_ENABLE, FS_ACTION failsafe params | `APMFailsafes.VehicleConfig.json` |
| QGCDelayButton (confirmation UI pattern) | `src/QmlControls/QGCDelayButton.qml` |
| QGCTileCacheDatabase (offline maps) | `src/QtLocationPlugin/` |
| MISSION_COUNT→ITEM→ACK protocol | `src/MissionManager/MissionManager.cc` |
| MAV_TYPE_SURFACE_BOAT | `src/MAVLink/QGCMAVLink.cc:182,364` |
| 50 критических boat UI actions | `docs/analysis/13_UI_ACTION_MAP.md §7` |
| Architecture decision trade-offs | `docs/analysis/05_ARCHITECTURE_DECISIONS.md` |
| Gap Analysis и Decision Matrix | `docs/analysis/06_GAP_ANALYSIS_FINAL.md` |
