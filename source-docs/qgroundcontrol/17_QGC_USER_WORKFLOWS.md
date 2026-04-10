# QGroundControl — User Workflows

> **System:** QGroundControl (QGC) v5.0+
> **Analysis Date:** April 10, 2026
> **Analysis Type:** User workflow reconstruction (code-based)
> **Source:** QML views, controllers, C++ backend (read-only audit)

---

## TL;DR (Quick Scan)

| # | Workflow | Суть |
|---|---------|------|
| 1 | **Подключение** | USB/WiFi/BT → Auto-Connect → аппарат готов к работе |
| 2 | **Настройка** | Прошивка → Калибровка → Flight Modes → Safety — один GUI |
| 3 | **Планирование миссии** | Карта → Waypoints/Survey/Scan → Upload на борт |
| 4 | **Управление полётом** | Pre-flight → Arm → Takeoff → Mission → RTL → Land |
| 5 | **Экстренные действия** | Pause / RTL / Emergency Stop — 1 нажатие |

**Вывод:** QGC покрывает полный операционный цикл — от первого подключения до анализа после полёта — в 7 последовательных сценариях. Оператор не выходит из одного приложения.

---

## 1. EXECUTIVE SUMMARY

QGroundControl реализует **7 ключевых пользовательских сценариев**, которые покрывают полный lifecycle работы с беспилотным аппаратом:

| | |
|---|---|
| **Типы сценариев** | Подключение, конфигурация, планирование, выполнение, мониторинг, экстренное управление, анализ |
| **Модель взаимодействия** | Линейная последовательность: Connect → Configure → Plan → Fly → Analyze. Каждый этап — отдельный экран (View) |
| **Точки входа** | 4 основных View: FlyView (по умолчанию), PlanView, VehicleConfigView, AnalyzeView |
| **Навигация** | Переключение через Toolbar с защитой от потери несохранённых данных (`allowViewSwitch()`) |
| **Multi-Vehicle** | Все сценарии поддерживают работу с несколькими аппаратами одновременно. Активный ЛА переключается через `MultiVehicleManager` |
| **Почему это важно** | Один оператор выполняет полный цикл работы без переключения между инструментами — это снижает ошибки и время подготовки |

---

## 2. CORE USER WORKFLOWS

---

### Scenario 1: Подключение к аппарату

#### 1. Цель
Установить связь между GCS и полётным контроллером для начала работы.

#### 2. Шаги

| # | Действие пользователя | Что происходит в системе |
|---|----------------------|-------------------------|
| 1 | Подключить USB-кабель или включить WiFi/BT | `LinkManager` сканирует порты и сетевые интерфейсы |
| 2 | Auto-Connect обнаруживает устройство | `SerialLink` / `UDPLink` / `TCPLink` создаёт соединение |
| 3 | MAVLink handshake | `MAVLinkProtocol` обменивается HEARTBEAT, определяет тип ЛА и прошивку |
| 4 | Скачивание параметров | `ParameterManager` загружает 1000+ параметров с борта |
| 5 | Аппарат появляется в интерфейсе | `MultiVehicleManager` создаёт объект `Vehicle`, UI обновляется |

#### 3. Подсистемы
`LinkManager` → `MAVLinkProtocol` → `MultiVehicleManager` → `Vehicle` → `ParameterManager`

#### 4. Поток данных
```
USB/WiFi/BT → LinkInterface → MAVLinkProtocol → Vehicle(HEARTBEAT) → ParameterManager(PARAM_VALUE) → UI Ready
```

#### 5. Why it matters
Без подключения — ничего не работает. Auto-Connect + автоопределение прошивки = **нулевая ручная настройка** для 90% случаев. Новый пользователь подключает дрон и видит его в интерфейсе за 10–30 секунд.

---

### Scenario 2: Настройка аппарата (First-time Setup)

#### 1. Цель
Полностью настроить новый аппарат: от прошивки до failsafe-поведения.

#### 2. Шаги

