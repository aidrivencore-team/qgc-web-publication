# Режимы управления и поведение: ArduPilot Boat

Анализ построен на reverse-engineering `ArduRoverFirmwarePlugin.h/cc`, `GuidedActionsController.qml`, `FlightModeIndicator.qml`, `APMFailsafes.VehicleConfig.json`, `RoverChecklist.qml` и `Rover.OfflineEditing.params`.

---

## 1. Полная карта режимов ArduPilot Rover/Boat

*Источник: `ArduRoverFirmwarePlugin.h:5-24`, `ArduRoverFirmwarePlugin.cc:29-46`*

ArduPilot Rover определяет **15 режимов**. Каждый режим зарегестрирован как `APMRoverMode::Mode` enum.

| # | Режим | Enum | ID | CanBeSet | Назначение | Релевантность для boat |
|---|---|---|---|---|---|---|
| 1 | **Manual** | `MANUAL` | 0 | ✅ | Прямое управление: throttle + steering = PWM на сервы | ✅ **Критичен** — ручной контроль |
| 2 | **Acro** | `ACRO` | 1 | ✅ | Rate-based steering (поворот с обратной связью по угловой скорости) | ⚠️ Для опытных |
| 3 | **Learning** | `LEARNING` | 2 | ❌ (deprecated) | Запись движений для воспроизведения | ❌ Deprecated |
| 4 | **Steering** | `STEERING` | 3 | ✅ | Heading-rate + throttle. Руль управляет скоростью поворота, газ — ручной | ✅ **Важен** — комфортное ручное |
| 5 | **Hold** | `HOLD` | 4 | ✅ | **Полная остановка**. Выключить двигатели, оставаться на месте | ✅ **Критичен** — пауза/стоянка |
| 6 | **Loiter** | `LOITER` | 5 | ✅ | Удержание позиции: кружит вокруг точки (radius = `LOIT_RADIUS` = 2m) | ✅ **Критичен** — station keeping |
| 7 | **Follow** | `FOLLOW` | 6 | ✅ | Следование за другим аппаратом или GCS | ⚠️ Если нужно Follow Me |
| 8 | **Simple** | `SIMPLE` | 7 | ✅ | Управление относительно начального heading (не текущего) | ⚠️ Упрощённый пилотаж |
| 9 | **Dock** | `DOCK` | 8 | ✅ | Автоматическая парковка/причаливание к маркеру | ✅ **Критичен** — причаливание |
| 10 | **Circle** | `CIRCLE` | 9 | ✅ | Кружение вокруг точки с заданным радиусом (`CIRC_RADIUS` = 20m) | ✅ Обследование акватории |
| 11 | **Auto** | `AUTO` | 10 | ✅ | Выполнение миссии (plan с waypoints) | ✅ **Критичен** — основной режим |
| 12 | **RTL** | `RTL` | 11 | ✅ | Return To Launch — возврат к точке старта | ✅ **Критичен** — безопасный возврат |
| 13 | **Smart RTL** | `SMART_RTL` | 12 | ✅ | Возврат по пройденному маршруту (обратная перемотка пути) | ✅ **Очень полезен** на воде |
| 14 | **Guided** | `GUIDED` | 15 | ✅ | Навигация к указанной точке через GCS-команду | ✅ **Критичен** — GoTo |
| 15 | **Initializing** | `INITIALIZING` | 16 | ❌ | Загрузка при старте | ❌ Системный |

### Ключевые методы FirmwarePlugin для Rover

*Источник: `ArduRoverFirmwarePlugin.cc:78-91`*

```
pauseFlightMode()     → "Hold"        (остановка)
stabilizedFlightMode() → "Manual"     (базовый стабилизированный)
followFlightMode()    → "Follow"      (следование за GCS)
supportsNegativeThrust() → true       (задний ход!)
supportsSmartRTL()    → true          (возврат по треку)
guidedModeChangeAltitude() → "Change altitude not supported" (нет высоты для лодки!)
```

> **Важно:** `supportsNegativeThrust() = true` — лодка поддерживает задний ход, что отличает её от коптеров.

---

## 2. Как режимы отображаются в интерфейсе

### 2.1 Flight Mode Indicator (Toolbar)

*Источник: `FlightModeIndicator.qml:42-47`*

