# Gap Analysis: QGroundControl → Maritime Ground Control Station

> **Документ:** Gap Analysis — Maritime GCS Architecture
> **Дата:** 2026-04-05
> **Базис:** Codebase audit (01–15), исходный код QGC 4.x (Qt6/C++20), ArduPilot Rover/Boat firmware plugin
> **Область:** Профессиональная GCS для автономных надводных аппаратов (ASV), 1–5 судов, field operator

---

## 1. Executive Summary

QGroundControl — зрелый полевой клиент для управления одиночными и малочисленными БПЛА. Его ядро (FactSystem, MAVLink routing, FirmwarePlugin, MissionManager) проверено годами эксплуатации и покрывает ~80% базовых потребностей наземного оператора.

Для профессиональной maritime GCS существует ряд структурных несоответствий:

- **Нет сетевого API** — интеграция с внешними системами невозможна без форка
- **Нет модели пользователей, ролей и аудита** — неприемлемо для коммерческой эксплуатации
- **UI жёстко связан с бизнес-логикой** через Qt meta-object system — UI нельзя заменить или вынести
- **Maritime-специфические потребности не покрыты** — AIS, глубина, течения, MOB, навигационные зоны

Четыре архитектурных направления сравниваются по 10 взвешенным критериям. Итог — конкретная рекомендация с явным обоснованием trade-offs и поэтапной стратегией реализации.

---

## 2. Assumptions

Все выводы документа строятся на следующих предположениях. При изменении любого из них часть рекомендаций потребует пересмотра.

| # | Предположение | Значение | Влияние на архитектуру |
|---|---------------|----------|------------------------|
| A1 | Количество одновременных судов | **1–5** | Нет необходимости в message broker или distributed state на MVP |
| A2 | Тип оператора | **Полевой оператор** — ноутбук/планшет у кромки воды | Edge-first, не cloud-first |
| A3 | Надёжность связи | **Нестабильная** — 915MHz радиомодем, 10–50 кбит/с, LTE — опциональный | Offline-first обязателен |
| A4 | Протокол | **MAVLink / ArduPilot Rover** | MAVLink-совместимость = hard requirement |
| A5 | Предметная область | **Maritime-first** — надводные аппараты в прибрежной зоне | Нужны: AIS, depth, MOB, nautical charts, COLREGS |
| A6 | Стадия продукта | **MVP → v1** — не enterprise platform с Day 1 | Минимизировать overengineering |
| A7 | Размер команды | **2–5 разработчиков** | Архитектура должна быть посильной — малая команда не может поддерживать распределённую систему |
| A8 | Режим операций | **Смешанный** — автономные миссии + ручное управление + мониторинг | Все три режима — must-have |
| A9 | Критичность безопасности | **Средняя** — не military, но коммерческий аппарат на воде | Failsafe обязателен, audit желателен с MVP |
| A10 | Целевые платформы | **Desktop** (Win/Mac/Linux) + опционально планшет | Не mobile-first, не web-only |

> **Чувствительность предположений:** При изменении A1 на 50+ vessels или A2 на command center веса в Decision Matrix (§5) потребуют пересмотра: Security вырастает с ×2 до ×3, Scalability — с ×1 до ×3.

---

## 3. Gap Analysis

### 3.1 Что сохранить как проверенные паттерны

Следующие элементы QGC доказали надёжность в условиях реальной эксплуатации. В целевой архитектуре они сохраняются — не как копия кода, а как проверенные инженерные паттерны.

| Паттерн | Источник | Ценность | Рекомендация по переносу |
|---------|---------|----------|--------------------------|
| **FactSystem** — data-driven параметры с метаданными | `src/FactSystem/` | Автоматическая валидация (min/max), единицы измерения, UI auto-generation. Покрывает 2000+ параметров ArduPilot | Реализовать как typed parameter store с JSON schema. API: `GET /vehicles/{id}/params`, `PATCH /vehicles/{id}/params/{name}` |
| **FirmwarePlugin** — стратегия абстракции firmware | `src/FirmwarePlugin/` | Изолирует различия PX4 / ArduPilot. Определяет доступные режимы, failsafe actions, command mappings | Сохранить как `IFirmwareAdapter` interface на backend |
| **InitialConnectStateMachine** | `src/Vehicle/InitialConnectStateMachine.*` | Детерминированная синхронизация при подключении. Retry-логика для потерянных пакетов | Перенести как конечный автомат подключения. Логика отработана — повторная реализация с нуля не оправдана |
| **Mission upload protocol** — последовательный upload с ACK | `src/MissionManager/` | Надёжная загрузка миссий по ненадёжному каналу: `MISSION_COUNT → MISSION_ITEM → MISSION_ACK` | Сохранить как backend service со state machine |
| **Failsafe-first thinking** | `APMFailsafes.VehicleConfig.json`, ArduPilot `FS_*` params | Полевая система без failsafe — потеря аппарата. Communication Lost → auto-SmartRTL | Расширить для maritime: drift detection, depth failsafe, weather hold |
| **Offline maps** (SQLite tile cache) | `QGCTileCacheDatabase` | Без offline-карт система бесполезна на воде | Сохранить tile cache, добавить nautical chart support (OpenSeaMap / S-57) |
| **Delay-based confirmation** для критических действий | `QGCDelayButton` | Arm, Emergency Stop, Start Mission — требуют удержания кнопки. Предотвращает случайный запуск | Перенести как UI pattern в любом frontend-фреймворке |

