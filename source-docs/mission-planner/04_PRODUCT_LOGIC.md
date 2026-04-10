# 04_PRODUCT_LOGIC.md — Mission Planner Product Logic Analysis

**Version:** 1.1 (self-reviewed)  
**Date:** 2026-04-07  
**Scope:** Функциональная логика Mission Planner как продукта — что система делает, какие lifecycle процессы использует и как они реализованы в коде  
**Method:** Static code analysis, no runtime testing  

---

## 1. Обзор продуктовых функций

Mission Planner предоставляет 7 основных функциональных областей, каждая из которых реализована через GCSViews, MAVLinkInterface и набор вспомогательных классов.

| # | Функция | Основной класс | Файл |
|---|---------|---------------|------|
| 1 | Подключение к устройству | `MainV2.doConnect()` | `MainV2.cs:1448` |
| 2 | Мониторинг полёта | `FlightData` | `GCSViews/FlightData.cs` |
| 3 | Планирование миссий | `FlightPlanner` | `GCSViews/FlightPlanner.cs` |
| 4 | Конфигурация и параметры | `InitialSetup` / `SoftwareConfig` | `GCSViews/InitialSetup.cs`, `GCSViews/SoftwareConfig.cs` |
| 5 | Управление полётом (режимы, ARM) | `FlightData` actions + `MAVLinkInterface` | `FlightData.cs:1025-1650` |
| 6 | Предупреждения и речь | `WarningEngine` + `Speech` | `Warnings/WarningEngine.cs`, `MainV2.cs:2630-2870` |
| 7 | Расширяемость (Plugins + Scripting) | `Plugin` + `Script` | `Plugin/Plugin.cs`, `Script.cs` |

---

## 2. Connection Lifecycle — Подключение к устройству

### 2.1 Точка входа

```
MenuConnect_Click → Connect() → doConnect(comPort, portname, baud)
```

**Файл:** `MainV2.cs`  
**Строки:** `MenuConnect_Click` (1841) → `Connect()` (1849) → `doConnect()` (1448)

### 2.2 Полная последовательность `doConnect()`

| Шаг | Действие | Строка |
|-----|----------|--------|
| 1 | **Выбор транспорта** — определение типа BaseStream по portname | 1452-1539 |
| 2 | **UI: IsConnected(true)** — обновление иконки подключения | 1542-1548 |
| 3 | **ResetInternals** — сброс CurrentState | 1550 |
| 4 | **Cleanup log playback** — закрытие предыдущего logplaybackfile | 1552-1556 |
| 5 | **Set port/baud** — настройка BaseStream | 1560-1574 |
| 6 | **DTR/RTS reset** (если `CHK_resetapmonconnect` = true) | 1579-1588 |
| 7 | **Создание tlog/rlog** файлов (`yyyy-MM-dd HH-mm-ss.tlog`) | 1593-1632 |
| 8 | **comPort.Open(false, skipconnectcheck, showui)** — открытие MAVLink соединения | 1638 |
| 9 | **getParamList()** — скачивание параметров (MAVFTP или legacy) | 1657-1687 |
| 10 | **Firmware version check** — проверка новой версии через `APFirmware` | 1690-1727 |
| 11 | **Load WPs on connect** (если `loadwpsonconnect` = true) | 1751-1758 |
| 12 | **Load rally points** (если `RALLY_TOTAL` > 0) | 1762-1797 |
| 13 | **Load geofence** (если `FENCE_TOTAL` > 1) | 1800-1812 |

### 2.3 Поддерживаемые транспорты

| Тип | Portname | Класс BaseStream | Строка |
|-----|----------|------------------|--------|
| Serial | COM1..N | `SerialPort` | 1534 |
| TCP | "TCP" | `TcpSerial` | 1474 |
| UDP Server | "UDP" | `UdpSerial` | 1478 |
| UDP Client | "UDPCl" | `UdpSerialConnect` | 1486 |
| WebSocket | "WS" | `WebSocket` | 1482 |
| Auto Scan | "AUTO" | `CommsSerialScan.Scan()` | 1491 |
| Custom | Regex match | `CustomPortList` | 1527-1531 |
| Preset | "preset" | Re-use existing BaseStream | 1454 |

### 2.4 Disconnect flow

```
Connect() → if(comPort.BaseStream.IsOpen) → doDisconnect(comPort)
```

**Строка:** 1884-1886  
**Safety check:** Если `groundspeed > 4`, показывается предупреждение "Still moving" (1856-1863)

### 2.5 Parameter caching

При подключении (`doConnect`, строки 1659-1686) система использует **двойной путь** загрузки параметров:

1. **Cache hit** — если файл `ParamCachePath` существует и младше 1 часа → десериализация из JSON
2. **Cache miss** → выбор между:
   - **Background MAVFTP** (если `Params_BG` = true) — `getParamListMavftp()` в `Task.Run()`
   - **Foreground legacy** — `getParamList()` блокирующий вызов

