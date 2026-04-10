# Глубокий анализ Setup / Vehicle Configuration

Документ построен на reverse-engineering анализе QML/C++ кода экрана Vehicle Configuration (~40 файлов). Каждый вывод привязан к конкретному файлу-источнику.

---

## 1. Архитектура экрана Setup

### Общая структура

*Источник: `VehicleConfigView.qml`*

```
┌─────────────────────────────────────────────────────────┐
│              VEHICLE CONFIGURATION VIEW                  │
├──────────────────┬──────────────────────────────────────┤
│                  │                                       │
│  LEFT PANEL      │  RIGHT PANEL (panelLoader)            │
│  ┌────────────┐  │                                       │
│  │🔍 Search.. │  │  ┌─────────────────────────────────┐  │
│  ├────────────┤  │  │                                 │  │
│  │ ✔ Summary  │  │  │   LOADED COMPONENT PAGE         │  │
│  ├────────────┤  │  │                                 │  │
│  │ ● Airframe │  │  │   (SetupPage / ParameterEditor  │  │
│  │   ├ Sub1   │  │  │    / VehicleSummary / Firmware)  │  │
│  │   └ Sub2   │  │  │                                 │  │
│  │ ● ESC/Motor│  │  │                                 │  │
│  │ ● Failsafe │  │  │   Content depends on selection  │  │
│  │ ● FlightMod│  │  │   from left panel               │  │
│  │ ● Gimbal   │  │  │                                 │  │
│  │ ● Joystick │  │  │                                 │  │
│  │ ● Power    │  │  │                                 │  │
│  │ ● Radio    │  │  │                                 │  │
│  │ ● Safety   │  │  │                                 │  │
│  │ ● Sensors  │  │  │                                 │  │
│  │ ● Servo    │  │  │                                 │  │
│  │ ● Tuning   │  │  │                                 │  │
│  ├────────────┤  │  │                                 │  │
│  │  Parameters│  │  │                                 │  │
│  │  Firmware  │  │  └─────────────────────────────────┘  │
│  └────────────┘  │                                       │
└──────────────────┴──────────────────────────────────────┘
```

### Механизм навигации

1. **VehicleConfigView** — корневой компонент экрана. Содержит **левую панель** (дерево компонентов) и **правую панель** (Loader для содержимого).
2. **Left Panel** — формируется динамически из `_activeVehicle.autopilotPlugin.vehicleComponents`. Каждый компонент — это объект `VehicleComponent` (C++), определяющий имя, иконку, QML-источник и состояние настройки.
3. **Навигация:** Клик по компоненту → `_navigateToComponent(compIndex, sectionIndex)` → Loader загружает QML из `vehicleComponent.setupSource`.
4. **Prerequisite check:** Перед открытием компонента проверяется `autopilotPlugin.prerequisiteSetup(component)`. Если зависимость не настроена, вместо компонента показывается сообщение: *"X setup must be completed prior to Y setup"*.
5. **Section tree:** Компоненты, имеющие `vehicleConfigJson()`, автоматически показывают подразделы (sub-items). JSON файлы определяют sections, repeat groups, enable/disable фильтры по параметрам.
6. **Search:** Поле поиска (`QGCTextField`) фильтрует компоненты и секции по имени, включая keywords из JSON.

*Источник: `VehicleConfigView.qml:34-117, 151-184, 315-528`*

### Состояния экрана:

| Состояние | Что показывается | Условие |
|---|---|---|
| **Disconnected** | "Connect vehicle to see configuration" | `!_activeVehicle` |
| **Downloading params** | "Waiting for vehicle parameters..." + "Download Parameters" button | `_activeVehicle && !parametersReady` |
| **Missing params** | "Vehicle did not return full parameter list" | `parameterReadyVehicleAvailable && missingParameters` |
| **No components** | "Does not currently support configuration" | `vehicleComponents.length === 0` |
| **Ready** | Summary page → component tree active | `_fullParameterVehicleAvailable` |

---

## 2. Summary — стартовый экран

*Источник: `VehicleSummary.qml`*

При открытии Setup View показывается **Summary** — сводная панель, содержащая карточки для каждого `VehicleComponent`.

### Каждая карточка содержит:
- **Заголовок** (имя компонента) — кликабельная кнопка, ведущая к настройке.
- **Индикатор** (●) — зелёный если `setupComplete`, красный если нет.
- **Summary Loader** — загружает `summaryQmlSource` компонента, показывая текущие значения ключевых параметров.

### Логика общего статуса:
- Если хотя бы один компонент `requiresSetup && !setupComplete` → предупреждение:
  *"WARNING: Configuration tasks remain before this vehicle is ready to fly."*
- Если все зелёные:
  *"Your vehicle configuration summary appears below."*

**Для boat:** Summary — ключевой экран для быстрой проверки готовности. Красные индикаторы = нельзя запускать миссию.

---

## 3. Компоненты Setup для ArduPilot Rover/Boat

*Источник: `APMAutoPilotPlugin.cc:58-180`*

APM Plugin создаёт компоненты динамически при загрузке параметров. Для Rover/Boat набор определяется условиями:

### Полный список компонентов, создаваемых для Rover/Boat:

