# Практический тест-план: QGC + ArduPilot SITL Boat

Основан на reverse-engineering анализе файлов: `ArduRoverFirmwarePlugin.h/cc`, `GuidedActionsController.qml`, `FlightModeIndicator.qml`, `APMFailsafes.VehicleConfig.json`, `RoverChecklist.qml`, `QGCMAVLink.cc`, `Vehicle.cc`, а также всех документов `/docs/analysis/11-17`.

---

## Предварительные требования

### Установка ArduPilot SITL

```bash
# Клонировать ArduPilot
git clone --recurse-submodules https://github.com/ArduPilot/ardupilot.git
cd ardupilot

# Установить зависимости
Tools/environment_install/install-prereqs-mac.sh
# или для Linux:
# Tools/environment_install/install-prereqs-ubuntu.sh

# Запуск SITL Rover в режиме boat
cd ArduRover
sim_vehicle.py --frame=motorboat --map --console
```

**Что ожидать:** SITL запустится и будет слушать на UDP 14550. Аппарат определится как `MAV_TYPE_SURFACE_BOAT` (ID=11), VehicleClass = `RoverBoat`.

### Запуск QGC

```bash
# Собрать QGC (если не собран)
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release --parallel

# Или использовать готовый бинарник
./build/QGroundControl
```

### Альтернатива: Mock Link

Если SITL недоступен, QGC имеет встроенный Mock Link:
- **Settings → Mock Link** (виден только в Debug-сборке, `ScreenTools.isDebug`)
- Ограничение: Mock Link не поддерживает полную логику Rover; параметры могут отсутствовать

---

## Этап 1: Подключение и базовая проверка

### 1.1 Автоматическое подключение

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 1.1.1 | Запустить SITL, затем QGC | QGC автоподключается через UDP 14550 | Время подключения (сек) |
| 1.1.2 | Наблюдать toolbar | Появляется иконка vehicle + режим "Initializing" → "Manual" | Начальный режим |
| 1.1.3 | Проверить индикатор GPS | GPS fix, satellite count (SITL эмулирует ≥10 спутников) | Тип fix, кол-во спутников |
| 1.1.4 | Проверить Battery indicator | Напряжение и %% (SITL эмулирует battery) | Voltage, percent |
| 1.1.5 | Проверить Messages indicator | Статусные сообщения от ArduPilot (calibration, EKF, GPS) | Первые 5-10 сообщений |

**Механизм:** `AutoConnectSettings.autoConnectUDP = true`, `udpListenPort = 14550`.  
**Код:** `AutoConnect.SettingsGroup.json:78` → default port 14550.

**Что подтверждает:** Работоспособность UDP auto-connect pipeline.  
**Гипотеза:** SITL boat определится как `MAV_TYPE_SURFACE_BOAT` (11) и QGC выберет `ArduRoverFirmwarePlugin`.  
**Проверка гипотезы:** `QGCMAVLink.cc:181-183` — `MAV_TYPE_GROUND_ROVER` и `MAV_TYPE_SURFACE_BOAT` обрабатываются одинаково → `VehicleClassRoverBoat`.

### 1.2 Загрузка параметров

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 1.2.1 | Наблюдать progress bar при подключении | Индикатор загрузки параметров 0-100% | Время полной загрузки |
| 1.2.2 | Открыть Settings → Telemetry → Link Status | Packet loss = 0%, latency < 10ms (localhost) | Loss %, latency |
| 1.2.3 | Открыть Analyze → MAVLink Inspector | Видны HEARTBEAT, SYS_STATUS, GLOBAL_POSITION_INT | Список активных msg |
| 1.2.4 | Проверить `HEARTBEAT.type` в Inspector | type = 11 (`MAV_TYPE_SURFACE_BOAT`) | MAV_TYPE value |

**Критерий успеха этапа:** QGC подключён, параметры загружены, vehicle определён как RoverBoat.

---