### 3.2 Что требует архитектурной адаптации

| Элемент | Текущее состояние | Проблема | Целевое состояние |
|---------|-------------------|----------|--------------------|
| **Связь UI ↔ Backend** | C++ Q_PROPERTY → QML binding (синхронный, in-process) | Невозможно заменить UI или подключить внешний клиент. `forwardMavlink` позволяет ретрансляцию MAVLink на другой GCS, но это не API — это сырой MAVLink stream | Выделить API layer (WebSocket для telemetry, REST для CRUD). Backend + UI как отдельные процессы |
| **MultiVehicleManager** | In-memory singleton | Не масштабируется за пределы ~10 vehicles на слабом устройстве | Vehicle state service с in-memory cache + persistence |
| **Отсутствие Auth** | Нет пользователей, ролей, audit log | Неприемлемо для коммерческой эксплуатации | MVP: operator ID + action log. Не enterprise IAM с первой итерации |
| **Fact persistence** | Параметры в памяти, MAVLink — source of truth | При перезапуске GCS — полная ресинхронизация | Local cache (SQLite) + delta sync |
| **Video pipeline** | GStreamer через Qt plugin (gstqml6gl) | Жёсткая привязка к Qt rendering pipeline | Standalone GStreamer + RTSP primary, WebRTC endpoint для web UI |
| **Telemetry recording** | `.tlog` (raw MAVLink binary) + опциональный CSV `saveCsvTelemetry` в `Vehicle.cc:3825` | CSV export существует, но: (a) не включён по умолчанию, (b) формат не задокументирован, (c) нет schema | Включить CSV как default. Задокументировать schema. Структурированный SQLite — Phase 2 |
| **Settings storage** | QSettings (платформозависимый registry/plist) | Не portable, не versionable | JSON/YAML config с schema validation |
| **MAVLink Security** | MAVLink Signing реализован (`LinkInterface::initMavlinkSigning()`, `SigningIndicator.qml`) | Signing покрывает integrity, но: нет шифрования payload, нет ротации ключей, нет PKI | Signing — baseline Phase 1. DTLS для радиоканала — Phase 2. Signing ≠ полноценная security |
| **Boat support** | `ArduRoverFirmwarePlugin` с `MAV_TYPE_SURFACE_BOAT` — общий с наземным Rover | Нет maritime UI: AIS overlay, depth gauge, nautical charts, MOB | Dedicated `BoatFirmwareAdapter` + maritime extension modules |

### 3.3 Архитектурный долг

Конструктивные решения, которые были обоснованы на момент принятия, но создают накопленные ограничения для целевой архитектуры.

| Долг | Проявление | Стратегия |
|------|-----------|-----------|
| **Qt vendor lock-in** | Миграция Qt5→Qt6 заняла ~2 года сообщества. Любое обновление — риск regression на всех слоях | Выносить послойно (UI → API layer → backend), не переписывать целиком |
| **Monolith binary** | Один deployable. Нельзя обновить часть системы независимо | Выделить backend process + UI process как отдельные OS-процессы |
| **QML/C++ debugging** | Цепочку `emit valueChanged()` невозможно отследить через стек вызовов | При наличии API layer — UI отлаживается независимо от backend |
| **Нет unit test coverage для QML** | `QGC_BUILD_TESTING=OFF` по умолчанию. Нет E2E тестов | При переходе на web UI — стандартные инструменты (Playwright, Vitest) |

### 3.4 Overengineering на старте

| Идея | Почему преждевременна | Trigger для активации |
|------|-----------------------|-----------------------|
| **MQTT/Kafka message broker** | При 1–5 судах прямой WebSocket справляется. Broker = latency + ops overhead | >20 одновременных аппаратов или multi-operator scenarios |
| **Kubernetes / Docker orchestration** | Для edge-deployment на ноутбуке — unnecessary complexity | SaaS-версия с cloud-hosted backend |
| **gRPC для Edge↔Backend** | При одном backend process — overhead протокола не оправдан | Если Edge и Backend физически на разных машинах |
| **Micro-frontends / WASM plugins** | Малая команда не может поддерживать plugin ecosystem | >3 вендоров полезных нагрузок с custom UI |
| **Time-Series DB (InfluxDB/TimescaleDB)** | Для 1–5 судов — SQLite + CSV/Parquet достаточно | Аналитический дашборд с queries по TB данных |
| **Full RBAC + IAM** | Для 1–3 операторов достаточно operator ID + action log | >10 пользователей с различными правами |

### 3.5 Что несовместимо с maritime / professional use case

| Подход | Проблема | Правильная альтернатива |
|--------|----------|------------------------|
| **Web-only control** для критических операций | Web Serial API — только Chromium (shipped с Chrome 89, нет Firefox/Safari). Браузер не гарантирует foreground execution. Случайное закрытие вкладки при ARM — недопустимый risk profile | Desktop client для управления + web для мониторинга |
| **Cloud как единственный backend** | На воде интернет — это точка отказа, не инфраструктура. Судно обязано управляться без интернета | Edge-first: локальный backend на устройстве оператора. Cloud — только для sync, analytics, remote monitoring |
| **Stateless UI** | При потере backend — UI полностью парализован | UI с локальным кэшем состояния, graceful degradation при потере backend |
| **WebRTC как единственный видеотранспорт** | WebRTC STUN/TURN требует интернет-доступа. В открытом море — только P2P UDP | Direct RTSP/UDP (primary) + WebRTC endpoint (when internet available) |