---

## 3. Mission Planning — Планирование миссий

### 3.1 Архитектура FlightPlanner

**Файл:** `GCSViews/FlightPlanner.cs` (8557 строк)  
**Singleton:** `FlightPlanner.instance` (строка 293)

Ключевые компоненты:
- `Commands` — `DataGridView` для редактирования waypoints
- `MainMap` — `GMapControl` (GMap.NET) для визуализации
- 9 map overlay слоёв (строки 191-215): `kmlpolygons`, `geofence`, `rallypoints`, `routes`, `polygons`, `airports`, `objects`, `drawnpolygons`, `POI`

### 3.2 Типы миссий

**Выбор через `cmb_missiontype`** (строка 241-242):

| Mission Type | MAVLink enum | Файл на autopilot |
|---|---|---|
| MISSION | `MAV_MISSION_TYPE.MISSION` | `@MISSION/mission.dat` |
| FENCE | `MAV_MISSION_TYPE.FENCE` | `@MISSION/fence.dat` |
| RALLY | `MAV_MISSION_TYPE.RALLY` | `@MISSION/rally.dat` |

### 3.3 Mission Download (Read)

**Триггер:** `BUT_read_Click()` (строка 607)  
**Механизм:** Background operation через `ProgressReporterDialogue`

```
BUT_read_Click → frmProgressReporter.DoWork += getWPs → getWPs()
```

**`getWPs()`** (строка 3978) — двойной путь:

| Path | Условие | Метод | Строка |
|------|---------|-------|--------|
| **MAVFTP** | `chk_usemavftp.Checked` | `MAVFtp.GetFile("@MISSION/mission.dat")` → `missionpck.unpack()` | 3985-4013 |
| **Legacy MAVLink** | fallback | `mav_mission.download()` → standard MAVLink mission protocol | 4016-4032 |

Результат обоих путей → `WPtoScreen(cmds)` — отрисовка на DataGridView и карте.

### 3.4 Mission Upload (Write)

**Триггер:** `BUT_write_Click()` (строка 646)  
**Pre-flight checks** (строки 648-711):
1. Проверка altitude mode (Absolute warning)
2. Валидация home location
3. Проверка всех ячеек DataGridView на числовые значения
4. Проверка `TXT_altwarn` для low altitude warning

**`saveWPs()`** (строка 6179) — последовательность:

| Шаг | Действие | Строка |
|-----|----------|--------|
| 1 | Создание home waypoint из TXT_homelat/lng/alt | 6190-6203 |
| 2 | `GetCommandList()` — конвертация DataGridView → `List<mavlink_mission_item_int_t>` | 6215 |
| 3 | Insert home at index 0 (для ArduPilot) | 6217-6219 |
| 4a | **MAVFTP path**: `missionpck.pack()` → `MAVFtp.UploadFile()` | 6231-6249 |
| 4b | **Legacy path**: `mav_mission.upload()` | 6252-6286 |
| 5 | `getHomePositionAsync()` — обновление home на UI | 6270 |
| 6 | `setParam("WP_RADIUS")` — установка параметров WP навигации | 6291-6303 |
| 7 | `Terrain.checkTerrain()` — подгрузка terrain data для каждого WP | 6305-6315 |

### 3.5 Mission Fast Upload

**`saveWPsFast()`** (строка 6328) — альтернативный быстрый метод:
- Подписывается на `MISSION_ACK` через `SubscribeToPacketType`
- Отправляет все WP без ожидания отдельных ACK
- Более рискованный, но значительно быстрее

### 3.6 WP Creation на карте

**`AddWPToMap(lat, lng, alt)`** (строка 558):

```csharp
if (polygongridmode) → addPolygonPointToolStripMenuItem_Click
if (sethome)         → callMeDrag("H", lat, lng, alt)
else                 → Commands.Rows.Add() + setfromMap(lat, lng, alt)
```

Тип WP зависит от контекста:
- `MAV_MISSION_TYPE.RALLY` → `RALLY_POINT`
- `MAV_MISSION_TYPE.FENCE` → `FENCE_CIRCLE_EXCLUSION` (radius = 5)
- `splinemode = true` → `SPLINE_WAYPOINT`
- Default → `WAYPOINT`

### 3.7 Alt Mode

**Enum `altmode`** (строка 416-421):

| Mode | MAV_FRAME | Описание |
|------|-----------|----------|
| Relative | `GLOBAL_RELATIVE_ALT` | Относительно home |
| Absolute | `GLOBAL` | Абсолютная (MSL) |
| Terrain | `GLOBAL_TERRAIN_ALT` | Относительно terrain |

Сохраняется в Settings как `FPaltmode` (строка 102).