| # | Компонент | C++ класс | QML источник | Условие появления | Для boat |
|---|---|---|---|---|---|
| 1 | **Airframe** | `APMAirframeComponent` | `APMAirframeComponent.qml` | Всегда | ✅ Критичен |
| 2 | **Radio** | `APMRadioComponent` | `RadioComponent.qml` → `RemoteControlCalibration.qml` | `vehicle->supports()->radio()` | ⚠️ Зависит от RC |
| 3 | **Flight Modes** | `APMFlightModesComponent` | `APMFlightModesComponent.qml` | Всегда (не Sub v3.5+) | ✅ Критичен |
| 4 | **Sensors** | `APMSensorsComponent` | `APMSensorsComponent.qml` | Всегда | ✅ Критичен |
| 5 | **Power** | `APMPowerComponent` | `APMPowerComponent.qml` (через VehicleConfig JSON) | Всегда | ✅ Важен |
| 6 | **ESC** | `APMESCComponent` | `APMESCComponent.qml` | Всегда | ✅ Важен |
| 7 | **Motor** | `APMMotorComponent` | `APMMotorComponent.qml` | Всегда (не Sub v<3.5.3) | ✅ Важен |
| 8 | **Servo** | `APMServoComponent` | `APMServoComponent.qml` | Если `SERVO1_MIN` существует | ✅ Критичен для boat |
| 9 | **Flight Safety** | `APMFlightSafetyComponent` | `APMFlightSafetyComponent.qml` | Всегда | ✅ Критичен |
| 10 | **Failsafes** | `APMFailsafesComponent` | `APMFailsafesComponent.qml` | Всегда | ✅ Критичен |
| 11 | **Follow Me** | `APMFollowComponent` | `APMFollowComponent.qml` | **Только в DEBUG** + `FOLL_ENABLE` существует | ⚠️ Полезен для boat |
| 12 | **Tuning** | `APMTuningComponent` | *Пустой URL для Rover* | Copter/Sub only | ❌ **Не показан для Rover** |
| 13 | **Gimbal** | `APMGimbalComponent` | `APMGimbalComponent.qml` | Всегда | ⚠️ Зависит от payload |
| 14 | **Remote Support** | `APMRemoteSupportComponent` | `APMRemoteSupportComponent.qml` | Всегда | ⚠️ Вторичен |
| 15 | **Joystick** | `JoystickComponent` | `JoystickComponent.qml` | Всегда | ✅ Важен |
| 16 | **Scripting** | `ScriptingComponent` | `ScriptingComponent.qml` | Всегда | ⚠️ Продвинутый |

### Компоненты, НЕ появляющиеся для Rover/Boat:

| Компонент | Почему | Источник |
|---|---|---|
| **Airspeed** | Параметр `ARSPD_TYPE` не существует у Rover | `APMAutoPilotPlugin.cc:83-87` |
| **Helicopter** | `MAV_TYPE != MAV_TYPE_HELICOPTER` | `APMAutoPilotPlugin.cc:126` |
| **Lights** | `!vehicle->sub()` | `APMAutoPilotPlugin.cc:140-143` |
| **SubFrame** | `!vehicle->sub()` | `APMAutoPilotPlugin.cc:145-149` |
| **Tuning (Copter)** | `setupSource()` возвращает пустой URL для non-Copter/Sub | `APMTuningComponent.cc:12-24` |

### Порядок prerequisite (зависимости):

```
Airframe → Radio → Flight Modes
    ↓         ↓
  Power    Sensors
    ↓
   ESC
    ↓
  Safety
    ↓
  Tuning
```

*Источник: `APMAutoPilotPlugin.cc:182-217`*

---

## 4. Airframe — Frame Class & Type

*Источник: `APMAirframeComponent.qml`, `APMAirframeComponentController.cc`*

### Назначение:
Определяет **физическую конфигурацию** аппарата: тип рамы, количество моторов, их расположение.

### UI элементы:
- **FRAME_CLASS** (Fact ComboBox) — выбор класса рамы: Undefined, Quad, Hexa, Rover, Boat, Sub...
- **FRAME_TYPE** (Fact ComboBox) — тип внутри класса (только для MultiRotor; для Rover — `_frameTypeAvailable: controller.vehicle.multiRotor` = false).
- **Визуальная сетка** карточек — каждая карточка = один Frame Class, с картинкой и подсветкой выбранного.

### Действия пользователя:
1. Кликнуть на карточку Frame Class (например, "Boat"/"Rover").
2. `FRAME_CLASS` устанавливается в значение выбранного класса.
3. **Требуется перезагрузка** после смены Frame Class: *"To change this configuration... reboot the vehicle."*

### Backend:
- `FRAME_CLASS` (Fact, int) — напрямую записывается в параметр MAVLink.
- `APMAirframeComponentController.frameClassModel` — модель данных с изображениями и именами фреймов.

### Для boat:
- **Критичен.** Для Surface Boat нужно выбрать `FRAME_CLASS = 2` (Rover) или аналогичный. В SITL FRAME_CLASS уже установлен при запуске.
- Frame Type не отображается для Rover (логически верно — нет вариантов рамы для Surface Vehicle).

### Доступность в SITL:
- ✅ Полностью доступен. FRAME_CLASS отображается правильно.

---

## 5. Radio — калибровка пульта RC

*Источник: `RemoteControlCalibration.qml`, `APMRadioComponent.cc`, `RadioComponent.qml`*

### Назначение:
Калибровка каналов пульта дистанционного управления (RC). Определяет min/max/trim для stick movements.