---

## 4. Architecture Options Comparison

### Option A: Modern Modular Desktop / Edge-First

**Описание:** Локальное приложение с разделённой архитектурой. Backend (Rust/Go/C++) и Frontend (Electron/Tauri + React) — отдельные процессы на одной машине. Общение через WebSocket/IPC.

```
┌──────────────────────────────────────────┐
│          Operator Machine (Laptop)        │
│                                           │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │  UI Process  │◄──►│ Backend Process  │  │
│  │  (Tauri/     │IPC │ (Rust/Go)       │  │
│  │   Electron)  │WS  │                 │  │
│  └─────────────┘    │ ┌─────────────┐ │  │
│                      │ │ MAVLink     │ │  │
│                      │ │ Engine      │ │  │
│                      │ └──────┬──────┘ │  │
│                      │ ┌──────▼──────┐ │  │
│                      │ │ Serial/UDP  │ │  │
│                      │ └─────────────┘ │  │
│                      └─────────────────┘  │
│                              │             │
└──────────────────────────────┼─────────────┘
                               │ Radio/USB
                          ┌────▼────┐
                          │   ASV   │
                          └─────────┘
```

| Критерий | Оценка |
|----------|--------|
| **Сильные стороны** | Полная автономность, минимальная latency, нативный Serial/USB доступ, полностью offline |
| **Слабые стороны** | Нет remote access из коробки, single-operator |
| **Риски** | Electron: bloat (~250MB runtime). Tauri: ограниченная документация для complex desktop apps, малый ecosystem. Rust MAVLink crates не проверены для production GCS. Rust learning curve для команды |
| **Fit for maritime GCS** | ⭐⭐⭐⭐⭐ — идеален для field operator |
| **Fit for low-connectivity** | ⭐⭐⭐⭐⭐ — полностью offline |
| **Implementation complexity** | Средняя — два process boundary. Критично: нет переиспользования QGC кода, всё пишется заново |
| **Time-to-market** | **10–14 месяцев** до usable MVP (полная переписка MAVLink engine + FactStore + 4 views с нуля командой из 2–5 человек, осваивающей новый стек) |

---

### Option B: Hybrid Edge + Optional Backend + Web Dashboard

**Описание:** Edge node (ноутбук оператора) управляет аппаратом. Опциональный backend (on-premise или cloud) для persistence, auth, remote monitoring. Web dashboard для наблюдения.

```
┌──────────────────────┐          ┌──────────────────────┐
│  Field Operator       │          │  Remote Monitoring    │
│  (Edge Node)          │          │  (Optional)           │
│                       │          │                       │
│  ┌─────────────────┐ │   LTE/   │  ┌─────────────────┐ │
│  │ Desktop Client  │ │   VPN    │  │  Web Dashboard   │ │
│  │ + Local Backend │◄├─────────►├─►│  (Read-only)     │ │
│  │ + Local DB      │ │          │  └─────────────────┘ │
│  └────────┬────────┘ │          │                       │
│           │          │          │  ┌─────────────────┐ │
│      Radio/USB       │          │  │  Backend API     │ │
│           │          │          │  │  (Auth, Logs,    │ │
│      ┌────▼────┐     │          │  │   Mission Store) │ │
│      │   ASV   │     │          │  └─────────────────┘ │
│      └─────────┘     │          │                       │
└──────────────────────┘          └──────────────────────┘
```

| Критерий | Оценка |
|----------|--------|
| **Сильные стороны** | Баланс автономности и connectivity. Remote monitoring без ущерба для field control |
| **Слабые стороны** | Два deployment targets. Sync complexity при потере/восстановлении связи |
| **Риски** | Sync conflicts. Scope creep: «давайте добавим ещё один remote endpoint» |
| **Fit for maritime GCS** | ⭐⭐⭐⭐ — хороший баланс |
| **Fit for low-connectivity** | ⭐⭐⭐⭐ — edge автономен, backend опционален |
| **Implementation complexity** | Высокая — sync logic + two deployment targets |
| **Time-to-market** | 9–14 месяцев (edge выпускается раньше, backend наращивается позже) |

---

### Option C: Distributed Cloud-Native Platform