На тулбаре FlyView отображается текущий режим как текстовая метка:
```
[🛫] Manual    ← текущий режим
```

**Нажатие** → Drawer со списком всех доступных режимов. Каждый режим = `QGCDelayButton` с задержкой подтверждения (если `requireModeChangeConfirmation = true`).

### 2.2 Фильтрация режимов

*Источник: `FlightModeIndicator.qml:97-118`*

Режимы фильтруются через `FlightModeSettings`:
- `apmHiddenFlightModesRoverBoat` = `""` (пустая строка по умолчанию)
- Это значит: **для Rover/Boat ни один режим не скрыт!**
- Оператор видит все 13 активных режимов (Learning и Initializing имеют `CanBeSet = false`)

Пользователь может включить Edit Mode и скрыть ненужные режимы через checkbox-слайдеры.

### 2.3 Переключение режима

*Источник: `FlightModeIndicator.qml:156-170`*

Процесс:
1. Оператор нажимает на кнопку режима
2. Если `requireModeChangeConfirmation = true` → удерживает кнопку (QGCDelayButton)
3. Отправляется `activeVehicle.flightMode = modelData`
4. Vehicle.cc отправляет MAVLink `SET_MODE` команду
5. Aппарат подтверждает через `HEARTBEAT.custom_mode`

---

## 3. Guided Actions — действия оператора

*Источник: `GuidedActionsController.qml:81-143`*

GuidedActionsController определяет **30 action codes**. Для boat доступны не все.

### 3.1 Таблица Guided Actions для Boat

| Action | Код | Условие показа | Что делает | Boat? |
|---|---|---|---|---|
| **Arm** | 4 | `!vehicleArmed && canArm` | ARM (включить двигатели) | ✅ |
| **Force Arm** | 21 | `!vehicleArmed` | Принудительный ARM (обход проверок) | ⚠️ Опасно |
| **Disarm** | 5 | `vehicleArmed && !vehicleFlying` | DISARM (выключить двигатели) | ✅ |
| **Emergency Stop** | 6 | `vehicleArmed && vehicleFlying` | **Немедленная остановка моторов!** | ✅ **Критичен** |
| **Start Mission** | 12 | `missionAvailable && !missionActive && !vehicleFlying` | Начать выполнение миссии | ✅ |
| **Continue Mission** | 13 | `missionAvailable && !missionActive && vehicleArmed && vehicleFlying` | Продолжить миссию с текущего WP | ✅ |
| **Pause** | 17 | `vehicleArmed && pauseSupported && vehicleFlying && !vehiclePaused` | Пауза → режим Hold | ✅ **Критичен** |
| **RTL** | 1 | `vehicleArmed && guidedMode && vehicleFlying && !vehicleInRTLMode` | Возврат на базу (+ опция Smart RTL) | ✅ **Критичен** |
| **Go To Location** | 8 | `vehicleFlying` | Навигация к точке на карте | ✅ **Критичен** |
| **Change Speed** | 22 | `vehicleFlying && guidedMode && vehicleArmed && !missionActive` | Изменить мак. скорость (slider) | ✅ |
| **Change Heading** | 27 | `vehicleFlying` | Изменить курс (указать на карте) | ✅ |
| **Set Waypoint** | 9 | — | Указать следующий waypoint миссии | ✅ |
| **Set Home** | 24 | `guidedActionsEnabled` | Задать Home (точку возврата RTL) | ✅ |
| **ROI** | 20 | `vehicleFlying && roiSupported` | Задать точку интереса (камера смотрит туда) | ⚠️ Если камера |
| **Orbit** | 10 | `vehicleFlying && orbitSupported` | Кружение вокруг точки | ⚠️ |
| **Takeoff** | 3 | `supports.guidedTakeoff && !vehicleFlying` | Взлёт (не применимо для boat!) | ❌ |
| **Land** | 2 | `guidedMode && vehicleArmed && !fixedWing && !vehicleInLandMode` | Посадка (не применимо для boat!) | ❌ |
| **Change Altitude** | 7 | `vehicleFlying && guidedMode && vehicleArmed && !missionActive` | Изменить высоту (лодка: "Change altitude not supported") | ❌ |
| **Land Abort** | 11 | `vehicleFlying && fixedWingOnApproach` | Уход на второй круг (Fixed Wing) | ❌ |
| **Loiter Radius** | 30 | `vehicleFlying && fwdFlight && gotoCircle.visible` | Радиус кружения FW | ❌ |
| **MV Arm/Disarm/Pause/Start** | 28,29,18,19 | Multi-vehicle selection | Операции с несколькими аппаратами | ⚠️ Если флот |