### UI элементы:
- **Attitude Controls Monitor** — 4 канала (Roll, Pitch, Yaw, Throttle) с визуальными барами PWM.
- **Calibrate Button** → пошаговый wizard: move sticks to extremes → center sticks → done.
- **Channel Monitor** — отображение PWM значений всех 16+ каналов в реальном времени.
- **Additional Radio Setup** — reverse channels, channel mapping.

### Действия пользователя:
1. Нажать "Calibrate" → начинается пошаговый процесс.
2. Двигать стики в крайние положения по инструкции.
3. Отцентрировать стики → "Next" → "Complete".
4. Результат: записаны RC1_MIN, RC1_MAX, RC1_TRIM... RC16_MIN...

### Backend:
- `APMRadioComponent.setupComplete()` проверяет: все attitude controls mapped (`RCMAP_ROLL/PITCH/YAW/THROTTLE` > 0) и хотя бы один канал откалиброван (min ≠ 1100 || max ≠ 1900 || trim ≠ 1500).
- Параметры записываются напрямую через FactSystem.

### Для boat:
- ⚠️ **Зависит от сценария.** Если лодка управляется только через GCS (без физического пульта), радио не нужно. Если RC-пульт подключён — критично.
- В SITL: RC-входы эмулируются, калибровка возможна, но бессмысленна (канальные параметры уже настроены).

### Доступность в SITL:
- ⚠️ Частично. Каналы видны, wizard запускается, но нет физического пульта для реальной калибровки.

---

## 6. Sensors — калибровка датчиков

*Источник: `APMSensorsComponent.qml`, `APMSensorsComponentController.cc`*

### Назначение:
Калибровка акселерометра, компаса, гироскопа и барометра. Определяет ориентацию платы и правильность показаний.

### UI элементы:
- **Accelerometer** (IndicatorButton) — калибровка путём размещения аппарата на 6 сторонах.
  - Зелёный/красный индикатор (`accelSetupNeeded`).
  - Опция "Simple Accelerometer Calibration" для больших/тяжёлых аппаратов.
- **Compass** (IndicatorButton) — калибровка вращением аппарата в пространстве.
  - Зелёный/красный индикатор (`compassSetupNeeded`).
  - Fast Compass Calibration (по GPS-позиции, без вращения).
  - CompassMot (калибровка влияния моторов).
  - Настройки до 3 компасов: Use, Priority, Orientation, External/Internal.
- **Level Horizon** (Button) — установка горизонта.
- **Gyro** (Button) — калибровка гироскопа (видна для MultiRotor, **Rover** и Sub).
  - Условие видимости: `globals.activeVehicle.multiRotor | globals.activeVehicle.rover | globals.activeVehicle.sub`
- **Pressure / Baro** (Button) — обнуление барометра/глубиномера.
- **Sensor Settings** (Button) — настройка ориентаций без калибровки.

### Backend:
- `APMSensorsComponentController` управляет калибровочными процедурами через MAVLink `MAV_CMD_PREFLIGHT_CALIBRATION`.
- Параметры: `AHRS_ORIENTATION`, `COMPASS_USE/USE2/USE3`, `COMPASS_ORIENT/ORIENT2/ORIENT3`, `COMPASS_AUTODEC`, `COMPASS_DEC`.
- `setupComplete()` проверяет `INS_ACCOFFS_X/Y/Z != 0` (акселерометр) и `COMPASS_OFS_X != 0` (компас).

### Для boat:
- ✅ **Критичен.** Компас обязателен для навигации. Акселерометр нужен для определения крена/дифферента. Гироскоп доступен и важен.
- Barometric calibration: менее важен для surface vehicle (высота = 0), но полезен если есть GPS altitude.

### Доступность в SITL:
- ⚠️ **Ограниченно.** В SITL калибровка датчиков выполняется (команда отправляется), но физического результата нет — датчики симулируются. Параметры `INS_ACCOFFS_*` уже ненулевые в SITL. Compass calibration работает через Fast Calibration (по координатам).

---

## 7. Flight Modes — настройка полётных режимов

*Источник: `APMFlightModesComponent.qml`, `APMFlightModesComponentController.cc`*

### Назначение:
Назначение полётных режимов на позиции переключателя RC (6 позиций, определяемых PWM-диапазонами).

### UI элементы:
- **Flight Mode Channel** — выбор канала RC для переключения режимов (1–8 или Not assigned).
- **Mode 1–6** (FactComboBox) — привязка режима к PWM-диапазону:
  - PWM 0–1230, 1231–1360, 1361–1490, 1491–1620, 1621–1749, 1750+
- **Active mode highlight** — текущий активный режим подсвечивается жёлтым.
- **Simple Mode** / **Super-Simple Mode** — checkboxes (только для Copter, `simpleModesSupported`).
- **Switch Options** — RC Channel Options (RC7_OPTION, RC8_OPTION... RC16_OPTION).

### Backend:
- Параметры: `FLTMODE_CH` (канал), `FLTMODE1`...`FLTMODE6` (режимы), `RC7_OPTION`...`RC16_OPTION` (функции каналов).
- `APMFlightModesComponentController` отслеживает `activeFlightMode` через текущее PWM-значение канала.