**Описание:** Полноценная серверная платформа. Edge gateway на каждом радиомодеме, центральный backend (Kubernetes), web-only UI.

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────┐
│ Edge Gateway │     │   Cloud Backend       │     │  Web Client  │
│ (Raspberry   │     │                       │     │  (Browser)   │
│  Pi / Mini   │     │  ┌───────────────┐   │     │              │
│  PC)         │◄───►│  │ API Gateway   │   │◄───►│  React SPA   │
│              │gRPC │  │ Auth Service  │   │ WS  │              │
│ ┌──────────┐ │     │  │ State Broker  │   │     └──────────────┘
│ │ MAVLink  │ │     │  │ Mission Svc   │   │
│ │ → gRPC   │ │     │  │ Telemetry DB  │   │
│ └──────────┘ │     │  └───────────────┘   │
│      │       │     └──────────────────────┘
│   Radio/USB  │
│      │       │
│  ┌───▼───┐   │
│  │  ASV  │   │
│  └───────┘   │
└──────────────┘
```

| Критерий | Оценка |
|----------|--------|
| **Сильные стороны** | Максимальная масштабируемость, multi-operator нативно, SaaS-ready, полный audit trail |
| **Слабые стороны** | Требует интернет для управления. Latency: operator → cloud → edge → vehicle |
| **Риски** | При потере cloud-связи — оператор не может управлять аппаратом. Overengineering для малого масштаба. Kubernetes ops cost |
| **Fit for maritime GCS** | ⭐⭐ — неприемлемо для field operator без надёжного интернета |
| **Fit for low-connectivity** | ⭐ — cloud dependency = single point of failure |
| **Implementation complexity** | Очень высокая — microservices, edge gateway, CI/CD, distributed state |
| **Time-to-market** | 16–24+ месяцев до production |

---

### Option D: QGC Fork + API Extraction

**Описание:** Форк QGC с поэтапным выделением API layer поверх существующего C++ backend. QML UI сохраняется на Phase 1; на Phase 2 заменяется на web-based клиент после стабилизации API. Вся MAVLink/FactSystem/Mission логика переиспользуется.

```
┌──────────────────────────────────────────────┐
│          Operator Machine (Laptop)            │
│                                               │
│  Phase 1:                                     │
│  ┌──────────────────────────────────────────┐ │
│  │         QGC (forked)                     │ │
│  │  ┌─────────┐    ┌───────────────────┐   │ │
│  │  │ QML UI  │◄──►│ C++ Backend       │   │ │
│  │  │(existing)│    │ + NEW: REST/WS API│   │ │
│  │  └─────────┘    │ (HttpServer layer) │   │ │
│  │                 └────────┬──────────┘   │ │
│  │                     Serial/UDP          │ │
│  └──────────────────────────┼──────────────┘ │
│                              │                │
│  Phase 2:                    │                │
│  ┌─────────────┐            │                │
│  │ Web UI      │◄─WS/REST──┘                │
│  │ (React)     │                             │
│  └─────────────┘                             │
└──────────────────────────────────────────────┘
```

| Критерий | Оценка |
|----------|--------|
| **Сильные стороны** | Переиспользование проверенного MAVLink engine, FactSystem, MissionManager, FirmwarePlugin. Система операционна с первого дня. `Qt6::HttpServer` уже присутствует в проекте (`src/Utilities/Network/CMakeLists.txt`) |
| **Слабые стороны** | Наследуется Qt vendor lock-in. Навигация по ~200K LOC чужого C++ codebase. QML UI остаётся legacy |
| **Риски** | Merge conflicts при обновлении upstream QGC. Архитектурный drift: API layer может деградировать в бесструктурный прокси без явных границ ответственности. Qt LGPL/Commercial licensing constraints |
| **Fit for maritime GCS** | ⭐⭐⭐⭐ — всё, что работает в QGC, работает сразу. Maritime extensions добавляются инкрементально |
| **Fit for low-connectivity** | ⭐⭐⭐⭐⭐ — offline-first поведение наследуется от QGC полностью |
| **Implementation complexity** | Низкая для Phase 1 (API layer поверх существующего). Средняя для Phase 2 (web UI) |
| **Time-to-market** | **3–5 месяцев** до MVP с API layer + maritime customizations |

---

## 5. Decision Matrix

Оценка по шкале 1–5, где 5 — лучший результат для данного критерия.

### 5.1 Веса и их обоснование

| Вес | Критерии | Обоснование |
|-----|----------|-------------|
| **×3** | Safety, Offline resilience, Latency, Operational suitability | Hard constraints для maritime field operations. Потеря аппарата на воде = финансовый и репутационный ущерб. Без offline — система бесполезна. Latency >500ms при ручном управлении — safety risk |
| **×2** | Security, Extensibility (API), Team complexity, Cost, Overengineering risk | Важные, но гибкие факторы. Security наращивается инкрементально. Extensibility — вопрос чистоты API boundaries, не runtime isolation |
| **×1** | Scalability | При 1–5 судах масштабируемость — не приоритет Phase 1 |

> **Чувствительность весов:** При изменении A1 (1–5 → 50+ vessels) или A2 (field → command center) Scalability вырастает до ×3, Security — до ×3. Все оценки применимы к допущениям, зафиксированным в §2.

### 5.2 Матрица оценок

| Критерий | Вес | Option A | Option B | Option C | Option D |
|----------|-----|:--------:|:--------:|:--------:|:--------:|
| **Safety impact** | ×3 | 5 | 4 | 2 | 5 |
| **Offline resilience** | ×3 | 5 | 4 | 1 | 5 |
| **Latency** | ×3 | 5 | 4 | 2 | 5 |
| **Security (Phase 1 baseline)** | ×2 | 2 | 3 | 5 | 2 |
| **Scalability** | ×1 | 2 | 3 | 5 | 2 |
| **Extensibility (API integration)** | ×2 | 4 | 4 | 4 | 3 |
| **Operational suitability** | ×3 | 5 | 3 | 2 | 5 |
| **Team complexity** | ×2 | 3 | 3 | 1 | 4 |
| **Cost of implementation** | ×2 | 3 | 3 | 1 | 5 |
| **Risk of overengineering** | ×2 | 5 | 3 | 1 | 5 |

> **Security:** Матрица отражает Phase 1 baseline. MAVLink Signing доступен во всех вариантах. Option D и A имеют низкий балл по Security не из-за архитектурного ограничения, а потому что RBAC отсутствует на Phase 1 при наличии открытого REST API. Option B=3: shared backend упрощает добавление auth layer в рамках той же фазы. Детальный анализ по фазам — в §5.4.

> **Extensibility:** Критерий оценивает возможность внешней API-интеграции, не UI extensibility. Option D имеет оценку 3 (REST/WS API обеспечивает integration extensibility). UI extensibility рассматривается отдельно: в Option D UI заменяется через API boundary на Phase 2, в Option A — через IPC. Оба пути реализуемы.

### 5.3 Взвешенные результаты

| Option | Расчёт | Итого |
|--------|--------|-------|
| **D (QGC Fork)** | (5×3)+(5×3)+(5×3)+(2×2)+(2×1)+(3×2)+(5×3)+(4×2)+(5×2)+(5×2) | **100** |
| **A (Edge Desktop)** | (5×3)+(5×3)+(5×3)+(2×2)+(2×1)+(4×2)+(5×3)+(3×2)+(3×2)+(5×2) | **96** |
| **B (Hybrid)** | (4×3)+(4×3)+(4×3)+(3×2)+(3×1)+(4×2)+(3×3)+(3×2)+(3×2)+(3×2) | **80** |
| **C (Cloud-Native)** | (2×3)+(1×3)+(2×3)+(5×2)+(5×1)+(4×2)+(2×3)+(1×2)+(1×2)+(1×2) | **50** |

### 5.4 Security по фазам

Профиль безопасности определяется не только архитектурным вариантом, но и фазой реализации:

| Атрибут безопасности | Option A | Option B | Option C | Option D |
|---------------------|:--------:|:--------:|:--------:|:--------:|
| MAVLink Signing (integrity) | ✅ новая реализация | ✅ | ✅ | ✅ существующий код |
| Transport encryption (DTLS) | Добавляется | Добавляется | Builtin | Добавляется |
| RBAC / Auth | Phase 2 | Phase 1 | Builtin | Phase 2 |
| Audit log | Phase 1 | Phase 1 | Builtin | Phase 1 |
| Attack surface | Меньше (offline-first) | Средняя | Максимальная | Меньше (offline-first) |

**Вывод:** Option D и A имеют меньшую attack surface за счёт offline-first архитектуры, но требуют явного добавления auth на Phase 2. RBAC реализуется в рамках одного и того же планового этапа для обоих вариантов.

### 5.5 Сравнение D vs A

| Фактор | Option D (Fork) | Option A (Greenfield) |
|--------|----------------|----------------------|
| TTM до работающей GCS | **3–5 мес** | **10–14 мес** |
| Архитектурная чистота | Низкая (наследует legacy) | Высокая (clean slate) |
| Extensibility ceiling | Ограничен Qt/C++ | Высокий (modern stack) |
| Баг-риск критического пути | Низкий (proven code) | Выше (новый MAVLink engine) |
| Qt license risk | Да (LGPL/Commercial) | Нет |

---

## 6. What Not to Put into Core Too Early

### 6.1 Swarm-first thinking

**Контекст:** Типичная maritime операция — 1–3 судна. Даже крупные военно-морские программы ASV оперируют группами по 5–10 единиц.  
**Вывод:** Не проектировать message broker и distributed state для 100+ аппаратов. QGC поддерживает multi-vehicle через `MultiVehicleManager` — in-memory state достаточен для 5–10 vehicles. Swarm coordination — отдельный сервис, Phase 3+.

### 6.2 Microservices everywhere

**Контекст:** При 2–5 разработчиках каждый дополнительный сервис — это отдельный deployment pipeline, monitoring, failure mode и точка сложности без роста производительности.  
**Вывод:** Монолитный backend process с модульной внутренней архитектурой (clean boundaries, единый binary). Выделять service только когда модуль требует независимого масштабирования.

### 6.3 Full cloud dependency

**Контекст:** В открытом море LTE-покрытие спорадично. Спутниковая связь — дорогостояща и медленна. У берега Wi-Fi может отсутствовать.  
**Вывод:** Cloud — для аналитики, хранения, remote access. Никогда — для control loop. Arm, guided nav, emergency stop — работают без сети.

### 6.4 VR/AR as core

**Контекст:** VR/AR добавляет hardware dependency и latency. Полевой оператор у воды — не VR persona.  
**Вывод:** Не включать в core. Исследование как visualization layer поверх API — Phase 3, при наличии специализированных клиентов (defense, research).

### 6.5 AI as decision-maker

**Контекст:** Autonomous decision-making для морских аппаратов регуляторно ограничено (IMO, COLREGS). AI не обеспечивает детерминированное поведение, критичное для safety systems.  
**Вывод:** AI — только для аналитики (anomaly detection, path optimization). Не для control loops. Оператор принимает решения, AI — advisory role.

### 6.6 Plugin ecosystem overcomplication

**Контекст:** Plugin SDK требует documentation, versioning, compatibility matrix, community support. При малой команде SDK будет поддерживать тот же человек, который им пользуется.  
**Вывод:** Модульная архитектура внутри monorepo — да. Публичный plugin API с WASM/micro-frontend isolation — только при появлении >3 внешних потребителей.

### 6.7 Concurrent operator control без explicit lock

**Контекст:** REST/WS API layer создаёт возможность параллельного подключения нескольких клиентов. Два клиента, одновременно отправляющих `ARM` или `RTL`, создают неопределённое состояние на борту — аппарат получает оба `MAVLink COMMAND_LONG`. В aerospace GCS этот паттерн называется «operator authority conflict» и является safety issue, не UX issue.

**Вывод:** API layer обязан решить вопрос single controlling operator **на Phase 1**.

- **Phase 1 (минимальный):** advisory lock — UUID токен активного оператора. При попытке захвата управления другим клиентом — явное предупреждение. Без lock API небезопасен даже в single-operator среде (случайная вторая вкладка браузера).
- **Phase 2:** hard exclusive lock через RBAC.

### 6.8 Web-only control для критических workflow

**Контекст:** Web Serial API доступен в Chromium с Chrome 89 (не Firefox, не Safari). Браузер не гарантирует persistent WebSocket при фоновой вкладке, foreground execution, предсказуемые GC pauses. Случайное закрытие вкладки при управлении судном — недопустимый risk profile.

**Вывод:** Desktop client для управления. Web — для monitoring, planning, post-analysis. Выбор desktop framework (Tauri vs Electron vs Qt) — отдельное архитектурное решение с собственными trade-offs.

---

## 7. Recommended Direction

### 7.1 Архитектурный вектор

**Рекомендация: Option D (QGC Fork + API extraction) на Phase 1 с последующей миграцией к Option A или B.**

Обоснование:

- Maritime field operations требуют offline-first, low-latency, native serial access — QGC покрывает это с Day 1
- Greenfield переписка (Option A) несёт риск TTM 10–14 мес. на неподтверждённом продукте
- Форк + API layer: 3–5 мес. до MVP при закладке фундамента для декаплинга UI
- API layer (REST + WebSocket) между backend и UI — инвестиция в будущую заменяемость UI
- Миграция с Qt на Rust/Go/Tauri — Phase 2–3 при подтверждённом product-market fit

> **Trade-off:** Option D = быстрый выход, но с техническим потолком. При росте до enterprise platform потребуется переход к чистой архитектуре. Вопрос не «делать или не делать переход», а «когда» — сейчас (риск переписки без валидированного продукта) или позже (риск legacy lock-in).

> **Qt HttpServer caveat:** `Qt6::HttpServer` — embedded HTTP модуль без production-grade features: нет middleware pipeline, нет type-safe routing, нет OpenAPI schema generation, нет rate limiting. Весь routing и JSON serialization — ручной код. При ~10–15 endpoints (Phase 1) это управляемо. При росте до ~50+ endpoints (Phase 2) — maintenance overhead потребует миграции на полноценный HTTP framework (cpp-httplib, uWebSockets, или смена runtime). Этот переход следует планировать явно.

### 7.2 Ключевые архитектурные решения

| Решение | Phase 1 (QGC Fork) | Phase 2+ | Обоснование |
|---------|-------------------|----------|-------------|
| UI framework | **Qt Quick / QML** (existing) | React/Solid + Tauri или Electron | Phase 1 переиспользует существующий UI. Миграция — при стабильном API |
| Backend runtime | **C++ (Qt)** — существующий QGC backend | Rust или Go | Переписка нецелесообразна на Phase 1. Рассматривается при Qt license или extensibility блокере |
| API protocol | **REST (Qt HttpServer) + WebSocket** | Тот же API, другой runtime | `Qt6::HttpServer` присутствует в проекте. WS — через `QWebSocketServer` |
| MAVLink layer | **Существующий QGC MAVLink engine** | Rust `mavlink` crate или MAVSDK | Смена реализации — только при смене runtime |
| Storage | **SQLite** (params, offline maps, missions, settings) | Тот же | Zero-config, embedded, проверен в production |
| Telemetry recording | **`.tlog` + `saveCsvTelemetry` по умолчанию** | Structured SQLite tables + Parquet export | Существующий механизм расширяется, не заменяется |
| Video | **GStreamer (Qt plugin)** | GStreamer → WebRTC endpoint для web UI | Phase 1: существующий pipeline. Phase 2: WebRTC endpoint для web UI |
| Maritime extensions | **C++ modules** (AIS parser, depth monitor, nautical chart overlay) | Backend microservice при выделении | Ключевая maritime функциональность — часть core, не plugin |

### 7.3 Target Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              UI Layer [Phase 2: React/Solid + MapLibre GL]   │
│   ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐ │
│   │ FlyView │  │PlanView │  │SetupView │  │AnalyzeView   │ │
│   └─────────┘  └─────────┘  └──────────┘  └──────────────┘ │
│              [Phase 1: Qt Quick / QML — existing]            │
├──────────────────────┬──────────────────────────────────────┤
│   WebSocket (telem)  │  REST API (CRUD)   │  IPC (Tauri)    │
├──────────────────────┴──────────────────────────────────────┤
│                     Backend Process                          │
│   ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│   │ Vehicle      │  │ Mission       │  │ Maritime        │ │
│   │ State Mgr    │  │ Manager       │  │ Extensions      │ │
│   │ (FactStore)  │  │ (Plan Store)  │  │ (AIS, Depth,    │ │
│   └──────┬───────┘  └──────┬────────┘  │  Weather, MOB)  │ │
│          │                 │           └─────────────────┘ │
│   ┌──────▼─────────────────▼─────┐  ┌─────────────────────┐│
│   │       MAVLink Engine         │  │ Auth / Audit         ││
│   │  ┌────────────────────────┐  │  │ (operator ID +       ││
│   │  │ FirmwareAdapter        │  │  │  action log)         ││
│   │  │ (ArduPilot Boat)       │  │  └─────────────────────┘│
│   │  └────────────────────────┘  │  ┌─────────────────────┐│
│   └──────────────┬───────────────┘  │ SQLite Store         ││
│                  │                  │ (params, maps,       ││
│            Serial/UDP/TCP           │  missions, logs)     ││
│                  │                  └─────────────────────┘│
└──────────────────┼──────────────────────────────────────────┘
                   │
              ┌────▼────┐
              │   ASV   │
              └─────────┘
```