### 3.2 Что видит оператор в Guided Bar (FlyView)

Для boat при типичном сценарии:

**До ARM:**
```
[ Arm ] [ Force Arm ] [ Start Mission ]
```

**После ARM, в движении:**
```
[ EMERGENCY STOP ] [ Pause ] [ RTL ] [ Change Speed ] [ Change Heading ]
```
+ возможность тапнуть на карте → GoTo Location

**В режиме Auto (миссия):**
```
[ EMERGENCY STOP ] [ RTL ] [ Set Waypoint ]
```

### 3.3 Slider для выбора значения

*Источник: `GuidedActionsController.qml:201-234`*

Для boat доступен slider при Change Speed:
- Min: 0.1 m/s
- Max: `maximumHorizontalSpeedMultirotorMetersSecond()` (Rover использует MR speed limits)
- Default: maxSpeed / 2

> **Предположение:** Для altitude-based actions (Change Alt, Orbit, Pause) slider показывает высоту, но для boat это нерелевантно — `guidedModeChangeAltitude()` выводит "Change altitude not supported".

---

## 4. Переходы между режимами

### 4.1 Граф переходов (доступные из GCS)

```
                    ┌─────────────┐
                    │ Initializing│
                    └──────┬──────┘
                           │ (авто)
                    ┌──────▼──────┐
            ┌───────│   Manual    │◄──────────┐
            │       └──────┬──────┘           │
            │              │                  │
            ▼              ▼                  │
     ┌──────────┐   ┌──────────┐       ┌──────────┐
     │ Steering │   │  Guided  │◄──────│   Hold   │
     └──────────┘   └────┬─────┘       └──────────┘
                         │                   ▲
                         │                   │ (Pause)
            ┌────────────▼────────────┐      │
            │         Auto            │──────┘
            │  (выполнение миссии)    │
            └────────────┬────────────┘
                         │
              ┌──────────▼──────────┐
              │    RTL / Smart RTL  │
              └─────────────────────┘
```

### 4.2 Программные переходы

*Источник: `GuidedActionsController.qml:334-338`*

QGC определяет специальные режимы через Vehicle properties:
```javascript
pauseFlightMode    = "Hold"      // Pause → Hold
rtlFlightMode      = "RTL"       // RTL action
smartRTLFlightMode = "Smart RTL" // Smart RTL option
missionFlightMode  = "Auto"      // Mission → Auto
landFlightMode     = undefined   // У Rover нет Land mode!
```

### 4.3 Переходы, специфичные для boat

| Из режима | В режим | Триггер | Примечание |
|---|---|---|---|
| Manual | Guided | Тап на карте → GoTo | Автоматический переход |
| Manual | Auto | Start Mission button | Начало миссии |
| Auto | Hold | Pause button | Пауза миссии |
| Any | RTL | RTL button | Возврат на базу |
| Any | Hold | Emergency Stop | Моторы стоп |
| Auto | Guided | Set Waypoint | Переключение на указанный WP |
| Any | Manual | Режим на toolbar | Ручное управление |
| Hold | Auto | Continue Mission | Продолжение после паузы |

---

## 5. Failsafes — аварийные режимы для Rover/Boat

*Источник: `APMFailsafes.VehicleConfig.json:277-751`, `Rover.OfflineEditing.params:401-410`*

### 5.1 Rover-специфические Failsafes (из JSON config)

QGC показывает rover-специфичные failsafe секции когда `showWhen: "_roverFirmware"` (определяется наличием параметра `MODE1`).