## Этап 2: Проверка Fly View

### 2.1 Карта и позиция

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 2.1.1 | Открыть Fly View | Карта с маркером аппарата на позиции SITL (обычно -35.363262, 149.165237 — Canberra) | Координаты Home |
| 2.1.2 | Zoom карты | Маркер аппарата виден, Home маркер рядом | Тип иконки маркера (Rover?) |
| 2.1.3 | Проверить compass overlay | Heading indicator показывает текущий курс | Начальный heading |

**Код:** `FlyView.qml` → map component загружает `FlightMap` с vehicle coordinate binding.

### 2.2 HUD / Instrument Panel

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 2.2.1 | Проверить Attitude Indicator (AI) | Показывает pitch/roll (для boat оба ~0) | Значения pitch/roll |
| 2.2.2 | Проверить Compass | Heading в градусах (0-360) | Текущий heading |
| 2.2.3 | Проверить Speed indicator | Ground speed = 0 m/s (стоит на месте) | Значение speed |
| 2.2.4 | Проверить Altitude indicator | Показывает altitude (для boat ~0, нерелевантно) | Значение alt |

**Гипотеза:** Attitude Indicator и Altitude tape будут показывать значения, но они малозначимы для лодки. Speed и Compass — основные.

### 2.3 Guided Action Bar (до ARM)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 2.3.1 | Проверить доступные кнопки | Должны быть: Arm, Force Arm. Возможно: Start Mission | Список видимых кнопок |
| 2.3.2 | Проверить недоступные кнопки | Takeoff не должен быть виден (или виден но неработающий) | Наличие Takeoff |
| 2.3.3 | Проверить Set Home (карта) | Длинное нажатие на карту → "Set Home" / "Go to Location" | Доступные map actions |

**Код:** `GuidedActionsController.qml:125-143`:
- `showArm: !vehicleArmed && canArm`
- `showTakeoff: supports.guidedTakeoffWithAltitude || guidedTakeoffWithoutAltitude`  
**Гипотеза:** Для Rover, `supports.guidedTakeoffWithAltitude` = false, но `supports.guidedTakeoffWithoutAltitude` может быть true → кнопка Takeoff может появиться. Нужно проверить.

---

## Этап 3: Проверка Setup (Vehicle Configuration)

### 3.1 Навигация по Setup

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 3.1.1 | Перейти в Vehicle Setup | Дерево компонентов: Summary, Airframe, Sensors, Radio, Flight Modes, Failsafes, Parameters... | Список всех компонентов |
| 3.1.2 | Проверить Summary | Основные параметры: Firmware, Vehicle, Frame class | Firmware version, frame |
| 3.1.3 | Открыть Airframe | FRAME_CLASS=1 (Rover), FRAME_TYPE=0 (Undefined/Boat) | Значения FRAME_CLASS/TYPE |

**Код:** `APMAutoPilotPlugin.cc` — компоненты регистрируются динамически по `vehicleType`.

### 3.2 Failsafes

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 3.2.1 | Открыть Failsafes | Секции показываются для Rover: Battery, GCS, Throttle, EKF, Crash Check | Видимые секции |
| 3.2.2 | Проверить Throttle Failsafe | `FS_THR_ENABLE=1` (enabled), `FS_THR_VALUE=910` | Текущие значения |
| 3.2.3 | Проверить Failsafe Action | `FS_ACTION=2` (Hold) | Текущее действие |
| 3.2.4 | Проверить GCS Failsafe | `FS_GCS_ENABLE=0` (disabled по умолчанию) | Текущее значение |
| 3.2.5 | Проверить EKF Failsafe | `FS_EKF_ACTION=1` (Hold) | Текущее значение |
| 3.2.6 | Проверить Crash Check | `FS_CRASH_CHECK=0` (disabled) | Текущее значение |