### Для boat (ArduRover):
- ✅ **Критичен.** Для Rover/Boat доступны режимы: **Manual**, **Acro**, **Steering**, **Hold**, **Loiter**, **Follow**, **Simple**, **Auto**, **RTL**, **SmartRTL**, **Guided**, **Dock**.
  - **Auto** — выполнение миссии.
  - **Hold** — остановка на месте.
  - **Loiter** — удержание позиции.
  - **Manual** — ручное управление.
  - **RTL** — возврат домой.
  - **Guided** — управление через GCS.
- `_modeParamPrefix` для Rover = `"FLTMODE"` (или `"MODE"` в старых версиях).

### Доступность в SITL:
- ✅ Полностью. Режимы переключаются, activeFlightMode отображается (если эмулируется RC-вход).

---

## 8. Power — настройка питания

*Источник: `APMPowerComponent.cc`, `APMPower.VehicleConfig.json`, `APMBatteryParams.qml`*

### Назначение:
Настройка мониторинга батарей (до 2), calibration voltage divider и amps-per-volt.

### UI элементы (через VehicleConfig JSON):
Страница формируется из JSON-описания `APMPower.VehicleConfig.json`. Содержит:

- **Battery 1 Settings:**
  - Monitor Type (`BATT_MONITOR`) — None, Voltage Only, Voltage+Current, etc.
  - Sensor Pin (`BATT_VOLT_PIN`, `BATT_CURR_PIN`)
  - Voltage Divider (`BATT_VOLT_MULT`) — с диалогом calculate
  - Amps per Volt (`BATT_AMP_PERVLT`) — с диалогом calculate
  - Capacity (mAh) (`BATT_CAPACITY`)
  - Failsafe voltage/capacity thresholds

- **Battery 2 Settings (если BATT2_MONITOR существует):**
  - Аналогичные параметры с префиксом `BATT2_`.

### Действия пользователя:
1. Выбрать тип мониторинга (Voltage Only / Voltage+Current / SMBus...).
2. Настроить множитель напряжения (через dialog "Calculate Voltage Divider" с измеренным напряжением).
3. Настроить amps per volt (через dialog "Calculate Amps per Volt" с измеренным током).
4. Задать ёмкость батареи.

### Backend:
- Все параметры — Facts, привязанные к MAVLink PARAM.
- VehicleConfig JSON определяет layout секций с условиями видимости на основе параметров.

### Для boat:
- ✅ **Важен.** Батарея — критический ресурс. Корректный мониторинг напряжения/тока необходим для failsafe и расчёта оставшегося заряда.
- Калибровка voltage divider возможна только с реальной батареей (не в SITL).

### Доступность в SITL:
- ⚠️ Параметры видны и редактируемы. Но калибровка voltage/current бессмысленна — данные симулируются.

---

## 9. ESC — настройка контроллеров скорости

*Источник: `APMESCComponent.qml`*

### Назначение:
Настройка типа сигнала ESC (PWM, DShot), диапазонов PWM, калибровка ESC.

### UI элементы:
- **Configuration:**
  - Output Type (`MOT_PWM_TYPE`) — Normal, OneShot, OneShot125, DShot150/300/600/1200
  - Output PWM min/max (`MOT_PWM_MIN`, `MOT_PWM_MAX`)
  - Spin when armed / min / max (`MOT_SPIN_ARM`, `MOT_SPIN_MIN`, `MOT_SPIN_MAX`)
  - DShot ESC type / rate (если выбран DShot протокол)
- **Calibration:**
  - Кнопка "Calibrate" → устанавливает `ESC_CALIBRATION = 3`
  - Пошаговая инструкция: отключить USB → подключить батарею → ждать тоны → готово.
  - ⚠ WARNING: "Remove props prior to calibration!"

### Для boat:
- ✅ **Важен.** Тип ESC и диапазон PWM определяют работу моторов (маршевых двигателей). Для boat обычно PWM с настройкой min/max throttle.
- Калибровка ESC — только на реальном hardware.

### Доступность в SITL:
- ⚠️ Параметры видны. Калибровка ESC не работает — нет реального контроллера.

---

## 10. Servo — настройка сервовыходов

*Источник: `APMServoComponent.qml`, `ServoOutputMonitorController`*

### Назначение:
Полная конфигурация до **16 SERVO-выходов**: назначение функции, диапазон PWM, trim, реверс.

### UI элементы:
Таблица с колонками:

| # | Position (µs) | Function | Min | Trim | Max | Reversed |
|---|---|---|---|---|---|---|
| 1 | [████░░░ 1500] | ThrottleLeft ▾ | [-] 1100 [+] | [-] 1500 [+] | [-] 1900 [+] | ☐ |
| 2 | [██░░░░░ 1200] | ThrottleRight ▾ | [-] 1100 [+] | [-] 1500 [+] | [-] 1900 [+] | ☐ |
| 3 | [░░░░░░░ ----] | Disabled ▾ | ... | ... | ... | ☐ |
| ... | ... | ... | ... | ... | ... | ... |

- **Position** — real-time bar с текущим PWM значением (от `ServoOutputMonitorController`).
- **Function** (`SERVOx_FUNCTION`) — ComboBox: Disabled, RCPassThru, Flap, Mount1Yaw, ThrottleLeft, ThrottleRight, GroundSteering, ScriptingN...
- **Min / Trim / Max** (`SERVOx_MIN/TRIM/MAX`) — текстовые поля с кнопками ±1 и auto-repeat при длительном нажатии.
- **Reversed** (`SERVOx_REVERSED`) — checkbox.