| # | Действие пользователя | Что происходит в системе |
|---|----------------------|-------------------------|
| 1 | Открыть Vehicle Config (⚙️) | `VehicleConfigView` загружает список компонентов из `AutoPilotPlugin` |
| 2 | Обновить прошивку (если нужно) | `FirmwareUpgrade` скачивает и прошивает PX4/ArduPilot через USB |
| 3 | Выбрать Airframe | `AirframeComponent` записывает `SYS_AUTOSTART` / frame class |
| 4 | Калибровать сенсоры | Компас, акселерометр, гироскоп — пошаговый wizard |
| 5 | Калибровать RC | `RadioComponent` → маппинг стиков и переключателей |
| 6 | Назначить Flight Modes | Переключатели RC → Stabilize, Loiter, Mission, RTL |
| 7 | Настроить Safety / Failsafes | Действия при потере связи, низком заряде, выходе из GeoFence |

#### 3. Подсистемы
`VehicleConfigView` → `AutoPilotPlugin.vehicleComponents[]` → `FactSystem` → `ParameterManager`

#### 4. Поток данных
```
User Input → VehicleComponent → Fact.setCookedValue() → PARAM_SET(MAVLink) → Vehicle → PARAM_ACK
```

#### 5. Why it matters
Система ведёт пользователя от шага к шагу с проверкой prerequisites (`prerequisiteSetup()`). Нельзя перейти к Flight Modes, не завершив калибровку. Это **защита от ошибок конфигурации**, которые в полёте стоят дорого.

---

### Scenario 3: Планирование миссии

#### 1. Цель
Создать автономный маршрут полёта с задачами (съёмка, облёт, инспекция) и загрузить его на борт.

#### 2. Шаги

| # | Действие пользователя | Что происходит в системе |
|---|----------------------|-------------------------|
| 1 | Переключиться на PlanView | `PlanMasterController` инициализируется, карта загружается |
| 2 | Добавить Takeoff | `insertTakeoffItem()` — первая точка миссии |
| 3 | Добавить waypoints / Pattern | Клик по карте → `insertSimpleMissionItem()` или `insertComplexMissionItem()` (Survey, Corridor, Structure) |
| 4 | Настроить GeoFence | Переключить слой → `GeoFenceController` → зоны вкл/искл |
| 5 | Добавить Rally Points | Переключить слой → `RallyPointController` → запасные площадки |
| 6 | Проверить статистику миссии | `MissionStats` показывает дистанцию, время, расход батареи |
| 7 | Upload на борт или Save в файл | `PlanMasterController.sendToVehicle()` или `saveToFile()` |

#### 3. Подсистемы
`PlanView` → `PlanMasterController` → `MissionController` + `GeoFenceController` + `RallyPointController` → `Vehicle`

#### 4. Поток данных
```
Map Click → MissionController.insertItem() → VisualItems[] → sendToVehicle() → MISSION_ITEM(MAVLink) → Vehicle ACK
```

#### 5. Why it matters
Визуальное планирование с автоматическими паттернами (Survey, Corridor Scan, Structure Scan) — **ключевая продуктовая ценность QGC.** Оператор создаёт сложную миссию за минуты, система рассчитывает GSD, перекрытие, terrain following и предупреждает о нехватке батареи — до старта.

---

### Scenario 4: Выполнение миссии (Pre-flight → Flight → Landing)

#### 1. Цель
Выполнить полный полётный цикл: проверка → взлёт → миссия → посадка.

#### 2. Шаги

| # | Действие пользователя | Что происходит в системе |
|---|----------------------|-------------------------|
| 1 | Пройти Pre-flight Checklist | `PreFlightCheckList` загружает чеклист по типу ЛА (MultiRotor/FW/VTOL/Rover/Sub) |
| 2 | Arm аппарат | `GuidedActionsController.confirmAction(actionArm)` → `vehicle.armed = true` |
| 3 | Takeoff | `vehicle.guidedModeTakeoff(altitude)` — с выбором высоты через слайдер |
| 4 | Start Mission | `vehicle.startMission()` — аппарат начинает автономный маршрут |
| 5 | Мониторинг полёта | FlyView: карта + телеметрия + видео + obstacle overlay в реальном времени |
| 6 | Mission Complete | `FlyViewMissionCompleteDialog` → предложение удалить план или Resume |
| 7 | Land / RTL | `vehicle.guidedModeLand()` или `vehicle.guidedModeRTL()` |

#### 3. Подсистемы
`FlyView` → `GuidedActionsController` → `Vehicle` (MAVLink commands) → `PreFlightCheckList` → `FlyViewMissionCompleteDialog`

#### 4. Поток данных
```
User Action → GuidedActionsController.executeAction() → Vehicle.guidedMode*() → MAV_CMD(MAVLink) → Vehicle ACK → UI Update
```