**Код:** `APMFailsafes.VehicleConfig.json:288` → секция для Rover показывается при `_roverFirmware` (наличие параметра `MODE1`).  
**Подтверждённый вывод:** Параметры проверяемы напрямую из `Rover.OfflineEditing.params:401-410`.

### 3.3 Flight Modes

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 3.3.1 | Открыть Flight Modes Setup | 6 каналов RC → привязка к режимам | Текущие MODE1-MODE6 |
| 3.3.2 | Проверить MODE1 | `MODE1=0` (Manual) | Привязка RC channel |
| 3.3.3 | Проверить MODE3 | `MODE3=11` (RTL) | RTL на 3м канале |
| 3.3.4 | Проверить MODE4 | `MODE4=10` (Auto) | Auto на 4м канале |

**Подтверждённый вывод:** `Rover.OfflineEditing.params:567-572` содержит default mode mapping.

### 3.4 Parameters

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 3.4.1 | Открыть Parameters | Полный список параметров с поиском | Общее кол-во параметров |
| 3.4.2 | Найти `CRUISE_SPEED` | = 5.0 m/s | Значение |
| 3.4.3 | Найти `LOIT_RADIUS` | = 2.0 m | Значение |
| 3.4.4 | Найти `FENCE_ENABLE` | = 0 (disabled) | Значение |
| 3.4.5 | Найти `AIS_TYPE` | = 0 (disabled) | Наличие параметра |

---

## Этап 4: Проверка режимов (Flight Modes)

### 4.1 Mode Indicator

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 4.1.1 | Нажать на Flight Mode indicator в toolbar | Drawer со списком режимов | Полный список |
| 4.1.2 | Посчитать доступные режимы | 13 активных: Manual, Acro, Steering, Hold, Loiter, Follow, Simple, Dock, Circle, Auto, RTL, Smart RTL, Guided | Кол-во и названия |
| 4.1.3 | Проверить отсутствие hidden modes | `apmHiddenFlightModesRoverBoat = ""` → ничего не скрыто | Метка "Some Modes Hidden" |

**Код:** `FlightModeIndicator.qml:108-114` — `vehicleClassInternalName()` возвращает `"RoverBoat"` → ищет `apmHiddenFlightModesRoverBoat`.  
**Подтверждённый вывод:** `QGCMAVLink.cc:261` → `vehicleClassToInternalString(VehicleClassRoverBoat) = "RoverBoat"`.

### 4.2 Переключение режимов (без ARM)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 4.2.1 | Выбрать Hold | Режим меняется → "Hold" | Подтверждение в toolbar |
| 4.2.2 | Выбрать Loiter | Режим меняется → "Loiter" | Подтверждение |
| 4.2.3 | Выбрать Manual | Режим меняется → "Manual" | Подтверждение |

**Гипотеза:** Переключение режимов работает без ARM для Rover (в отличие от коптеров, некоторые режимы требуют ARM).  
**Механизм:** `Vehicle::setFlightMode()` → `MAV_CMD_DO_SET_MODE` → SITL.

---

## Этап 5: Проверка Plan View

### 5.1 Создание простой миссии

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 5.1.1 | Перейти в Plan View | Карта с Home маркером | Загрузка корректная |
| 5.1.2 | Тапнуть на карту 3 раза | 3 waypoint создаются (WP1, WP2, WP3) | Кол-во WP |
| 5.1.3 | Проверить панель справа | Mission items list с высотой, скоростью, координатами | Содержание панели |
| 5.1.4 | Проверить altitude default | `defaultMissionItemAltitude = 50m` (нерелевантно для boat!) | Значение altitude |
| 5.1.5 | Проверить speed | `offlineEditingCruiseSpeed` → 15 m/s | Скорость в mission |

**Код:** `PlanView.qml` → `PlanMasterController` управляет mission items.

### 5.2 Takeoff item

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 5.2.1 | Проверить предупреждение о takeoff | Если `takeoffItemNotRequired = false` (default), QGC может предупредить | Наличие warning |
| 5.2.2 | Установить `takeoffItemNotRequired = true` | Settings → Plan View → Takeoff = Not Required | Повторная проверка |