### Backend:
- `ServoOutputMonitorController` получает реальные PWM через MAVLink `SERVO_OUTPUT_RAW`.
- Position bar обновляется через сигнал `onServoValueChanged(servo, pwmValue)`.

### Для boat:
- ✅ **Критичен.** Определяет назначение моторов (ThrottleLeft / ThrottleRight для двухмоторной схемы, GroundSteering для рулевого), а также servo для рулевого механизма.
- Типичная конфигурация boat:
  - SERVO1 → GroundSteering (руль)
  - SERVO3 → ThrottleLeft (левый мотор) или Throttle (одномоторная)
  - SERVO4 → ThrottleRight (правый мотор, если дифференциальное управление)

### Доступность в SITL:
- ✅ Полностью. Параметры редактируются. Position bars показывают симулированные значения.

---

## 11. Flight Safety — RTL, GeoFence, Arming

*Источник: `APMFlightSafetyComponent.cc`, `APMFlightSafetyComponentSub.qml`, `APMFlightSafety.VehicleConfig.json`*

### Назначение:
Настройка Return-To-Launch (RTL), геозоны и проверок перед армированием.

### UI элементы (через VehicleConfig JSON):
Для `MAV_TYPE_GROUND_ROVER` загружается `APMFlightSafetyComponent.qml` (основной, не Sub-версия):

| Секция | Параметры |
|---|---|
| **Return to Launch** | `RTL_SPEED` — скорость RTL |
| **GeoFence** | `FENCE_ENABLE` — вкл/выкл, `FENCE_TYPE` — тип (Circle/Polygon), `FENCE_ACTION` — действие при нарушении, `FENCE_RADIUS` — радиус, `FENCE_MARGIN` |
| **Arming Checks** | `ARMING_CHECK` — бит-маска проверок (All, Barometer, Compass, GPS, INS, Parameters, RC, Board voltage, Battery, Airspeed, Logging, Switch, GPS Config, System) |

### Для boat:
- ✅ **Критичен.**
  - **RTL Speed** — скорость возврата домой (очень важна для водного аппарата из-за течений).
  - **GeoFence** — определяет акваторию. Нарушение = RTL / Hold / Report Only.
  - **Arming Checks** — что проверяется перед запуском. Для boat важны: GPS, Compass, Battery.

### Доступность в SITL:
- ✅ Полностью. Все параметры редактируются и применяются.

---

## 12. Failsafes — отказоустойчивость

*Источник: `APMFailsafesComponent.cc`, `APMFailsafesComponentSummary.qml`, `APMFailsafes.VehicleConfig.json`*

### Назначение:
Настройка реакций на отказы: потеря сигнала RC, разрыв GCS, низкий заряд батареи, ошибки EKF.

### Описание для Rover:
`"Configure battery, GCS, throttle, and EKF failsafes."` — специфическое для `MAV_TYPE_GROUND_ROVER`.

### UI элементы (Summary):

| Параметр | Описание | Тип |
|---|---|---|
| **Throttle failsafe** (`FS_THR_ENABLE`) | Потеря сигнала throttle (RC) | ComboBox: Disabled / RTL / Hold / SmartRTL... |
| **Failsafe Action** (`FS_ACTION`) | Действие при throttle failsafe | ComboBox: RTL / Hold / SmartRTL |
| **Failsafe Crash Check** (`FS_CRASH_CHECK`) | Обнаружение "крашей" (внезапная остановка) | ComboBox: Disabled / Hold / HoldAndDisarm |
| **Batt1 low failsafe** (`BATT_FS_LOW_ACT`) | Низкий заряд батареи 1 | ComboBox: None / RTL / Hold / SmartRTL... |
| **Batt1 critical failsafe** (`BATT_FS_CRT_ACT`) | Критически низкий заряд 1 | ComboBox |
| **Batt2 low/critical** (`BATT2_FS_LOW_ACT/CRT_ACT`) | Батарея 2 (если установлена) | ComboBox |

### Дополнительные параметры (через VehicleConfig JSON):
- `FS_GCS_ENABLE` — GCS heartbeat failsafe.
- `FS_EKF_ACTION` — EKF failsafe (Navigation uncertainty too high).
- `FS_EKF_THRESH` — порог EKF failsafe.

### Для boat:
- ✅ **Критичен.** На воде потеря управления может привести к потере аппарата (унесёт течением).
  - **GCS heartbeat** → RTL обязателен.
  - **Battery low** → RTL обязателен.
  - **Crash Check** — полезен (обнаружение наматывания троса на винт и т.д.).
  - **EKF** — важен для GPS-навигации.

### Доступность в SITL:
- ✅ Полностью. Параметры настраиваемы. Можно симулировать failsafe (отключить GCS → наблюдать RTL).

---

## 13. Gimbal — настройка подвеса камеры

*Источник: `APMGimbalComponent.qml`, `APMGimbalInstance.qml`, `APMGimbalParams.qml`*

### Назначение:
Настройка до 2 подвесов (Gimbal 1 / Gimbal 2): тип, протокол, ограничения углов.

### UI:
- Если `instanceCount > 0` — таб-панель Gimbal 1 / Gimbal 2.
- Если `instanceCount == 0` — "Gimbal settings are not available for this firmware version."
- `APMGimbalInstance`: тип подвеса (Servo, SoloGimbal, MavLink), углы min/max для Roll/Pitch/Yaw, Channel mapping, RC targeting rate.