### 3.8 Undo System

`FlightPlanner` включает undo buffer (строка 113):
```csharp
private List<List<Locationwp>> history = new List<List<Locationwp>>();
```

Ctrl+Z → `WPtoScreen(history.pop())` (строки 349-360)  
Ctrl+O → загрузка WP файла  
Ctrl+S → сохранение WP файла  

---

## 4. Flight Monitoring — Мониторинг полёта

### 4.1 Архитектура FlightData

**Файл:** `GCSViews/FlightData.cs` (6693 строки)  
**Singleton:** `FlightData.instance` — присваивается в конструкторе (строка 246: `instance = this;`)

Ключевые визуальные компоненты:
- `hud1` (HUD) — искусственный горизонт, данные полёта
- `gMapControl1` (mymap) — карта с треком и маркерами
- `zg1` (ZedGraph) — графики tuning (до 20 каналов одновременно)
- `QuickView` панели — настраиваемые числовые индикаторы, dynamic layout через `setQuickViewRowsCols(cols, rows)` (строка 4892)
- `tabControlactions` — 14 вкладок (Quick, PreFlight, Actions, ActionsSimple, Gauges, Status, Servo, Scripts, TLogs, logbrowse, messages, Transponder, AuxFunction, Payload)

### 4.2 Mainloop — основной цикл

**`mainloop()`** (строка 3345) — выделенный Thread, ~20Hz:

```
while (threadrun) {
    if (giveComport) → sleep(50) + updateBindingSource() + continue
    sleep(50)
    
    // Log playback mode:
    if (logreadmode) → readPacketAsync() + speed control
    
    // Live mode:
    updateBindingSource()              // обновление всех data bindings
    battery warning check              // сравнение с BATT_LOW_VOLT, BATT_CRT_VOLT
    OpenGLtest update                  // 3D visualization
    Vario.SetValue(climbrate)          // вариометр
    tuning graph update (75ms)         // ZedGraph через reflection
    map update (1s)                    // vehicle position + track
    waypoint/geofence display update
    ADSB overlay update
    transponder update
}
```

### 4.3 Data Binding и Quick Views

FlightData использует `BindingSource` + reflection для связи `CurrentState` → UI:

```csharp
// QuickView binding (FlightData.cs, строка 477):
var b = new Binding("number", bindingSourceQuickTab, Settings.Instance["quickView" + f], true);
```

QuickView панели создаются динамически через `setQuickViewRowsCols()` (строка 4892) — количество определяется `ColumnCount × RowCount` в `tableLayoutPanelQuick`. Каждая панель привязана к произвольному свойству `CurrentState` через double-click → выбор поля. QuickView поддерживают `WarningEngine.QuickPanelColoring` для условного окрашивания фона.

### 4.4 Tuning Graph

До 20 каналов одновременно (`list1`..`list20`, строки 76-135):

```csharp
// mainloop(), строки 3668-3700 — данные добавляются каждые 75ms:
if (tunning.AddMilliseconds(75) < DateTime.Now && CB_tuning.Checked)
{
    if (list1item != null)
        list1.Add(time, list1item.GetValue(MainV2.comPort.MAV.cs, null).ConvertToDouble());
    // ...list2..list20
}
```

**Два интервала:**
- **75ms** — добавление данных в `RollingPointPairList` (mainloop, строка 3668)
- **200ms** — `ZedGraphTimer.Interval` для рендеринга графика (строка 635)

Каналы выбираются через `chk_box_tunningCheckedChanged` — привязка через `PropertyInfo` reflection.

### 4.5 Map Overlays (FlightData)

10 слоёв карты (строки 378-406):

| Overlay | Назначение |
|---------|-----------|
| `tfrpolygons` | TFR (Temporary Flight Restriction) зоны |
| `kmlpolygons` | KML полигоны |
| `geofence` | Geofence зоны |
| `polygons` | Vehicle path polygon |
| `photosoverlay` | Camera trigger points |
| `cameraBounds` | Camera field of view |
| `routes` | Vehicle flight track |
| `adsbais` | ADSB/AIS traffic |
| `rallypointoverlay` | Rally points |
| `POI` | Points of interest |

### 4.6 Available Actions

**Enum `actions`** (строки 182-203) — 19 команд доступных из UI.  
**Dispatch handler:** `BUTactiondo_Click()` (строка 1671) — цепочка if/else с fallthrough на `Enum.Parse(MAV_CMD, action_name)`.