| Failsafe | Параметр | Default | Варианты действий |
|---|---|---|---|
| **GCS (потеря связи)** | `FS_GCS_ENABLE` | 0 (выкл) | 0=Disabled, 1=Enabled, 2=Enabled+Ignore Auto |
| GCS Timeout | `FS_GCS_TIMEOUT` | 5 сек | Время ожидания heartbeat |
| GCS Ignore in Hold | `FS_OPTIONS` bit 1 | off | Не срабатывать если в Hold |
| **Throttle (потеря RC)** | `FS_THR_ENABLE` | 1 (вкл) | 0=Disabled, 1=Enabled, 2=Enabled+Ignore Auto |
| Throttle PWM threshold | `FS_THR_VALUE` | 910 | PWM ниже которого = failsafe |
| Throttle Timeout | `FS_TIMEOUT` | 1.5 сек | Время ожидания |
| **Failsafe Action** | `FS_ACTION` | 2 (Hold) | 0=Nothing, 1=RTL, 2=Hold, 3=SmartRTL/RTL, 4=SmartRTL/Hold, 5=Terminate, 6=Loiter/Hold |
| **EKF (потеря навигации)** | `FS_EKF_ACTION` | 1 (Hold) | 0=Disabled, 1=Hold, 2=Report only |
| EKF Threshold | `FS_EKF_THRESH` | 0.8 | Порог ошибки EKF |
| **Crash Check** | `FS_CRASH_CHECK` | 0 (выкл) | 0=Disabled, 1=Hold, 2=Hold+Disarm |
| **Battery Low** | `BATT_FS_LOW_ACT` | 0 | Действие при низком заряде |
| **Battery Critical** | `BATT_FS_CRT_ACT` | 0 | Действие при критическом заряде |

### 5.2 Рекомендации для boat

| Failsafe | Рекомендуемое | Обоснование |
|---|---|---|
| `FS_GCS_ENABLE` | **1** (Enabled) | На воде потеря связи = drift → нужен автоматический ответ |
| `FS_GCS_TIMEOUT` | **5-10** сек | Дать время на переподключение |
| `FS_ACTION` | **3** (SmartRTL/RTL) | Вернуться по пройденному маршруту |
| `FS_THR_ENABLE` | **1** (Enabled) | RC fallback обязателен |
| `FS_EKF_ACTION` | **1** (Hold) | Потеря GPS → остановиться |
| `FS_CRASH_CHECK` | **1** (Hold) | На воде "crash" = застревание → Hold |
| `BATT_FS_LOW_ACT` | **1** (RTL) | Вернуться на базу при низком заряде |
| `BATT_FS_CRT_ACT` | **2** (Hold) | Остановиться при критическом разряде |

### 5.3 UI Failsafe в QGC

Failsafe настройки доступны через:
- **Vehicle Setup → Failsafes** (APMFailsafesComponent)
- Summary показывает: Throttle failsafe, Failsafe Action, Crash Check, Battery states
- Каждая секция условно показывается только для Rover (showWhen: `_roverFirmware`)

---

## 6. Pre-Flight Checklist для Rover

*Источник: `RoverChecklist.qml:1-71`*

QGC предоставляет 3-этапный чеклист для Rover:

### Этап 1: "Rover Initial Checks"
| Проверка | Тип | Условие |
|---|---|---|
| **Hardware** | Ручная | "Battery mounted and secured?" |
| **Battery** | Автоматическая | `failurePercent: 40` (≥40% заряда) |
| **Sensors Health** | Автоматическая | Системная проверка сенсоров |
| **GPS** | Автоматическая | `failureSatCount: 9` (≥9 спутников, с возможностью override) |
| **RC** | Автоматическая | RC-приёмник привязан |

### Этап 2: "Please arm the vehicle here"
| Проверка | Тип | Условие |
|---|---|---|
| **Mission** | Ручная | "Please confirm mission is valid (waypoints valid, no terrain collision)." |
| **Sound** | Автоматическая | Звуковые оповещения работают |

### Этап 3: "Last preparations before launch"
| Проверка | Тип | Условие |
|---|---|---|
| **Payload** | Ручная | "Configured and started? Payload lid closed?" |
| **Wind & weather** | Ручная | "OK for your platform?" |
| **Mission area** | Ручная | "Mission area and path free of obstacles/people?" |

> **Замечание для boat:** Чеклист ориентирован на generic Rover. Для морского сценария нужны дополнительные проверки: состояние воды, течения, глубина, якорь убран, силовые кабели отсоединены.

---

## 7. Aerial-ориентированные элементы UI

Следующие элементы QGC ориентированы на aerial use case и **не релевантны** для boat:

| UI элемент | Где | Почему не для boat |
|---|---|---|
| **Takeoff button** | Guided Bar | `guidedModeChangeAltitude()` → "Change altitude not supported" |
| **Land button** | Guided Bar | `showLand: !fixedWing && !vehicleInLandMode` — для Rover Land mode отсутствует |
| **Change Altitude slider** | Guided Bar | Отклоняется ArduRoverFirmwarePlugin |
| **Altitude limits** | FlyView Settings | `guidedMinimumAltitude/guidedMaximumAltitude` — нерелевантно |
| **Loiter Radius (FW)** | Guided Bar | `showChangeLoiterRadius: _vehicleInFwdFlight` — false для Rover |
| **Land Abort** | Guided Bar | `_fixedWingOnApproach` — only FW |
| **VTOL Transition button** | FlightModeIndicator | `_isVTOL` — false для Rover |
| **Attitude Indicator** | HUD | Pitch/Roll — малозначимы для surface vessel |
| **Altitude tape** | HUD | Высота нерелевантна |
| **Airspeed** | Guided Speed slider | При FW flight → airspeed; для Rover → ground speed |

### Элементы, которые **работают, но с оговорками:**

| UI элемент | Поведение для Rover | Нюанс |
|---|---|---|
| **Compass** | ✅ Показывает heading | Критичен для навигации |
| **Speed indicator** | ✅ Ground speed | В узлах если настроен |
| **GPS status** | ✅ Satellite count, fix type | Критичен |
| **Battery** | ✅ Voltage, percent | Критичен |
| **Distance to Home** | ✅ 2D расстояние | На воде — прямая линия может пересекать берег |
| **Mission progress** | ✅ Waypoint counter | Работает |
| **Obstacle Distance Overlay** | ✅ Если proximity sensor | На воде = другие суда |

---

## 8. Параметры управления скоростью — для boat

*Источник: `Rover.OfflineEditing.params:276-277, 518-520`*

| Параметр | Default | Описание |
|---|---|---|
| `CRUISE_SPEED` | 5.0 m/s (~10 kn) | Крейсерская скорость |
| `CRUISE_THROTTLE` | 30% | Газ для крейсера |
| `RTL_SPEED` | 0.0 (= CRUISE) | Скорость RTL (0 = как CRUISE) |
| `LOIT_RADIUS` | 2.0 m | Радиус Loiter |
| `LOIT_TYPE` | 0 | Тип Loiter (0=Forward/Backward, 1=Clockwise) |
| `CIRC_RADIUS` | 20.0 m | Радиус Circle |
| `CIRC_SPEED` | 0.0 (= CRUISE) | Скорость Circle |
| `DOCK_SPEED` | 0.0 (= автоопределение) | Скорость причаливания |
| `DOCK_STOP_DIST` | 0.3 m | Дистанция остановки при Dock |
| `ATC_ACCEL_MAX` | 1.0 m/s² | Макс. ускорение |
| `ATC_STOP_SPEED` | 0.1 m/s | Скорость "остановки" |

---

## 9. GeoFence для boat

*Источник: `Rover.OfflineEditing.params:372-380`*

| Параметр | Default | Описание |
|---|---|---|
| `FENCE_ENABLE` | 0 (выкл) | Включить GeoFence |
| `FENCE_ACTION` | 1 | Действие: 0=Report, 1=RTL, 2=Hold, 3=SmartRTL/RTL, 4=Brake, 5=SmartRTL/Hold |
| `FENCE_RADIUS` | 300 m | Радиус circular fence |
| `FENCE_TYPE` | 6 | Тип: битовая маска (1=Max circle, 2=Inclusion/Exclusion, 4=Min circle) |
| `FENCE_MARGIN` | 2.0 m | Марж шн от границы |

> **Для boat:** GeoFence критичен для определения зон запрета (берег, мелководье, порт). В новой системе рекомендуется поддержка polygonal и circular zones.

---

## 10. Сводная таблица: режимы → GUI → boat