### Для boat:
- ⚠️ **Зависит от payload.** Если на лодке установлена камера — важен. Если нет — не актуален.

### Доступность в SITL:
- ⚠️ Параметры видны, но физического отклика от подвеса нет.

---

## 14. Joystick — настройка джойстика

*Источник: `JoystickComponent.qml`, `JoystickComponentSettings.qml`, `JoystickComponentButtons.qml`*

### Назначение:
Настройка USB-джойстика/геймпада для управления аппаратом через GCS.

### UI:
- **Settings** — выбор джойстика, axis mapping (Roll/Pitch/Yaw/Throttle), inversion, deadzone.
- **Buttons** — привязка кнопок к действиям (Arm, Disarm, RTL, Auto, Hold, Mode switch...).
- **Button Monitor** — визуальная индикация нажатых кнопок.

### Для boat:
- ✅ **Важен.** Джойстик — основной инструмент ручного управления при управлении через GCS (вместо RC-пульта). Для лодки: Yaw = руль, Throttle = газ.

### Доступность в SITL:
- ✅ Полностью (если подключён физический джойстик к компьютеру).

---

## 15. Tuning — PID тюнинг

*Источник: `APMTuningComponent.cc`, `APMTuningComponentCopter.qml`*

### Назначение:
Настройка PID-коэффициентов для управления.

### Для boat (Rover):
- ❌ **НЕ ПОКАЗАН.** `APMTuningComponent.setupSource()` возвращает **пустой URL** для всех типов кроме Copter и Sub.
  ```cpp
  case MAV_TYPE_GROUND_ROVER:
      // implicit fall-through to default
  default:
      return QUrl::fromUserInput(QString()); // empty = not shown
  ```
- PID-тюнинг для Rover выполняется через **Parameters** напрямую (ATC_STR_RAT_P/I/D, ATC_SPEED_P/I/D, CRUISE_SPEED, CRUISE_THROTTLE...).

### Доступność в SITL:
- N/A (компонент не загружается).

---

## 16. Follow Me — режим следования

*Источник: `APMFollowComponent.qml`, `APMFollowComponentController.cc`*

### Назначение:
Настройка Follow Mode: аппарат следует за GCS (по GPS-позиции оператора).

### Условие видимости:
**Только в DEBUG-сборке** (`#ifdef QT_DEBUG`) и при наличии параметра `FOLL_ENABLE`:
```cpp
if ((qobject_cast<ArduCopterFirmwarePlugin*>(...) || qobject_cast<ArduRoverFirmwarePlugin*>(...)) &&
    _vehicle->parameterManager()->parameterExists(-1, "FOLL_ENABLE")) {
```
- Явно поддерживает **ArduRoverFirmwarePlugin** → доступен для boat.

### UI:
- **Enable Follow Me** (Checkbox) → `FOLL_ENABLE = 1` → загрузка доп. параметров (FOLL_SYSID, FOLL_OFS_X/Y/Z, FOLL_DIST_MAX...).
- **Vehicle Position** — Maintain Current Offsets / Specify Offsets.
- **Point Vehicle** — для Copter: Face GCS / Same direction / None. **Для Rover — скрыто** (`!_roverFirmware`).
- **Offsets** — Angle (градусы), Distance (метры). **Height — скрыт для Rover** (`!_roverFirmware`).
- **Графический редактор** — drag-визуализация угла и расстояния с иконками GCS и Vehicle.

### Backend:
- `FOLL_SYSID` → MAVLink System ID GCS (автоматически = `gcsMavlinkSystemID`).
- `FOLL_OFS_TYPE` → Relative (NED).
- `FOLL_OFS_X/Y/Z` → вычисляются из Angle + Distance.
- `FOLL_DIST_MAX` → макс. расстояние перед остановкой.

### Для boat:
- ⚠️ **Потенциально полезен.** Follow Me позволяет лодке следовать за оператором (по GPS телефона/GCS). Но:
  - Доступен только в DEBUG-сборке.
  - Height control скрыт (корректно для boat).
  - Yaw behavior скрыт (boat управляет heading через steering, не через yaw parameter).

### Доступность в SITL:
- ✅ (в DEBUG-сборке). Follow работает, если GCS передаёт свою позицию (heartbeat + GPS GCS position).

---

## 17. Firmware — обновление прошивки

*Источник: `FirmwareUpgrade.qml`, `FirmwareUpgradeController.cc`*

### Назначение:
Прошивка Pixhawk / SiK Radio через USB.

### Условие видимости:
- `!ScreenTools.isMobile` — скрыт на мобильных платформах.
- `_corePlugin.options.showFirmwareUpgrade` — может быть отключён в plugin.
- Показывается **всегда как специальная кнопка** внизу левой панели (не VehicleComponent).

### UI Flow:
1. **Plug in board via USB** → Controller обнаруживает устройство.
2. **Select firmware:** PX4 Pro ↔ ArduPilot.
3. Для ArduPilot: выбор ChibiOS, Vehicle Type (Copter/Plane/Rover/**Boat**/Sub).
4. Выбор конкретной прошивки (stable/beta/dev/custom).
5. **Flash** → прогресс-бар → Done.