| Action | Реальный MAVLink механизм | Строка |
|--------|--------------------------|--------|
| `Loiter_Unlim` | `Enum.Parse → MAV_CMD.LOITER_UNLIM` via doCommand() | 1833 |
| `Return_To_Launch` | `Enum.Parse → MAV_CMD.RETURN_TO_LAUNCH` via doCommand() | 1833 |
| `Preflight_Calibration` | `MAV_CMD.PREFLIGHT_CALIBRATION(param1=gyro, param3=baro)` | 1765 |
| `Mission_Start` | `Enum.Parse → MAV_CMD.MISSION_START` via doCommand() | 1833 |
| `Preflight_Reboot_Shutdown` | `comPort.doReboot()` | 1781 |
| `Trigger_Camera` | `comPort.setDigicamControl(true)` | 1695 |
| `System_Time` | `sendPacket(mavlink_system_time_t)` — прямой пакет | 1740 |
| `Battery_Reset` | `MAV_CMD.BATTERY_RESET(0xff, 100%)` via doCommand() | 1823 |
| `ADSB_Out_Ident` | `Enum.Parse → MAV_CMD.ADSB_OUT_IDENT` via doCommand() | 1833 |
| `Scripting_cmd_stop_and_restart` | `doCommandInt(MAV_CMD.SCRIPTING, STOP_AND_RESTART)` | 1709 |
| `Scripting_cmd_stop` | `doCommandInt(MAV_CMD.SCRIPTING, STOP)` | 1723 |
| `HighLatency_Enable` | `comPort.doHighLatency(true)` | 1787 |
| `HighLatency_Disable` | `comPort.doHighLatency(false)` | 1793 |
| `Toggle_Safety_Switch` | `setMode(set_mode_t, MAV_MODE_FLAG.SAFETY_ARMED)` | 1806 |
| `Do_Parachute` | `Enum.Parse → MAV_CMD.DO_PARACHUTE` via doCommand() | 1833 |
| `Engine_Start` | `comPort.doEngineControl(sysid, compid, true)` | 1812 |
| `Engine_Stop` | `comPort.doEngineControl(sysid, compid, false)` | 1818 |
| `Terminate_Flight` | `doCommand(MAV_CMD.DO_FLIGHTTERMINATION, 1.0)` | 1774 |
| `Format_SD_Card` | `doCommandInt(MAV_CMD.STORAGE_FORMAT, 1, 1)` | 1680 |

**Fallthrough pattern** (строки 1830-1839): Actions без специальной обработки автоматически маппятся на `MAV_CMD` через `Enum.Parse(action_name.ToUpper())`, с fallback на `"DO_START_" + action_name`.

### 4.7 Log Playback

**`LoadLogFile(file)`** (строка 664):
```csharp
MainV2.comPort.logreadmode = true;
MainV2.comPort.logplaybackfile = new BinaryReader(File.OpenRead(file));
MainV2.comPort.getHeartBeat();
```

Playback control через `LogPlayBackSpeed` (строки 3475-3510) — variable speed с коррекцией timing через `timeerror` accumulator.

---

## 5. Flight Control — Управление полётом

### 5.1 ARM / DISARM

**`BUT_ARM_Click()`** (строка 1025):

1. Проверка соединения → `BaseStream.IsOpen`
2. Определение текущего состояния → `cs.armed`
3. Если DISARM → подтверждение через `CustomMessageBox`
4. Subscribe на `STATUSTEXT` для получения ошибок ARM
5. `MainV2.comPort.doARM(!isitarmed)` → MAVLink `COMMAND_LONG(MAV_CMD_COMPONENT_ARM_DISARM)`
6. При отказе → предложение Force ARM: `doARM(!isitarmed, true)` (magic value `21196.0f`)
7. Unsubscribe от `STATUSTEXT`

### 5.2 Mode Switching

**`BUT_setmode_Click()`** (строка 1635):

```csharp
if (MainV2.comPort.MAV.cs.failsafe) → warning dialog
MainV2.comPort.setMode(CMB_modes.Text);
```

**Quick mode buttons:**

| Кнопка | Действие | Строка |
|--------|----------|--------|
| `BUT_quickauto` | `setMode("Auto")` | 1406-1418 |
| `BUT_quickmanual` | `setMode("Loiter")` для всех типов | 1421-1437 |
| `BUT_quickrtl` | `setMode("RTL")` | 1440-1452 |

**Динамический список режимов** (строка 348):
```csharp
CMB_modes.DataSource = ArduPilot.Common.getModesList(MainV2.comPort.MAV.cs.firmware);
```

Список зависит от типа firmware (Copter/Plane/Rover/Sub).

### 5.3 Resume Mission

**`BUT_resumemis_Click()`** (строка 1472) — сложная мультишаговая операция:

1. Запрос номера WP для возобновления (`lastautowp`)
2. Скачивание всех WP с autopilot
3. Фильтрация WP — пропуск пройденных (сохранение DO_ команд)
4. Перезапись миссии на autopilot (`setWPTotal` + `setWP` + `setWPACK`)
5. `FlightPlanner.BUT_read_Click(this, null)` — обновление UI
6. `setWPCurrent(1)` — установка текущего WP = 1
7. Для Copter:
   - `setMode("GUIDED")` с retry loop (30s timeout)
   - `doARM(true)` с retry loop
   - `doCommand(TAKEOFF)` до достижения целевой высоты (40s timeout)