---

## 8. Phase 1 / Phase 2 / Exploratory

### Phase 1: Maritime MVP — 3–5 месяцев

**Цель:** Работающая maritime GCS на базе QGC fork с API layer и boat-specific customizations. Заменяет QGC для single boat operation.

| Компонент | Что реализовать | Критерий готовности |
|-----------|----------------|---------------------|
| **QGC Fork** | Fork, убрать aerial-specific UI (Takeoff, Land, Altitude change), `takeoffItemNotRequired=true` по умолчанию | Boat operator видит только boat-relevant controls |
| **Boat UI customization** | Скрыть aerial-only guided actions, приоритизировать режимы (Manual, Hold, Auto, Guided, RTL), настроить mode visibility | UI оптимизирован для boat операций |
| **API Layer** | REST (Qt HttpServer) + WebSocket (QWebSocketServer) поверх C++ backend. Endpoints: vehicle state, params CRUD, mission CRUD, guided commands, telemetry stream | Внешний клиент получает телеметрию и отправляет команды |
| **Operator lock** | Advisory lock: UUID-токен активного оператора. Предупреждение при попытке параллельного захвата управления | Параллельное управление блокируется на API уровне |
| **Operator Auth** | Operator ID при запуске. Action log (кто, что, когда) в SQLite | Минимальный audit trail |
| **Maritime pre-launch checklist** | Расширить `RoverChecklist.qml`: GPS fix quality, compass status, battery %, anchor confirmation, emergency stop test | Checklist обязателен перед ARM |
| **Telemetry CSV** | Включить `saveCsvTelemetry` по умолчанию, задокументировать schema колонок | Structured telemetry доступна для post-analysis без сторонних инструментов |
| **Failsafe defaults** | `FS_GCS_ENABLE=1`, `FS_ACTION=2` (SmartRTL), `BATT_FS_LOW_ACT=1` (RTL) как boat-safe defaults | Безопасное поведение из коробки без ручной настройки |