### Для boat:
- ✅ **Критичен на реальном hardware.** Позволяет прошить ArduRover firmware на Pixhawk.
- Выбор vehicle type включает **Boat** как отдельный вариант в dropdown.

### Доступность в SITL:
- ❌ **Не применимо.** SITL не требует firmware flash. Кнопка видна, но функциональности для SITL нет.

---

## 18. Parameters — полный редактор параметров

*Источник: `SetupParameterEditor.qml` → `ParameterEditor`*

### Назначение:
Полный доступ ко **всем параметрам** MAVLink (тысячи параметров). Позволяет искать, фильтровать, менять любой параметр.

### Условие видимости:
- `parameterReadyVehicleAvailable && !usingHighLatencyLink && showAdvancedUI`

### UI:
- **Search bar** — поиск по имени/описанию параметра.
- **Category/Group filter** — иерархическая навигация по группам параметров.
- **Parameter list** — каждый параметр: имя, значение (editable), единицы, описание.
- **Reset to default** — для каждого параметра.
- **Refresh All** — перечитать все параметры с борта.

### Для boat:
- ✅ **Критичен** для advanced настройки. Здесь задаются параметры, не доступные через UI-компоненты:
  - `ATC_STR_RAT_P/I/D` — PID рулевого управления.
  - `ATC_SPEED_P/I/D` — PID контроля скорости.
  - `CRUISE_SPEED` — крейсерская скорость.
  - `CRUISE_THROTTLE` — крейсерский газ.
  - `WP_RADIUS` — радиус достижения waypoint.
  - `WP_SPEED` — скорость движения по waypoints.
  - `TURN_RADIUS` — радиус поворота (для boat = радиус циркуляции).
  - `NAV_SPEED_MIN` — мин. скорость навигации.
  - `FS_GCS_ENABLE`, `FS_THR_ENABLE` — failsafes.
  - `MOT_THR_MAX/MIN` — лимиты газа.

### Доступность в SITL:
- ✅ Полностью. Все параметры доступны и редактируются в реальном времени.

---

## 19. Сводная таблица компонентов Setup

| Раздел | Назначение | Доступность в SITL | Релевантность для boat | Комментарий |
|---|---|---|---|---|
| **Summary** | Сводка состояния всех компонентов | ✅ Полная | ✅ Критичен | Показывает готовность к запуску |
| **Airframe** | Выбор Frame Class (Rover/Boat) | ✅ Полная | ✅ Критичен | Для boat: FRAME_CLASS = Rover, Frame Type не показан |
| **Radio** | Калибровка RC-пульта | ⚠️ Частичная | ⚠️ Зависит | Не нужен, если управление только через GCS/Joystick |
| **Sensors** | Калибровка Accel/Compass/Gyro | ⚠️ Частичная | ✅ Критичен | Compass обязателен; в SITL данные симулируются |
| **Flight Modes** | Назначение режимов на RC | ✅ Полная | ✅ Критичен | Auto, Hold, RTL, Guided — основные для boat |
| **Power** | Мониторинг батарей | ⚠️ Частичная | ✅ Важен | Калибровка voltage divider — только на hardware |
| **ESC** | Настройка ESC типа/PWM | ⚠️ Частичная | ✅ Важен | MOT_PWM_TYPE, PWM min/max |
| **Motor** | Тест моторов | ❌ Минимальная | ⚠️ Вторичен | В SITL нет физического отклика |
| **Servo** | Назначение SERVO-выходов | ✅ Полная | ✅ Критичен | Steering/Throttle конфигурация |
| **Flight Safety** | RTL/GeoFence/Arming Checks | ✅ Полная | ✅ Критичен | RTL Speed, Fence Action, Arming Checks |
| **Failsafes** | Реакции на отказы | ✅ Полная | ✅ Критичен | GCS FS, Battery FS, Crash Check, EKF FS |
| **Follow Me** | Режим следования за GCS | ✅ (DEBUG only) | ⚠️ Полезен | Rover-aware: не показывает Height/Yaw |
| **Tuning** | PID тюнинг | ❌ Не показан | ❌ Нет UI | Для Rover — только через Parameters |
| **Gimbal** | Настройка подвеса камеры | ⚠️ Частичная | ⚠️ Зависит | Только если камера установлена |
| **Joystick** | USB-джойстик для управления | ✅ Полная | ✅ Важен | Альтернатива RC-пульту |
| **Remote Support** | Удалённая поддержка | ✅ Полная | ⚠️ Вторичен | Для техподдержки |
| **Scripting** | Lua-скрипты на борту | ✅ Полная | ⚠️ Продвинутый | Automate tasks on vehicle |
| **Parameters** | Полный редактор параметров | ✅ Полная | ✅ Критичен | Единственный способ настроить PID, CRUISE_*, WP_* |
| **Firmware** | Прошивка Pixhawk | ❌ Неприменимо | ✅ (на hardware) | Выбирает ArduRover Boat firmware |

---

## 20. Приоритет разделов для ArduPilot Boat

### Tier 1: Обязательные (настроить первыми)

| # | Раздел | Почему | Ключевые действия |
|---|---|---|---|
| 1 | **Airframe** | Определяет физическую конфигурацию | Выбрать FRAME_CLASS = Rover → Reboot |
| 2 | **Sensors** | Навигация невозможна без откалиброванного компаса | Calibrate Compass → Level Horizon → (Accel) |
| 3 | **Servo** | Назначает моторы/руль на выходы | SERVO1=Steering, SERVO3=ThrottleL, SERVO4=ThrottleR |
| 4 | **Flight Safety** | Безопасность операций: GeoFence + RTL | Включить Fence, настроить RTL Speed, Arming Checks |
| 5 | **Failsafes** | Реакция на потерю связи/заряда | GCS FS → RTL, Battery FS → RTL, Crash Check |