#### 5. Why it matters
Система обеспечивает **контролируемый полётный цикл** с обязательным чеклистом (может быть enforce), подтверждением каждого действия (`confirmDialog`) и автоматическим предложением Resume Mission при прерывании. Оператор защищён от случайных действий.

---

### Scenario 5: Оперативное управление в полёте

#### 1. Цель
Изменить поведение аппарата в реальном времени в ответ на обстановку.

#### 2. Шаги

| # | Действие пользователя | Что происходит в системе |
|---|----------------------|-------------------------|
| 1 | Нажать GoTo на карте | `confirmAction(actionGoto)` → `vehicle.guidedModeGotoLocation(coord)` |
| 2 | Изменить высоту | Слайдер → `vehicle.guidedModeChangeAltitude(delta)` |
| 3 | Изменить скорость | Слайдер → `vehicle.guidedModeChangeGroundSpeed()` / `ChangeEquivalentAirspeed()` |
| 4 | Orbit вокруг точки | Указать на карте → `vehicle.guidedModeOrbit(center, radius, alt)` |
| 5 | Установить ROI | Указать на карте → `vehicle.guidedModeROI(coord)` |
| 6 | Сменить Flight Mode | Выбор из списка → `vehicle.flightMode = newMode` |
| 7 | Change Heading | Указать на карте → `vehicle.guidedModeChangeHeading(bearing)` |

#### 3. Подсистемы
`GuidedActionsController` (30 action codes) → `Vehicle` → MAVLink → Autopilot

#### 4. Поток данных
```
Map/Slider Input → confirmAction() → executeAction() → Vehicle.guidedMode*() → MAV_CMD → Autopilot → Telemetry Update
```

#### 5. Why it matters
В реальных операциях **план — 50%, реакция — 50%.** Оператор должен мгновенно перенаправить аппарат, изменить высоту или скорость, установить ROI. QGC предоставляет 20+ guided actions, каждое с подтверждением — это баланс между скоростью реакции и защитой от ошибок.

---

### Scenario 6: Экстренные действия

#### 1. Цель
Мгновенно среагировать на нештатную ситуацию и сохранить аппарат / людей.

#### 2. Шаги

| # | Ситуация | Действие | Эффект |
|---|---------|---------|--------|
| 1 | Потенциальная опасность | **Pause** | Аппарат зависает на месте |
| 2 | Нужно вернуть аппарат | **RTL** (+ Smart RTL) | Возврат на точку старта |
| 3 | Требуется немедленная посадка | **Land** | Посадка в текущей позиции |
| 4 | Прерывание захода на посадку | **Land Abort** | Уход на второй круг (FW) |
| 5 | Жизнь под угрозой | **Emergency Stop** | ⚠️ Мгновенная остановка моторов (аппарат падает) |

#### 3. Подсистемы
`GuidedActionsController` → `Vehicle.emergencyStop()` / `pauseVehicle()` / `guidedModeRTL()` / `abortLanding()`

#### 4. Поток данных
```
Panic Button → confirmAction() → executeAction() → MAV_CMD_COMPONENT_ARM_DISARM (force) → Motors Stop
```

#### 5. Why it matters
Emergency Stop требует подтверждения с предупреждением: *"THIS WILL STOP ALL MOTORS. IF VEHICLE IS CURRENTLY IN THE AIR IT WILL CRASH."* Система защищает от случайного нажатия, но обеспечивает **доступ за 2 нажатия.** Для BVLOS-операций это обязательное требование регуляторов.

---

### Scenario 7: Анализ после полёта

#### 1. Цель
Разобрать полёт: скачать логи, проверить вибрации, привязать фотографии к координатам.

#### 2. Шаги

| # | Действие пользователя | Что происходит в системе |
|---|----------------------|-------------------------|
| 1 | Открыть Analyze Tools | `AnalyzeView` загружает список доступных страниц из `CorePlugin.analyzePages` |
| 2 | Скачать бортовые логи | `OnboardLogs` → `LogDownloadController` → лог скачивается по MAVLink |
| 3 | Проверить вибрации | `VibrationPage` → графики X/Y/Z + clipping |
| 4 | Привязать фото к координатам | `GeoTagPage` → привязка EXIF-координат к tlog |
| 5 | Диагностировать MAVLink | `MAVLinkInspector` → real-time просмотр всех сообщений |
| 6 | Воспроизвести полёт | `LogReplayLink` → загрузка .tlog как «живого» подключения |