**Явно вне Phase 1 scope:** AIS overlay, depth integration, nautical charts, multi-vehicle, remote monitoring, video streaming, web dashboard, new UI framework.

---

### Phase 2: Maritime Professional — 4–6 месяцев после Phase 1

**Цель:** Отдельный UI процесс, multi-vehicle, maritime extensions, optional remote monitoring.

| Компонент | Scope |
|-----------|-------|
| **Multi-vehicle support** | 2–5 одновременных судов, vehicle selector, exclusive control lock per vehicle |
| **AIS overlay** | AIS vessel overlay на карте (NMEA serial primary + internet feed secondary), CPA alert, MMSI lookup |
| **Depth monitoring** | NMEA echosunder integration, depth gauge widget |
| **Drift detection** | Отклонение от запланированного пути — alert оператору |
| **MOB button** | One-click Man Overboard: аппарат направляется к GPS-позиции GCS и держит Loiter |
| **Nautical charts** | OpenSeaMap tiles / S-57 support |
| **Video streaming** | GStreamer → WebRTC → UI widget. PiP и fullscreen |
| **Telemetry recording & replay** | Structured SQLite recording. Log replay mode |
| **Remote monitoring** | Optional backend service (REST API) → read-only web dashboard |
| **Survey patterns** | Grid survey для гидрографических съёмок (sonar, sampling) |
| **Extended pre-launch checklist** | Дополнение к Phase 1: AIS active, depth sensor OK, weather cleared, route reviewed |
| **RBAC** | Roles: operator / observer / admin. Замена advisory lock (Phase 1) на hard exclusive lock |
| **Separate UI process** | Web UI (React) или Tauri app подключается к backend через Phase 1 REST/WS API |