| Режим | Назначение | Как активируется | Что делает система | Boat? |
|---|---|---|---|---|
| **Manual** | Прямое управление | Toolbar → Manual | Throttle/Steering → PWM. Полный ручной контроль | ✅ Базовый |
| **Acro** | Rate-based steering | Toolbar → Acro | Руль управляет скоростью поворота (deg/s). Throttle ручной | ⚠️ Для опытных |
| **Steering** | Heading-rate управление | Toolbar → Steering | Как Manual, но с автоматическим удержанием курса | ✅ Комфортный ручной |
| **Hold** | Полная остановка | Toolbar/Pause button | Выключает мотор. Лодка дрейфует по инерции/течению | ✅ **Критичен** (пауза) |
| **Loiter** | Удержание позиции | Toolbar → Loiter | Кружит вокруг точки (radius 2m). Station keeping | ✅ **Критичен** (якорная стоянка) |
| **Follow** | Следование за GCS | Toolbar → Follow | Следует за координатами GCS (GPS телефона/ноутбука) | ⚠️ Экспериментальный |
| **Simple** | Упрощённое управление | Toolbar → Simple | Управление относительно начального направления | ⚠️ Для новичков |
| **Dock** | Автопарковка | Toolbar → Dock | Автоматическое причаливание к визуальному маркеру | ✅ **Перспективный** |
| **Circle** | Кружение | Toolbar → Circle | Кружит вокруг текущей точки (radius 20m, speed CRUISE) | ✅ Обследование |
| **Auto** | Выполнение миссии | Start Mission button | Выполняет plan: waypoints, survey patterns, actions | ✅ **Критичен** (основной) |
| **RTL** | Возврат домой | RTL button | Кратчайший путь к Home. Speed = RTL_SPEED или CRUISE | ✅ **Критичен** (безопасность) |
| **Smart RTL** | Умный возврат | RTL button + checkbox | Возврат по записанному пути (обратная перемотка трека) | ✅ **Очень полезен** |
| **Guided** | GCS-навигация | Тап на карте → GoTo | Навигация к указанной точке. Speed = CRUISE | ✅ **Критичен** |
| **Learning** | Запись движений | ❌ Нельзя активировать | Deprecated | ❌ |
| **Initializing** | Загрузка | ❌ Автоматический | При загрузке прошивки | ❌ |

---

## 11. Рекомендации для нового GCS (boat-оптимизированный)

### 11.1 Приоритизация режимов в UI

**Показывать всегда (Primary):**
- Manual, Hold, Auto, Guided, RTL

**Показывать по запросу (Secondary):**
- Steering, Loiter, Smart RTL, Circle, Dock

**Скрыть по умолчанию (Advanced):**
- Acro, Follow, Simple

**Удалить из UI:**
- Learning, Initializing

### 11.2 Guided Actions для boat UI

**Primary Action Bar:**
```
[ ARM/DISARM ] [ START MISSION ] [ PAUSE ] [ RTL ] [ EMERGENCY STOP ]
```

**Context Actions (на карте):**
- Тап → GoTo Location
- Длинный тап → Set Home / ROI
- Drag → Change Heading

**Скрыть:**
- Takeoff, Land, Change Altitude, Land Abort, Loiter Radius change

### 11.3 Новые действия для boat (отсутствуют в QGC)

| Действие | Зачем | Реализация |
|---|---|---|
| **Station Keep** | Удержание точки (не радиус, а точка) | Loiter с малым радиусом + PID |
| **Anchor Drop** | Виртуальная постановка на якорь | Hold + FS_ACTION = Hold |
| **Waypoint Survey Pattern** | Обход зоны | Auto + Survey mission item |
| **Emergency Beacon** | Подать сигнал бедствия | Custom MAVLink Action |
| **Throttle Override** | Ручной газ поверх Auto | Manual override в Guided |

### 11.4 Safety предложения для maritime

| Аспект | Текущее | Рекомендация |
|---|---|---|
| **Drift detection** | FS_CRASH_CHECK (Hold) | Добавить: если drift > N метров из Hold → предупреждение |
| **Depth integration** | Нет | Добавить: остановка при малой глубине |
| **AIS integration** | Нет (AIS_TYPE=0) | Включить AIS → отображение трафика на карте |
| **Man Overboard** | Нет | Кнопка MOB → пометить точку + Hold |
| **Geofence marine** | Circular/Polygon | Добавить навигационные зоны: мели, каналы, порты |
| **Weather hold** | Нет | Авто-Hold при ветре > threshold |