8. `setMode("AUTO")` с retry loop

**Важно:** Это единственная функция в системе, которая автоматически управляет ARM + TAKEOFF + MODE в одной последовательности.

### 5.4 Gimbal Control

**`BUT_resetGimbalPos_Click()`** (строка 1462):
```csharp
MainV2.comPort.setMountConfigure(MAV_MOUNT_MODE.MAVLINK_TARGETING, ...);
MainV2.comPort.setMountControl(pitch*100, roll*100, yaw*100, false);
```

Управление через `trackBarPitch/Roll/Yaw` → MAVLink `MOUNT_CONFIGURE` + `MOUNT_CONTROL`.

---

## 6. Configuration — Параметры и настройка

### 6.1 Двухуровневая архитектура конфигурации

Mission Planner разделяет конфигурацию на 2 уровня:

| Уровень | Класс | Назначение |
|---------|-------|-----------|
| **InitialSetup** | `GCSViews/InitialSetup.cs` | Hardware setup — калибровка, frame type, ESC, compass, radio |
| **SoftwareConfig** | `GCSViews/SoftwareConfig.cs` | Software setup — PID tuning, geofence, flight modes, params |

### 6.2 BackstageView — динамические панели

Обе view используют `BackstageViewPage` pattern — динамическое добавление панелей на основе условий:

**Условия видимости** (InitialSetup.cs, строки 21-35):

```csharp
[Flags] public enum pageOptions {
    none, isConnected, isDisConnected, isTracker, isCopter,
    isCopter35plus, isHeli, isQuadPlane, isPlane, isRover, gotAllParams
}
```

**Пример:** `ConfigAccelerometerCalibration` показывается только если:
- `isConnected = true` (BaseStream.IsOpen)
- `gotAllParams = true` (TotalReceived >= TotalReported)
- `displayAccelCalibration = true` (DisplayConfiguration)

### 6.3 InitialSetup — полный список панелей

| Панель | Тип | Условие |
|--------|-----|---------|
| `ConfigFirmwareManifest` | Firmware Update | isDisConnected |
| `ConfigFirmwareDisabled` | (placeholder) | isConnected |
| `ConfigSecureAP` | Secure Boot | isDisConnected |
| `ConfigMandatory` | Mandatory Setup | isConnected + gotAllParams |
| ├ `ConfigTradHeli4` | Heli setup | isHeli |
| ├ `ConfigFrameType` / `ConfigFrameClassType` | Frame | isCopter |
| ├ `ConfigAccelerometerCalibration` | Accel Cal | isConnected |
| ├ `ConfigHWCompass` / `ConfigHWCompass2` | Compass | isConnected |
| ├ `ConfigRadioInput` | RC Input | isConnected |
| ├ `ConfigRadioOutput` | Servo Output | isConnected |
| ├ `ConfigSerial` | Serial Ports | isConnected |
| ├ `ConfigESCCalibration` | ESC Cal | isConnected |
| ├ `ConfigFlightModes` | Flight Modes | isConnected |
| ├ `ConfigFailSafe` | Failsafe | isConnected |
| ├ `ConfigInitialParams` | Initial Params | isCopter/isQuadPlane |
| └ `ConfigHWIDs` | HW IDs | isConnected |
| `ConfigOptional` | Optional Group | always |
| ├ `ConfigSerialInjectGPS` | RTK Inject | always |
| ├ `Sikradio` | SiK Radio | always |
| ├ `ConfigADSB` | ADSB Setup | isConnected |
| ├ `ConfigBatteryMonitoring` × 2 | Battery | isConnected |
| ├ `ConfigDroneCAN` | DroneCAN | always |
| ├ `JoystickSetup` | Joystick | always |
| ├ `ConfigHWRangeFinder` | Rangefinder | isConnected |
| ├ `ConfigHWAirspeed` | Airspeed | isConnected |
| ├ `ConfigHWParachute` | Parachute | isConnected |
| └ `ConfigFFT` | FFT Analysis | isConnected |
| `ConfigAdvanced` | Advanced Group | isAdvancedMode |
| ├ `ConfigTerminal` | Terminal | always |
| └ `ConfigREPL` | Script REPL | isConnected |

### 6.4 SoftwareConfig — firmware-зависимые панели

**Строки:** 142-259

| Firmware | Панели | Строка |
|----------|--------|--------|
| ArduCopter2 | `ConfigAC_Fence`, `ConfigSimplePids`, `ConfigArducopter` | 152-170 |
| ArduPlane | `ConfigArduplane`, `ConfigArducopter` (QP) | 173-183 |
| ArduRover | `ConfigArdurover` | 186-189 |
| ArduTracker | `ConfigAntennaTracker` | 191-193 |
| Ateryx | `ConfigFlightModes`, `ConfigAteryxSensors`, `ConfigAteryx` | 233-237 |