---

### Exploratory (Research — без обязательств)

| Тема | Обоснование исследования | Trigger для активации |
|------|--------------------------|----------------------|
| **Swarm coordination** | Управление >10 ASV одновременно | Fleet operations масштабирование |
| **Edge computing** (Raspberry Pi gateway) | Оператор и радиомодем физически разнесены | Shore-based operations с удалённым модемом |
| **Cloud-native backend** | SaaS-модель или multi-tenant | Коммерциализация продукта |
| **AI-assisted navigation** | Obstacle avoidance, optimal path planning | При наличии training data из реальных операций |
| **COLREGS compliance** | Автоматическое соблюдение правил расхождения | Regulatory requirements для коммерческой эксплуатации |
| **Digital twin** | 3D-визуализация судна и окружения | Enterprise clients (defense, research) |
| **Plugin SDK** | Сторонние вендоры хотят расширять GCS | >3 внешних потребителей с custom UI |
| **VR/AR visualization** | Immersive monitoring | Нишевые клиенты (defense, R&D) |

---

## 9. Final Conclusion

Четыре оцениваемых варианта разделились на два кластера:

**Cloud-native (Option C)** — максимальная масштабируемость, но требует постоянного интернета для управления. Для maritime field operations в условиях нестабильной связи это архитектурно несовместимо с требованиями безопасности. Наименьший итоговый балл по Decision Matrix.