**Гипотеза:** Для boat takeoff item бессмыслен, но QGC может требовать его по умолчанию.

### 5.3 Загрузка миссии

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 5.3.1 | Нажать Upload (стрелка вверх) | Миссия загружается в SITL | Статус upload |
| 5.3.2 | Проверить кол-во items в vehicle | SITL отвечает MISSION_ACK | ACK message |
| 5.3.3 | Вернуться в Fly View | Mission line видна на карте | Наличие линии |

---

## Этап 6: Проверка запуска и выполнения миссии

### 6.1 ARM и Start Mission

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 6.1.1 | Нажать Arm | Появляется confirmation dialog → подтвердить | Текст диалога |
| 6.1.2 | Проверить armed state | Toolbar indicator = Armed | Цвет/индикатор |
| 6.1.3 | Нажать Start Mission | Появляется dialog "Takeoff and start" → подтвердить | Текст (содержит "Takeoff"???) |
| 6.1.4 | Наблюдать режим | Переключается на "Auto" | Текущий mode |
| 6.1.5 | Наблюдать движение | SITL boat начинает двигаться к WP1 | Скорость > 0 |

**Код:** `GuidedActionsController.qml:576-577` → `_activeVehicle.startMission()` → `FirmwarePlugin::startMission()`.  
**Гипотеза:** Текст "Takeoff and start the current mission" не совсем точен для boat (нет takeoff). Зафиксировать реальный текст диалога.

### 6.2 Наблюдение за миссией

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 6.2.1 | Наблюдать маркер аппарата | Двигается по линии миссии | Скриншот трека |
| 6.2.2 | Проверить speed indicator | Показывает текущую скорость (должно быть ~CRUISE_SPEED = 5 m/s) | Значение speed |
| 6.2.3 | Проверить heading | Heading меняется при поворотах к WP | Динамика heading |
| 6.2.4 | Проверить mission progress | Current WP меняется: 1 → 2 → 3 | Номер текущего WP |
| 6.2.5 | Проверить ETA / distance | Distance to WP уменьшается | Значение distance |
| 6.2.6 | Дождаться окончания миссии | Аппарат выполняет `MIS_DONE_BEHAVE` (default=0 → Hold) | Поведение после миссии |

---

## Этап 7: Проверка Hold / RTL / Guided / Mode Switching

### 7.1 Hold (Pause)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.1.1 | Во время миссии нажать Pause | Confirmation dialog → подтвердить | Текст диалога |
| 7.1.2 | Проверить режим | Переключается на "Hold" | Текущий mode |
| 7.1.3 | Проверить скорость | Speed = 0 (boat останавливается) | Time to stop |
| 7.1.4 | Наблюдать drift | В SITL без физики воды drift будет 0 | Позиция через 10 сек |

**Код:** `ArduRoverFirmwarePlugin.cc:83-85` → `pauseFlightMode() = "Hold"`.  
**Подтверждённый вывод:** Pause для Rover = Hold mode.

### 7.2 Continue Mission (после Pause)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.2.1 | Нажать Continue Mission | Dialog → подтвердить | Текст |
| 7.2.2 | Проверить режим | Переключается на "Auto" | Mode |
| 7.2.3 | Проверить WP | Продолжает с текущего (не с начала) | Номер WP |

### 7.3 RTL

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.3.1 | Нажать RTL | Confirmation dialog с опцией "Smart RTL" checkbox | Текст + наличие checkbox |
| 7.3.2 | Подтвердить без Smart RTL | Режим → "RTL", boat двигается к Home | Направление движения |
| 7.3.3 | Измерить маршрут RTL | Кратчайший путь к Home (прямая линия) | Скриншот маршрута |
| 7.3.4 | Дождаться прибытия | Boat останавливается у Home | Расстояние от Home |