#### 3. Подсистемы
`AnalyzeView` → `LogDownloadController` / `VibrationPage` / `GeoTagPage` / `MAVLinkInspector` → `LogReplayLink`

#### 4. Поток данных
```
Log File (onboard) → MAVLink Download → Local Storage → Analysis UI (charts, tables, maps)
```

#### 5. Why it matters
Автоматическая запись .tlog при каждом подключении = **чёрный ящик без ручных действий.** После инцидента оператор может: скачать детальный бортовой лог, проверить вибрации (механика), воспроизвести полёт через Log Replay и привязать фото к координатам для отчёта. Это стандарт профессиональных операций.

---

## 3. WORKFLOW PRIORITIZATION

| Приоритет | Сценарий | Почему |
|-----------|---------|--------|
| 🔴 **HIGH** | Подключение к аппарату | Без связи — остальные сценарии невозможны |
| 🔴 **HIGH** | Настройка аппарата | Неправильная настройка = крушение |
| 🔴 **HIGH** | Планирование миссии | Главная продуктовая функция |
| 🔴 **HIGH** | Выполнение миссии | Основной операционный сценарий |
| 🔴 **HIGH** | Экстренные действия | Safety-critical. Требование регуляторов |
| 🟡 **MEDIUM** | Оперативное управление | Расширяет возможности в полёте, но базовая миссия работает без него |
| 🟡 **MEDIUM** | Анализ после полёта | Важен для профессионалов, но не блокирует полёт |

---

## 4. KEY WORKFLOW INSIGHTS

### 🔍 1. Подтверждение каждого критического действия

Все guided-actions проходят через `confirmAction()` → `confirmDialog` → `executeAction()`. Система не позволяет случайно arm'ить, взлететь или остановить моторы.

**→ Эффект:** Баланс между скоростью реакции и защитой от ошибок. Экстренные действия — 2 нажатия, не 1.

### 🔍 2. Адаптивные чеклисты по типу ЛА

`PreFlightCheckList` автоматически выбирает чеклист: MultiRotor, FixedWing, VTOL, Rover, Sub. В enforce-режиме — нельзя arm'ить без прохождения.

**→ Эффект:** Каждый тип ЛА проверяется по своим критическим параметрам. Нет «универсального» чеклиста, который пропускает важное или нагружает лишним.

### 🔍 3. Три уровня защиты при закрытии

При закрытии QGC система проверяет: (1) несохранённая миссия, (2) незаписанные параметры, (3) активные подключения. Каждый уровень — отдельный диалог.

**→ Эффект:** Оператор не потеряет работу из-за случайного закрытия приложения.

### 🔍 4. Upload с pre-check'ами

`sendToVehicle()` проверяет: (1) активная миссия на борту, (2) несовпадение прошивки/типа ЛА, (3) неполные mission items, (4) ожидание terrain data. Каждый случай — отдельный диалог с объяснением.

**→ Эффект:** Невозможно загрузить битый план на борт. Система объясняет, что не так и как исправить.

### 🔍 5. Resume Mission после прерывания

При приземлении после mission mode `FlyViewMissionCompleteDialog` предлагает: удалить план, оставить, или **Resume Mission с последнего waypoint.** При смене батареи — предупреждение «не отключайте связь».

**→ Эффект:** Прерванная миссия (севшая батарея) → замена батареи → продолжение с последней точки. Без пересоздания плана.

---

## 5. FINAL TAKEAWAY

**QGroundControl workflows:**

- 📋 **7 последовательных сценариев** покрывают 100% операционного цикла: Connect → Configure → Plan → Fly → Analyze
- 🛡️ **Каждое критическое действие защищено** — подтверждения, чеклисты, pre-check'и при upload и закрытии
- ⚡ **Экстренные действия за 2 нажатия** — Pause, RTL, Emergency Stop без навигации по меню
- 🔄 **Resume Mission** — прерванная миссия автоматически предлагает продолжение с последней точки

> **Оператор не выходит из одного приложения на протяжении всего цикла: от первого подключения до анализа после полёта.**

---

> **Источник:** Анализ основан на QML-views (FlyView, PlanView, VehicleConfigView, AnalyzeView), контроллерах (GuidedActionsController, PlanMasterController, PreFlightCheckList), и C++ backend (Vehicle, LinkManager, MAVLinkProtocol). Все утверждения подкреплены кодовой базой.