**Edge-first (Options A, B, D)** — все три обеспечивают offline-first и приемлемую safety baseline. Разница в TTM и техническом долге:

- Option A (Greenfield): наилучшая архитектурная чистота, но TTM 10–14 мес. с высоким риском при отсутствии подтверждённого product-market fit.
- Option B (Hybrid): хороший долгосрочный баланс, но sync complexity и два отдельных контура развёртывания увеличивают сложность с первого дня.
- Option D (QGC Fork): наименьший TTM, проверенный MAVLink engine, немедленная offline-ready система — ценой накопленного Qt legacy.

**Рекомендуемый путь — последовательное снижение риска:**

1. **Phase 1 (3–5 мес.):** Option D — форк QGC, API layer, boat UI customization, operator lock, failsafe defaults. Результат: операционная maritime GCS.
2. **Phase 2 (4–6 мес.):** Декаплинг UI через Phase 1 API, maritime extensions, RBAC, remote monitoring.
3. **Phase 3+ (по необходимости):** Миграция backend на Rust/Go при подтверждённом масштабировании и снятии Qt lock-in.

Phase 1 не создаёт архитектурный тупик: API layer, SQLite storage, operator audit log переносятся в чистую архитектуру без потери данных и без переписки бизнес-логики.

**Три условия для пересмотра стратегии:**
1. A1 изменяется: целевой масштаб >20 одновременных судов → рассматривать message broker и distributed state.
2. A2 изменяется: command center вместо field operator → web-first становится приемлемым.
3. Qt license cost становится блокером при коммерческом масштабировании → ускорить миграцию backend на Rust/Go.

---

## Appendix: Glossary

| Термин | Определение |
|--------|-------------|
| **ASV** | Autonomous Surface Vessel — автономный надводный аппарат |
| **AIS** | Automatic Identification System — система автоматической идентификации судов (NMEA 0183) |
| **COLREGS** | International Regulations for Preventing Collisions at Sea (COLREGs 1972) |
| **CPA** | Closest Point of Approach — минимальное расстояние сближения с другим судном |
| **MOB** | Man Overboard — человек за бортом (аварийный сигнал, процедура) |
| **Edge-first** | Архитектурный принцип: вычисления и управление происходят локально, cloud — enhancement |
| **FactSystem** | Паттерн QGC: data-driven система параметров с метаданными (min/max, units, defaults, validation) |
| **S-57 / S-63** | Стандарты электронных навигационных карт (IHO) |
| **Station keeping** | Удержание судна в заданной точке (режим Loiter / Hold) |
| **SmartRTL** | Smart Return-to-Launch — возврат по записанному треку, обходя препятствия |
| **TTM** | Time-to-Market — время от начала разработки до первого рабочего продукта |

## Appendix: Source References

| Утверждение | Источник |
|------------|----------|
| FactSystem покрывает 2000+ параметров | `01_CODEBASE_AUDIT_REPORT.md §1.2`, `04_PRODUCT_LOGIC.md §4` |
| InitialConnectStateMachine — детерминированная синхронизация | `03_DATA_FLOW.md §2–3`, `src/Vehicle/InitialConnectStateMachine.h` |
| ArduPilot Rover/Boat: 15 режимов | `14_BOAT_MODES_AND_BEHAVIOR.md §1`, `ArduRoverFirmwarePlugin.cc:11-46` |
| `supportsNegativeThrust() = true` | `ArduRoverFirmwarePlugin.h:37` |
| `guidedModeChangeAltitude()` → not supported для Rover | `ArduRoverFirmwarePlugin.cc:73-76` |
| Нет RBAC в QGC | `01_CODEBASE_AUDIT_REPORT.md §2.3`, `04_PRODUCT_LOGIC.md §3` |
| `Qt6::HttpServer` linked в проекте | `src/Utilities/Network/CMakeLists.txt:15`, `src/CMakeLists.txt:99` |
| MAVLink Signing реализован | `src/Comms/LinkInterface.cc:41-51` (`initMavlinkSigning()`), `MAVLinkSigning.h` |
| `saveCsvTelemetry` существует | `src/Vehicle/Vehicle.cc:3825`, `src/Settings/MavlinkSettings.h:20` |
| `forwardMavlink` — ретрансляция MAVLink | `src/Comms/MAVLinkProtocol.cc:156-173` |
| `MAV_TYPE_SURFACE_BOAT` обрабатывается в 5 файлах | `APMFirmwarePluginFactory.cc:56`, `APMParameterMetaData.cc:56`, `QGCMAVLink.cc:182,364` |
| 50 критических boat UI actions | `13_UI_ACTION_MAP.md §7` |
| Failsafe рекомендации для boat | `14_BOAT_MODES_AND_BEHAVIOR.md §5.2` |
| Communication Lost блокирует guided actions | `04_PRODUCT_LOGIC.md §6` |