**Код:** `GuidedActionsController.qml:557-558` → `_activeVehicle.guidedModeRTL(optionChecked)`.

### 7.4 Smart RTL

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.4.1 | Снова запустить миссию, проехать часть | Boat на полпути | Текущая позиция |
| 7.4.2 | Нажать RTL + отметить Smart RTL | Режим → "Smart RTL" | Mode |
| 7.4.3 | Наблюдать маршрут | Boat возвращается по пройденному пути (обратная перемотка) | Скриншот обратного трека |

**Код:** `ArduRoverFirmwarePlugin.h:38` → `supportsSmartRTL() = true`.  
**Гипотеза:** Smart RTL для boat на воде — очень полезно, т.к. прямой путь RTL может пересекать берег.

### 7.5 Guided (GoTo Location)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.5.1 | ARM аппарат в Manual | Armed, Manual mode | Status |
| 7.5.2 | Тапнуть на карту | Контекстное меню: "Go to Location" | Наличие пункта |
| 7.5.3 | Подтвердить GoTo | Режим → "Guided", boat едет к точке | Mode change |
| 7.5.4 | Проверить ограничение дистанции | Точка >1000m → "New location is too far" (если `maxGoToLocationDistance = 1000`) | Сообщение об ошибке |
| 7.5.5 | Boat прибыл к точке | Останавливается (Loiter или Hold) | Поведение при прибытии |

**Код:** `Vehicle.cc:2111-2113` → проверка `maxGoToLocationDistance` → reject если слишком далеко.

### 7.6 Change Speed

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.6.1 | Во время Guided нажать Change Speed | Slider с min/max скорости | Диапазон slider |
| 7.6.2 | Установить новую скорость | Boat меняет скорость | Фактическая скорость |

**Код:** `GuidedActionsController.qml:217-223` → slider для non-FW uses `maximumHorizontalSpeedMultirotorMetersSecond()`.  
**Гипотеза:** Rover использует MR speed limits API, что является architectural quirk.

### 7.7 Change Heading

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.7.1 | Тапнуть на карту → Change Heading | Boat разворачивается в указанном направлении | Новый heading |

### 7.8 Emergency Stop

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 7.8.1 | Во время движения нажать Emergency Stop | **⚠️ КРАСНЫЙ диалог** → "THIS WILL STOP ALL MOTORS" | Текст предупреждения |
| 7.8.2 | Подтвердить | Моторы выключаются, vehicle disarmed | Armed state |

**Код:** `Vehicle.cc:2351-2358` → sends `MAV_CMD_COMPONENT_ARM_DISARM` с magic number 21196.

---

## Этап 8: Проверка Safety / Failsafe логики

### 8.1 Pre-Flight Checklist

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 8.1.1 | Включить checklist: Settings → Fly View → Use Checklist + Enforce | Настройка сохранена | Значения |
| 8.1.2 | Вернуться в Fly View | Чеклист появляется перед ARM | Содержание чеклиста |
| 8.1.3 | Проверить "Rover Initial Checks" | Hardware, Battery(≥40%), Sensors Health, GPS(≥9 sat), RC | Все ли пункты видны |
| 8.1.4 | Пройти чеклист | Все items зелёные → ARM кнопка доступна | Можно ли ARM |
| 8.1.5 | Без чеклиста (Enforce ON) | ARM должен быть ЗАБЛОКИРОВАН до прохождения | Блокировка ARM |

**Код:** `RoverChecklist.qml:16-35` → 5 проверок в первой группе.  
**Подтверждённый вывод:** Чеклист Rover требует ≥40% battery и ≥9 спутников.

### 8.2 GeoFence

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 8.2.1 | Установить `FENCE_ENABLE=1` через Parameters | Fence включён | Подтверждение |
| 8.2.2 | Установить `FENCE_RADIUS=100` | Circular fence 100m | Подтверждение |
| 8.2.3 | Установить `FENCE_ACTION=2` (Hold) | При нарушении → Hold | Подтверждение |
| 8.2.4 | Отправить Guided GoTo за пределы fence | Boat должен остановиться (Hold) при достижении границы | Поведение |
| 8.2.5 | Проверить UI индикацию | QGC должен показать fence breach warning | Наличие warning |