### Tier 2: Важные (настроить до первой миссии)

| # | Раздел | Почему | Ключевые действия |
|---|---|---|---|
| 6 | **Flight Modes** | Определяет доступные режимы | Mode1=Manual, Mode2=Auto, Mode3=RTL, Mode4=Hold, Mode5=Guided, Mode6=Loiter |
| 7 | **Power** | Мониторинг батареи | Включить BATT_MONITOR, задать BATT_CAPACITY |
| 8 | **ESC** | Тип ESC и PWM-диапазон | MOT_PWM_TYPE, PWM_MIN/MAX |
| 9 | **Parameters** | PID-тюнинг и навигационные параметры | CRUISE_SPEED, WP_RADIUS, TURN_RADIUS, ATC_STR_RAT_P/I/D |
| 10 | **Joystick** | Ручное управление через GCS | Назначить Throttle/Yaw, кнопки Arm/RTL/Auto |

### Tier 3: Опциональные

| # | Раздел | Когда нужен |
|---|---|---|
| 11 | **Radio** | Только если используется RC-пульт |
| 12 | **Follow Me** | Для сценария "лодка следует за оператором" |
| 13 | **Gimbal** | Если установлена камера |
| 14 | **Scripting** | Для автоматизации задач на борту |
| 15 | **Remote Support** | Для удалённой техподдержки |

---

## 21. Чеклист для тестирования Setup View с boat (SITL)

### Pre-flight (без подключения):
- [ ] **Disconnected state:** Экран показывает "Connect vehicle to see configuration pages".
- [ ] **Firmware button:** Кнопка Firmware видна (не mobile, showFirmwareUpgrade).
- [ ] **Parameters button:** Скрыта (нет подключённого аппарата).

### Post-connection (после подключения SITL Rover/Boat):
- [ ] **Summary loads:** Показывает карточки со статусом (зелёный/красный).
- [ ] **Component list:** Видны: Airframe, Failsafes, Flight Modes, Flight Safety, ESC, Gimbal, Joystick, Motor, Power, Radio, Remote Support, Scripting, Sensors, Servo.
- [ ] **Tuning absent:** Компонент Tuning **отсутствует** (правильное поведение для Rover).
- [ ] **Airspeed absent:** Компонент Airspeed **отсутствует** (нет ARSPD_TYPE у Rover).
- [ ] **Lights / SubFrame absent:** Только для Sub — не должны появляться для Rover.

### Airframe:
- [ ] FRAME_CLASS отображает текущее значение (Rover/Boat).
- [ ] Frame Type ComboBox **скрыт** (FRAME_TYPE не для Rover).
- [ ] Карточки фреймов отображаются с изображениями.

### Sensors:
- [ ] Кнопки Accel, Compass, Level Horizon, Gyro, Pressure, Sensor Settings — все видны.
- [ ] **Gyro видна** (условие rover = true).
- [ ] Compass calibration запускается (Fast Calibration по координатам).
- [ ] Индикаторы Accel/Compass зелёные (SITL уже откалиброван).

### Flight Modes:
- [ ] 6 режимов отображаются с ComboBox.
- [ ] Текущий активный режим подсвечен жёлтым.
- [ ] Доступны Rover-специфичные режимы (Manual, Auto, RTL, Hold, Guided, Loiter, Steering, Acro, Follow, Simple).
- [ ] Simple Mode / Super-Simple Mode **скрыты** (Rover не поддерживает).

### Servo:
- [ ] Таблица 16 SERVO показывает Position bars (реальные PWM в SITL).
- [ ] Function dropdown содержит Rover-функции (GroundSteering, ThrottleLeft, ThrottleRight).
- [ ] Min/Trim/Max редактируются.

### Flight Safety:
- [ ] Секции RTL, GeoFence, Arming Checks видны.
- [ ] RTL Speed редактируется.
- [ ] FENCE_ENABLE → вкл/выкл.
- [ ] ARMING_CHECK bitmask отображается.

### Failsafes:
- [ ] Throttle failsafe (FS_THR_ENABLE) — ComboBox для Rover.
- [ ] FS_ACTION — ComboBox (RTL / Hold...).
- [ ] FS_CRASH_CHECK — ComboBox.
- [ ] Battery failsafes — видны при BATT_MONITOR > 0.

### Parameters:
- [ ] Поиск работает (ввести "CRUISE" → найти CRUISE_SPEED, CRUISE_THROTTLE).
- [ ] Параметр редактируется → новое значение сохраняется.
- [ ] Refresh All загружает все параметры заново.

### Prerequisite chain:
- [ ] Попытка открыть Flight Modes без настроенного Airframe → сообщение "Airframe setup must be completed prior to Flight Modes setup."
- [ ] Попытка открыть Sensors без настроенного Airframe → сообщение.

### Search:
- [ ] Ввод "safety" в поле поиска → показываются Flight Safety и Failsafes.
- [ ] Ввод "servo" → показывается Servo.
- [ ] Очистка поиска → все компоненты восстановлены.