**Общие панели** (для всех):
- `ConfigFriendlyParams` — Standard Params
- `ConfigFriendlyParamsAdv` — Advanced Params
- `ConfigRawParams` — Full Parameter List
- `ConfigOSD` — Onboard OSD
- `MavFTPUI` — MAV FTP
- `ConfigPlanner` — Planner settings

### 6.5 DisplayConfiguration — контроль видимости

**`DisplayView`** (MainV2.cs, строка 351-363) — внешний JSON конфиг, контролирующий какие разделы UI показывать.  
Загружается из `DisplayViewExtensions.custompath` при старте.  
Каждый `display*` флаг проверяется перед добавлением страницы.

### 6.6 Vehicle Type Detection

**Enum `Firmwares`** (`ExtLibs/ArduPilot/Firmwares.cs`):

```csharp
public enum Firmwares {
    ArduPlane, ArduCopter2, ArduRover, ArduSub,
    Ateryx, ArduTracker, Gimbal, PX4, Other, AP_Periph
}
```

Тип определяется из `HEARTBEAT.autopilot` + `HEARTBEAT.type` при подключении.  
Используется повсеместно для условной логики UI и команд.

---

## 7. Warning System — Система предупреждений

### 7.1 Двойная архитектура предупреждений

Mission Planner использует **две независимые** системы предупреждений:

#### A) Встроенные предупреждения (MainV2.SerialReader)

**Файл:** `MainV2.cs`, строки 2630-2870  
**Цикл:** `SerialReader` thread, проверка каждые ~1s

| Тип | Условие | Интервал | Строка |
|-----|---------|----------|--------|
| Custom speech | `speechcustomenabled` | 30s | 2654-2658 |
| Battery voltage | `battery_voltage <= warnvolt` | 30s | 2668-2676 |
| Battery percent | `battery_remaining < warnpercent` | 30s | 2678-2688 |
| Low airspeed | `airspeed < speechlowairspeedtrigger` (armed) | 10s | 2696-2710 |
| Low groundspeed | `groundspeed < speechlowgroundspeedtrigger` (armed) | 10s | 2712-2720 |
| Low altitude | `alt <= speechaltheight` (armed, was higher) | каждый цикл | 2743-2753 |
| High priority msg | `messageHigh` changed | каждый цикл | 2764-2772 |
| Data loss | `lastvalidpacket > 3s` (armed) | 5s | 2804-2818 |
| Arm state change | armed toggled | на событие | 2860-2873 |

Все используют `speechConversion()` для шаблонизации: `{alt}`, `{speed}`, `{battery}` и т.д.

#### B) Custom WarningEngine

**Файл:** `ExtLibs/Utilities/Warnings/WarningEngine.cs`  
**Цикл:** Async loop, `Task.Delay(250)` = 4 Hz

**Архитектура:**
```
WarningEngine.MainLoop() → foreach warning → checkCond(warning) → SpeakAsync / QuickPanelColoring
```

**CustomWarning** (`Warnings/CustomWarning.cs`):
- `Name` — привязка к свойству `CurrentState` через reflection (`PropertyInfo`)
- `ConditionType` — `LT | LTEQ | EQ | GT | GTEQ | NEQ`
- `Warning` — пороговое значение (double)
- `RepeatTime` — минимальный интервал повтора (default: 10s)
- `type` — `SpeakAndText` или `Coloring`
- `Child` — цепочка условий (рекурсивная проверка)
- `Text` — шаблон: `"WARNING: {name} is {value}"` (строка 147)

**Persistence:** XML файл `warnings.xml` в user data directory (строка 14).

**Coloring mechanism** (строка 113-122):
```csharp
if (item.type == WarningType.Coloring)
    QuickPanelColoring?.Invoke(item.Name, item.color);  // trigger
else
    QuickPanelColoring?.Invoke(item.Name, "NoColor");   // reset
```

### 7.2 Battery Warning в FlightData mainloop

**Дополнительно** к speech, `FlightData.mainloop()` (строки 3569-3636) контролирует **visual HUD alerts**:

```csharp
// Dual source: param BATT_LOW_VOLT || Settings.speechbatteryvolt
if (battery_voltage <= warnvolt) → hud1.lowvoltagealert = true;
if (battery_voltage <= critvolt) → hud1.criticalvoltagealert = true;
```

Параметры AutoPilot (`BATT_LOW_VOLT`, `BATT_CRT_VOLT`) имеют приоритет над Settings.

---

## 8. Plugin System — Система плагинов

### 8.1 Architecture

**Файл:** `Plugin/Plugin.cs`