### 8.3 GCS Failsafe (потеря связи)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 8.3.1 | Установить `FS_GCS_ENABLE=1` | GCS failsafe включён | Подтверждение |
| 8.3.2 | Установить `FS_GCS_TIMEOUT=5` | 5 секунд timeout | Подтверждение |
| 8.3.3 | Установить `FS_ACTION=1` (RTL) | При failsafe → RTL | Подтверждение |
| 8.3.4 | ARM и запустить Guided | Boat двигается | Status |
| 8.3.5 | Закрыть QGC (разорвать связь) | SITL console: "GCS failsafe on" через 5 сек | Сообщение в SITL |
| 8.3.6 | Перезапустить QGC | Boat должен быть в RTL mode | Текущий mode |

**⚠️ Внимание:** Закрытие QGC разрывает UDP связь → SITL не получает GCS heartbeat.  
**Гипотеза:** Альтернативно, можно использовать MAVLink forwarding (`forwardMavlink = true`) и наблюдать failsafe через второе подключение.

### 8.4 Battery Failsafe (в SITL ограничено)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 8.4.1 | Проверить `BATT_FS_LOW_ACT` и `BATT_FS_CRT_ACT` | Default = 0 (disabled) | Значения |
| 8.4.2 | Установить `BATT_FS_LOW_ACT=1` (RTL) | При низком заряде → RTL | Подтверждение |

**Ограничение:** SITL эмулирует бесконечную батарею. Для тестирования battery failsafe нужен специальный SITL параметр `SIM_BATT_VOLTAGE` или `SIM_SPEEDUP` для ускорения разряда.

---

## Этап 9: Проверка логов и анализа после миссии

### 9.1 Telemetry Log (.tlog)

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 9.1.1 | Проверить Settings → Telemetry | `telemetrySave = true` (enabled) | Статус записи |
| 9.1.2 | Найти .tlog файл | `savePath/Telemetry/YYYY-MM-DD_HH-MM-SS.tlog` | Путь, размер |
| 9.1.3 | Воспроизвести через Log Replay | Settings → Comm Links → Add Link → Log Replay → выбрать файл | Воспроизведение |
| 9.1.4 | Проверить replay в Fly View | Маршрут и телеметрия воспроизводятся | Корректность данных |

**Код:** `MavlinkSettings.telemetrySave = true`, файлы сохраняются в `AppSettings.savePath/Telemetry/`.

### 9.2 Onboard Logs

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 9.2.1 | Открыть Analyze → Onboard Logs | Список логов на SITL vehicle | Кол-во логов |
| 9.2.2 | Скачать последний лог | Download → `savePath/Logs/` | Путь, размер |

### 9.3 MAVLink Console

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 9.3.1 | Открыть Analyze → MAVLink Console | REPL-терминал к SITL | Доступность |
| 9.3.2 | Ввести `status` (ArduPilot NSH) | Информация о состоянии аппарата | Вывод команды |
| 9.3.3 | Ввести `param show CRUISE_SPEED` | Показывает текущее значение | Значение |

**Код:** `MAVLinkConsolePage.qml:20` → `MAVLinkConsoleController` для embedded NSH shell.

### 9.4 CSV Telemetry

| # | Действие | Ожидаемый результат | Фиксировать |
|---|---|---|---|
| 9.4.1 | Включить Settings → Telemetry → Save CSV Telemetry | `saveCsvTelemetry = true` | Подтверждение |
| 9.4.2 | Выполнить краткую миссию | CSV файл создаётся | Путь, размер |
| 9.4.3 | Открыть CSV | Столбцы: timestamp, lat, lon, alt, speed, heading, battery... | Столбцы |

---

## Матрица тестовых гипотез

| # | Гипотеза | Основание | Как проверить | Статус |
|---|---|---|---|---|
| H1 | SITL boat определится как `MAV_TYPE_SURFACE_BOAT` (11) | `QGCMAVLink.cc:182` | MAVLink Inspector → HEARTBEAT.type | ⬜ |
| H2 | QGC выберет `ArduRoverFirmwarePlugin` | `QGCMAVLink.cc:153-156` | Vehicle Setup → Firmware info | ⬜ |
| H3 | Takeoff кнопка будет видна/скрыта | `GuidedActionsController.qml:129` | Fly View → Guided Bar | ⬜ |
| H4 | "Change altitude not supported" при попытке | `ArduRoverFirmwarePlugin.cc:73-76` | Guided Bar → Change Alt | ⬜ |
| H5 | Smart RTL возвращает по обратному маршруту | `supportsSmartRTL() = true` | RTL с checkbox | ⬜ |
| H6 | Pause = Hold mode | `pauseFlightMode() = "Hold"` | Pause button | ⬜ |
| H7 | Emergency Stop немедленно disarm-ит | `Vehicle.cc:2351-2358` | Emergency Stop в движении | ⬜ |
| H8 | GoTo >1000m отклоняется | `Vehicle.cc:2111-2113` | Tap далеко на карте | ⬜ |
| H9 | Все 13 режимов видны в Drawer | `apmHiddenFlightModesRoverBoat=""` | Flight Mode Drawer | ⬜ |
| H10 | GeoFence breach → Hold | `FENCE_ACTION=2` → Hold | Guided за пределы fence | ⬜ |
| H11 | GCS failsafe через 5с → action | `FS_GCS_TIMEOUT=5, FS_ACTION` | Закрыть QGC | ⬜ |
| H12 | Speed slider для Rover использует MR limits API | `GuidedActionsController.qml:217` | Change Speed slider | ⬜ |
| H13 | `MIS_DONE_BEHAVE=0` → Hold после миссии | `Rover.OfflineEditing.params:561` | Завершение миссии | ⬜ |
| H14 | Altitude в Plan View нерелевантна для boat | Lодка не meняет высоту | Проверить WP altitude UI | ⬜ |
| H15 | Задний ход поддерживается | `supportsNegativeThrust() = true` | Virtual Joystick → throttle назад | ⬜ |

---

## Шаблон для фиксации результатов

```markdown
## Результат теста [номер]

**Дата:** YYYY-MM-DD
**Этап:** [1-9]
**Тест:** [номер.номер]
**Действие:** [что сделали]
**Ожидание:** [что ожидали]
**Факт:** [что произошло]
**Скриншот:** [путь к скриншоту]
**Статус:** ✅ Подтверждено / ❌ Не подтверждено / ⚠️ Частично / 🔧 Требует настройки
**Примечание:** [дополнительные наблюдения]
```

---

## Порядок выполнения (рекомендуемый)

```
Этап 1 (подключение)     ~15 мин
Этап 2 (Fly View)        ~10 мин
Этап 3 (Setup)           ~20 мин
Этап 4 (режимы)          ~10 мин
Этап 5 (Plan View)       ~15 мин
Этап 6 (миссия)          ~15 мин
Этап 7 (Hold/RTL/Guided) ~30 мин
Этап 8 (Safety)          ~20 мин
Этап 9 (Logs)            ~15 мин
                          --------
Итого:                    ~2.5 часа
```

---

## Критерии завершения тест-плана

| Критерий | Описание |
|---|---|
| **Минимальный** | Этапы 1-6 пройдены, boat подключается, миссия выполняется |
| **Полный** | Все 9 этапов пройдены, все гипотезы H1-H15 проверены |
| **Расширенный** | + тестирование Virtual Joystick, Multi-Vehicle, MAVLink Forwarding |