| Класс | Назначение |
|-------|-----------|
| `Plugin` (abstract) | Базовый класс плагина — `Init()`, `Loaded()`, `Loop()`, `Exit()` |
| `PluginHost` | Контекст — доступ к MainV2, comPort, cs, Settings, maps, menus |

### 8.2 Plugin Lifecycle

```
Load .dll/.cs → Init() → Loaded() → [Loop() at loopratehz] → Exit()
```

**Loop** выполняется в background thread, shared между всеми плагинами.  
`NextRun` позволяет override интервала на per-call basis.

### 8.3 PluginHost API

| Свойство | Тип доступа |
|----------|------------|
| `MainForm` | `MainV2.instance` |
| `cs` | `MainV2.comPort.MAV.cs` — CurrentState |
| `comPort` | `MainV2.comPort` — MAVLinkInterface |
| `config` | `Settings.Instance` |
| `FDMenuMap` / `FDMenuHud` | Context menus на FlightData |
| `FPMenuMap` | Context menu на FlightPlanner |
| `FDGMapControl` / `FPGMapControl` | GMap controls |
| `FPDrawnPolygon` | Drawn polygon на FlightPlanner |
| `AddWPtoList()` / `InsertWP()` | Программное добавление WP |
| `GetWPs()` | Скачивание WP с autopilot |
| `DeviceChanged` | Event — USB device change |

### 8.4 Plugin Registration в Config

Плагины могут добавлять страницы в InitialSetup и SoftwareConfig:

```csharp
// InitialSetup.cs, строка 53:
public static void AddPluginViewPage(Type page, string headerText, pageOptions options)

// SoftwareConfig.cs, строка 51:
public static void AddPluginViewPage(Type page, string headerText, pageOptions options)
```

В `HardwareConfig_Load` / `SoftwareConfig_Load` плагинные страницы добавляются по тем же `pageOptions` rules (строки 356-382 / 262-286).

---

## 9. Scripting Engine — Python скрипты

### 9.1 Architecture

**Файл:** `Script.cs` (220 строк)  
**Engine:** IronPython (`IronPython.Hosting`)

### 9.2 Доступные переменные в Python scope

| Переменная | Объект | Строка |
|------------|--------|--------|
| `MainV2` | `MainV2.instance` | 46 |
| `FlightPlanner` | `FlightPlanner.instance` | 47 |
| `FlightData` | `FlightData.instance` | 48 |
| `Ports` | `MainV2.Comports` (все подключения) | 49 |
| `MAV` | `MainV2.comPort` | 50 |
| `cs` | `MainV2.comPort.MAV.cs` | 51 |
| `Script` / `mavutil` | `this` (Script instance) | 52-53 |
| `Joystick` | `MainV2.joystick` | 54 |

### 9.3 Script API methods

| Метод | Назначение | Строка |
|-------|-----------|--------|
| `ChangeParam(param, value)` | `comPort.setParam()` — изменение параметра | 136 |
| `GetParam(param)` | Чтение параметра из cache | 141 |
| `ChangeMode(mode)` | `comPort.setMode(mode)` | 149 |
| `WaitFor(message, timeout)` | Ожидание STATUSTEXT с заданным текстом | 155 |
| `SendRC(channel, pwm, sendnow)` | RC override (ch1-ch8) | 169 |
| `Sleep(ms)` | Thread.Sleep() | 104 |

### 9.4 Script Execution

**`FlightData.BUT_run_script_Click()`** (строка 777):
```csharp
scriptthread = new Thread(run_selected_script) { IsBackground = true };
script = null;  // fresh instance
scriptthread.Start();
scriptrunning = true;
```

Скрипт выполняется в **отдельном background thread**, с Semaphore `scriptstarted` для синхронизации.  
Output может быть перенаправлен через `StringRedirectWriter` (строки 59-66).

### 9.5 RC Override через скрипт

**`SendRC()`** (строка 169-218):
- Обновляет `cs.rcoverridech1-8`
- Формирует `mavlink_rc_channels_override_t`
- При `sendnow = true` — отправляет пакет **дважды** с 20ms паузой (для надёжности)

---

## 10. Дополнительная продуктовая логика

### 10.1 Home Location Management

При ARM event (MainV2.cs, строка 2822-2857):
```
armedstatus changed to true →
  ThreadPool →
    wait for giveComport == false →
    cs.HomeLocation = comPort.getWP(0) →
    FlightPlanner.updateHome()
```

### 10.2 Link Quality Degradation

**Строки:** 2787-2801
```csharp
if ((DateTime.UtcNow - lastvalidpacket).TotalSeconds >= 1)
    cs.linkqualitygcs = (ushort)(cs.linkqualitygcs * 0.8f);  // exponential decay
```

Link quality деградирует на 20% каждую секунду без пакетов.

### 10.3 GCS Heartbeat

**Строки:** 2896-2900 — GCS отправляет heartbeat каждую секунду:
```csharp
if (heatbeatSend.Second != DateTime.UtcNow.Second)
    mavlink_heartbeat_t { type = MAV_TYPE.GCS, ... }
```

### 10.4 Firmware Version Check

При подключении (`doConnect`, строки 1690-1727) запускается `Task.Run()`:
1. Parse `VersionString` → extract vehicle type  
2. `APFirmware.GetReleaseNewest(OFFICIAL)` → HTTP check  
3. Если `ver2 > ver1` → показать "New Firmware" dialog  
4. `ParameterMetaDataRepositoryAPMpdef.GetMetaDataVersioned()` → загрузка param descriptions для текущей версии

### 10.5 Multi-Vehicle Support

Архитектура поддерживает multiple vehicles через `MAVList`:
```csharp
// FlightData mainloop, строка 3513:
foreach (var MAV in MainV2.comPort.MAVlist)
    MAV.cs.UpdateCurrentSettings(null, false, MainV2.comPort, MAV);
```

`comPort.sysidcurrent` / `compidcurrent` определяют текущий "активный" vehicle.

---

## 11. Архитектурные выводы

### 11.1 Сильные стороны

| Аспект | Реализация |
|--------|-----------|
| **Полнота функций** | Покрывает полный lifecycle: connect → configure → plan → fly → log → analyze |
| **Plugin system** | Чистый API через PluginHost с доступом к maps, menus, comPort |
| **Firmware awareness** | UI динамически адаптируется к типу прошивки |
| **Data binding** | Reflection-based binding позволяет привязать любое свойство CurrentState |
| **Dual mission path** | MAVFTP для скорости, legacy для совместимости |

### 11.2 Архитектурные проблемы

| Проблема | Влияние | Строки |
|----------|---------|--------|
| **God-object FlightData** | 6693 строки — один файл, невозможно тестировать | FlightData.cs |
| **God-object FlightPlanner** | 8557 строк — монолитный файл | FlightPlanner.cs |
| **Static singletons** | `FlightData.instance`, `FlightPlanner.instance`, `MainV2.instance` — tight coupling | Везде |
| **Thread.Sleep в UI loops** | `mainloop()` использует `Thread.Sleep(50)` вместо async | 3387 |
| **Duplicate tuning lists** | 20x copy-paste `RollingPointPairList` вместо коллекции | 76-135 |
| **Resume Mission safety** | Auto ARM + TAKEOFF без полноценного state machine — race conditions | 1480-1611 |
| **No unit tests** | Вся product logic тестируется только через ручное взаимодействие | — |
| **Warning system split** | Два независимых механизма (inline + WarningEngine) с потенциальным дублированием | 2630-2870 vs WarningEngine |
| **RC override safety** | `SendRC()` напрямую отправляет пакеты без rate limiting | Script.cs:210-214 |

### 11.3 Расхождения с QGroundControl

| Аспект | Mission Planner | QGroundControl (из анализа) |
|--------|----------------|---------------------------|
| Scripting | IronPython с полным доступом к internals | Нет scripting в core |
| Plugin API | Rich API (PluginHost) — maps, menus, WPs | QGC Plugin system — более ограниченный |
| Mission protocol | Dual path (MAVFTP + legacy) + Fast upload | Standard MAVLink mission protocol |
| Config panels | Dynamic BackstageView с pageOptions flags | QML-based modular panels |
| Warning system | Dual system (inline + WarningEngine + XML persistence) | Custom alerts with QML UI |
| Resume Mission | Built-in auto ARM+TAKEOFF sequence | Manual recovery |
| Tuning Graph | ZedGraph 20 channels real-time | MAVLink Inspector / Charts |

---

## 12. Summary

Mission Planner реализует **полноценную GCS с глубокой интеграцией ArduPilot**. Ключевые выводы:

1. **Connection lifecycle** (`doConnect`, 390 строк) — самый приоритетный и сложный flow, включающий автоматическую загрузку параметров, миссий, rally points и fence
2. **Mission management** — зрелая реализация с MAVFTP acceleration, undo buffer, terrain checking и alt mode selection
3. **Flight operations** — Resume Mission является уникальной функцией с auto-ARM/TAKEOFF, но с недостаточной error recovery
4. **Configuration** — динамические панели адаптируются под firmware type (10 вариантов), connection state и parameter availability
5. **Warning system** — избыточная двойная архитектура (inline speech + WarningEngine), но обе работают через один и тот же ISpeech интерфейс
6. **Extensibility** — Plugin API и IronPython scripting дают доступ ко всем internals системы, что одновременно является преимуществом (гибкость) и риском (безопасность)

---

*Следующий шаг: 05_ARCHITECTURE_DECISIONS.md*
