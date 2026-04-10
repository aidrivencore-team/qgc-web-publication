# 🏗 Mission Planner — System Architecture

> **Документ:** 02_SYSTEM_ARCHITECTURE.md
> **Дата:** 2026-04-06
> **Контекст:** Архитектурная модель Mission Planner на основе анализа исходного кода
> **Статус:** Основан на прямом чтении кода. Предположения помечены `[Assumption]`

---

## 1. Архитектурный тип

**Модульный монолит (Modular Monolith)** с плагин-системой.

Всё приложение работает в одном процессе. Внутри — слоистая архитектура с декомпозицией через отдельные .NET-проекты (`.csproj`). Не все слои строго изолированы: `MainV2` (Application Shell) имеет прямые static зависимости, пронизывающие все слои. Основные слои расположены в `ExtLibs/`, UI-код — в корне проекта.

**Ключевые паттерны:**

| Паттерн | Обоснование (файл / код) |
|---|---|
| **Singleton** | `MainV2.instance` (MainV2.cs:556), `MainV2.comPort` (MainV2.cs:401 — static property), `Settings.Instance` (Settings.cs:22 — lazy init) |
| **Observer / Event-driven** | `MAVLinkInterface.OnPacketReceived` (MAVLinkInterface.cs:69), `CurrentState.Parent_OnPacketReceived` (CurrentState.cs:2276) |
| **Strategy (Transport)** | `ICommsSerial` interface (Interfaces/ICommsSerial.cs:6) — 12 реализаций. `SerialPort` дополнительно использует Decorator |
| **View Controller (custom)** | `MainSwitcher` (Controls/MainSwitcher.cs:12) — manages `Screen` objects |
| **Abstract Factory (Icons)** | `menuicons` (MainV2.cs:60) → `burntkermitmenuicons`, `highcontrastmenuicons` |
| **Plugin Host** | `PluginLoader` (Plugin/PluginLoader.cs:18) → `PluginHost` (Plugin/Plugin.cs) |
| **Fat Model** | `CurrentState` (CurrentState.cs:17) — 4 892 строки, ~300+ свойств, содержит бизнес-логику обработки пакетов |

---

## 2. Слои системы (Layer Diagram)

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION SHELL LAYER                       │
│                                                                 │
│  Program.cs → MainV2 (Form) → MainSwitcher                     │
│  ┌──────┬──────────┬──────┬─────────┬──────────┬──────┐        │
│  │Flight│Flight    │SITL  │Initial  │Software  │Help  │        │
│  │Data  │Planner   │      │Setup    │Config    │      │        │
│  └──────┴──────────┴──────┴─────────┴──────────┴──────┘        │
├─────────────────────────────────────────────────────────────────┤
│                     CONTROLS LAYER                               │
│                                                                 │
│  ConnectionControl, HUD, MAVLinkInspector, DroneCAN UI,         │
│  GimbalVideoControl, JoystickSetup, SerialOutput, FollowMe      │
├─────────────────────────────────────────────────────────────────┤
│                      PLUGIN LAYER                                │
│                                                                 │
│  PluginLoader → Plugin (abstract) → PluginHost                  │
│  .dll plugins (Plugins/) + .cs runtime plugins (plugins/)       │
├─────────────────────────────────────────────────────────────────┤
│                  ARDUPILOT DOMAIN LAYER                          │
│                                                                 │
│  MAVLinkInterface ←→ MAVList ←→ MAVState ←→ CurrentState        │
│  Fence, Camera/Gimbal Protocol, mav_mission, parampck           │
├─────────────────────────────────────────────────────────────────┤
│                  COMMUNICATION LAYER                             │
│                                                                 │
│  ICommsSerial (interface)                                       │
│  SerialPort, TCP, UDP, UDPConnect, WebSocket, BLE, NTRIP,       │
│  WinUSB, File, Injection, Pipe, Stream                          │
├─────────────────────────────────────────────────────────────────┤
│                    UTILITIES LAYER                               │
│                                                                 │
│  Settings, ThemeManager, SRTM, ADSB, Grid, DFLog, Tracking,    │
│  ParameterMetadata, GeoRef, PointLatLngAlt, httpserver          │
├─────────────────────────────────────────────────────────────────┤
│                 MAPS & VISUALIZATION LAYER                       │
│                                                                 │
│  GMap.NET (Core + WindowsForms + Drawing)                       │
│  Custom Map Providers (WMS, WMTS, MapBox, Japan, Arctic)        │
│  ZedGraph, OpenTK (3D), SkiaSharp                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Подсистемы (Component Table)

### 3.1 Application Shell

| Компонент | Namespace / Класс | Файл | Описание |
|---|---|---|---|
| **Entry Point** | `MissionPlanner.Program.Main()` | `Program.cs` | `[STAThread]` entry. Инициализация log4net, GMap, proxy, splash. Вызывает `Application.Run(new MainV2())` |
| **Main Form** | `MissionPlanner.MainV2` | `MainV2.cs` (4827 строк) | Главная форма. Управляет навигацией, потоками, подключениями |
| **Navigation** | `MissionPlanner.Controls.MainSwitcher` | `ExtLibs/Controls/MainSwitcher.cs` | Кастомный view switcher. Управляет `Screen` объектами с `IActivate/IDeactivate` lifecycle |
| **Singleton** | `MainV2.instance` | `MainV2.cs:556` | Глобальная ссылка на экземпляр формы |

**Регистрация view'ов** (MainV2.cs:3177-3182):
```csharp
MyView.AddScreen(new MainSwitcher.Screen("FlightData", FlightData, true));       // persistent
MyView.AddScreen(new MainSwitcher.Screen("FlightPlanner", FlightPlanner, true)); // persistent
MyView.AddScreen(new MainSwitcher.Screen("HWConfig", typeof(InitialSetup), false));
MyView.AddScreen(new MainSwitcher.Screen("SWConfig", typeof(SoftwareConfig), false));
MyView.AddScreen(new MainSwitcher.Screen("Simulation", Simulation, true));       // persistent
MyView.AddScreen(new MainSwitcher.Screen("Help", typeof(Help), false));
```

- **Persistent screens** (`FlightData`, `FlightPlanner`, `SITL`) — создаются один раз, живут всё время работы приложения.
- **Non-persistent screens** (`InitialSetup`, `SoftwareConfig`, `Help`) — создаются при каждом переключении, уничтожаются при уходе.

### 3.2 GCS Views (основные экраны)

| View | Namespace | Файл | Persistent | Описание |
|---|---|---|---|---|
| **FlightData** | `MissionPlanner.GCSViews` | `GCSViews/FlightData.cs` | ✅ | Real-time мониторинг: HUD + карта + quickview + status |
| **FlightPlanner** | `MissionPlanner.GCSViews` | `GCSViews/FlightPlanner.cs` | ✅ | Карта + таблица waypoints + инструменты планирования |
| **InitialSetup** | `MissionPlanner.GCSViews` | `GCSViews/InitialSetup.cs` | ❌ | Firmware upload, calibration, wizard |
| **SoftwareConfig** | `MissionPlanner.GCSViews` | `GCSViews/SoftwareConfig.cs` | ❌ | Parameters, flight modes, failsafe, tuning |
| **SITL** | `MissionPlanner.GCSViews` | `GCSViews/SITL.cs` | ✅ | Software-in-the-Loop simulation |
| **Help** | `MissionPlanner.GCSViews` | `GCSViews/Help.cs` | ❌ | Справка |

### 3.3 ArduPilot Domain Layer

| Компонент | Класс | Файл | Строк | Описание |
|---|---|---|---|---|
| **MAVLink Interface** | `MAVLinkInterface` | `ExtLibs/ArduPilot/Mavlink/MAVLinkInterface.cs` | 6 899 | Основной класс коммуникации: `Open()`, `Close()`, `readPacket()`, `sendPacket()`, `getParam()`, `setParam()`, upload/download mission |
| **MAV List** | `MAVList` | `ExtLibs/ArduPilot/Mavlink/MAVList.cs` | — | Коллекция `MAVState` по `[sysid, compid]`. Multi-vehicle support |
| **MAV State** | `MAVState` | `ExtLibs/ArduPilot/Mavlink/MAVState.cs` | 341 | Состояние одного MAV: `CurrentState cs`, `MAVLinkParamList param`, `wps`, `rallypoints`, `fencepoints`, `Camera`, `GimbalManager` |
| **Current State** | `CurrentState` | `ExtLibs/ArduPilot/CurrentState.cs` | 4 892 | Модель текущего состояния аппарата: ~300+ свойств (roll, pitch, yaw, lat, lng, alt, battery, sensors, GPS, mode и т.д.) |
| **MAVLink Protocol** | `MAVLink` (static) | `ExtLibs/Mavlink/Mavlink.cs` | ~175K | Автогенерированный файл: все message structs, enums, ID-маппинги |
| **MAVLink Parser** | `MavlinkParse` | `ExtLibs/Mavlink/MavlinkParse.cs` | — | Парсинг raw bytes → `MAVLinkMessage` |
| **Camera Protocol** | `CameraProtocol` | `ExtLibs/ArduPilot/Mavlink/CameraProtocol.cs` | — | MAVLink Camera Protocol v2 |
| **Gimbal Protocol** | `GimbalProtocol`, `GimbalManagerProtocol` | `ExtLibs/ArduPilot/Mavlink/` | — | Gimbal control (v1 deprecated, v2 via GimbalManager) |

**Ключевые связи:**
```
MAVLinkInterface
  ├── BaseStream : ICommsSerial        // транспорт (MAVLinkInterface.cs:32)
  ├── MAVlist : MAVList                // коллекция vehicles (MAVLinkInterface.cs:317)
  │     └── [sysid,compid] → MAVState
  │           ├── cs : CurrentState    // текущее состояние
  │           ├── param : MAVLinkParamList  // параметры
  │           ├── wps : ConcurrentDictionary  // waypoints
  │           ├── Camera : CameraProtocol
  │           └── GimbalManager : GimbalManagerProtocol
  ├── Subscriptions : List<(msgId,func,exclusive,sysid,compid)>  // (MAVLinkInterface.cs:5554)
  │     → PacketReceived() dispatch по msgid+sysid+compid фильтру
  ├── logfile : BufferedStream         // telemetry log (.tlog)
  ├── rawlogfile : BufferedStream      // raw log
  └── Events:
        ├── OnPacketReceived           // каждый принятый пакет (broadcast, все sysid)
        ├── OnPacketSent               // каждый отправленный пакет
        ├── MAVDetected                // обнаружен новый MAV по HEARTBEAT (MAVLinkInterface.cs:88)
        ├── ParamListChanged           // обновление параметров
        ├── MavChanged                 // смена активного sysid/compid
        └── CommsClose                 // закрытие соединения
```

**Два механизма подписки на пакеты:**

| Механизм | Метод / Event | Фильтрация | Применение |
|---|---|---|---|
| **Subscriptions** | `SubscribeToPacketType(msgid, func, sysid, compid)` (MAVLinkInterface.cs:5564) | По `msgid` + `sysid`+`compid` (точное совпадение или `0,0` = current) | Временные подписки: `getParam`, `setParam`, mission upload/download |
| **OnPacketReceived** event | `_OnPacketReceived?.Invoke(this, message)` (MAVLinkInterface.cs:5366) | Нет фильтрации — все пакеты со всех sysid | Постоянные подписчики: `CurrentState.Parent_OnPacketReceived`, плагины |

**Порядок вызова** внутри `readPacketAsync()` (MAVLinkInterface.cs:5199-5366):
1. `MAVlist[sysid,compid].addPacket(message)` — сохранение в буфер
2. `PacketReceived(message)` — dispatch в `Subscriptions`
3. `_OnPacketReceived?.Invoke(this, message)` — broadcast event

### 3.4 Communication Layer

| Реализация | Класс | Файл | Наследует | Протокол |
|---|---|---|---|---|
| **Serial Port** | `SerialPort` | `ExtLibs/Comms/CommsSerialPort.cs` | `ICommsSerial` (Decorator) | USB Serial / UART |
| **TCP Client** | `TcpSerial` | `ExtLibs/Comms/CommsTCPSerial.cs` | `CommsBase`, `ICommsSerial` | TCP |
| **UDP Listen** | `UdpSerial` | `ExtLibs/Comms/CommsUdpSerial.cs` | `CommsBase`, `ICommsSerial` | UDP (listen mode) |
| **UDP Connect** | `UdpSerialConnect` | `ExtLibs/Comms/CommsUDPSerialConnect.cs` | `CommsBase`, `ICommsSerial` | UDP (connect mode) |
| **WebSocket** | `WebSocket` | `ExtLibs/Comms/CommsWebSocket.cs` | `CommsBase`, `ICommsSerial` | WebSocket |
| **BLE** | `CommsBLE` | `ExtLibs/Comms/CommsBLE.cs` | — | Bluetooth Low Energy |
| **NTRIP** | `CommsNTRIP` | `ExtLibs/Comms/CommsNTRIP.cs` | — | NTRIP (RTK corrections) |
| **WinUSB** | `CommsWinUSB` | `ExtLibs/Comms/CommsWinUSB.cs` | — | WinUSB direct |
| **Serial Pipe** | `CommsSerialPipe` | `ExtLibs/Comms/CommsSerialPipe.cs` | — | Named pipe |
| **File** | `CommsFile` | `ExtLibs/Comms/CommsFile.cs` | — | File playback |
| **Injection** | `CommsInjection` | `ExtLibs/Comms/CommsInjection.cs` | — | In-memory injection |
| **Stream** | `CommsStream` | `ExtLibs/Comms/CommsStream.cs` | — | Generic .NET Stream |

**Иерархия наследования:**

```
    ICommsSerial (ExtLibs/Interfaces/ICommsSerial.cs:6)
    ├── Open(), Close(), Read(byte[],int,int), Write(byte[],int,int)
    ├── IsOpen, BaudRate, PortName, ReadTimeout, WriteTimeout
    ├── BytesToRead, BytesToWrite
    └── toggleDTR()
    
    CommsBase (ExtLibs/Comms/CommsBase.cs:18) — abstract class
    ├── static event: InputBoxShow, Settings, ApplyTheme
    ├── НЕ реализует ICommsSerial
    └── Наследуется TcpSerial, UdpSerial, UdpSerialConnect, WebSocket
        (предоставляет UI-callbacks для input dialogs из transport layer)
```

**⚠ Паттерн Decorator в `SerialPort`:**
`SerialPort` (CommsSerialPort.cs:14) НЕ наследует `CommsBase`. Вместо этого использует паттерн Decorator — делегирует все вызовы внутреннему `_baseport : ICommsSerial`, который по умолчанию создаётся как `WinSerialPort` (CommsSerialPort.cs:414) через `DefaultType` factory (CommsSerialPort.cs:18). `WinSerialPort` наследует `System.IO.Ports.SerialPort`.

### 3.5 Plugin System

| Компонент | Класс | Файл | Описание |
|---|---|---|---|
| **Loader** | `PluginLoader` | `Plugin/PluginLoader.cs` | Загружает `.dll` из `plugins/`, компилирует `.cs` через Roslyn |
| **Base Class** | `Plugin` (abstract) | `Plugin/Plugin.cs` | Lifecycle: `Init()` → `Loaded()` → `Loop()` → `Exit()` |
| **Host** | `PluginHost` | `Plugin/Plugin.cs` | Предоставляет плагинам доступ к `MainV2`, `comPort`, `FlightData`, `FlightPlanner`, `Settings` |

**Механизм загрузки** (PluginLoader.cs:203-311):

1. Сканирует `{RunningDir}/plugins/` на `.dll` и `.cs` файлы
2. `.dll` — загружает через `Assembly.LoadFile()` (PluginLoader.cs)
3. `.cs` — компилирует в background через `CodeGenRoslyn.BuildCode()` (Roslyn C# 8) с fallback на `CodeGen` (C# 5)
4. Ищет типы, наследующие `Plugin`, создаёт экземпляры
5. Вызывает `Plugin.Init()` → при успехе добавляет в `LoadingPlugins`
6. На UI-потоке вызывает `Plugin.Loaded()` → при успехе добавляет в `Plugins`
7. В отдельном потоке `pluginthreadrun` периодически вызывает `Plugin.Loop()`

**Runtime compilation поддерживает директивы:**
```csharp
//loadassembly: MissionPlanner.WebAPIs  // подгрузка зависимости
```

### 3.6 Services & Managers

| Сервис | Класс / Namespace | Файл | Тип | Описание |
|---|---|---|---|---|
| **Settings** | `Settings` (Singleton) | `ExtLibs/Utilities/Settings.cs` | Configuration | XML-based key-value store. Файл: `config.xml`. Методы: `GetBoolean()`, `GetInt32()`, `GetFloat()`, `GetList()` |
| **ThemeManager** | `ThemeManager` (static) | `Utilities/ThemeManager.cs` | UI Theming | Загружает `.mpsystheme` / `.mpusertheme` файлы. Рекурсивно применяет цвета ко всем WinForms контролам |
| **HTTP Server** | `httpserver` | `Utilities/httpserver.cs` | API | Встроенный HTTP-сервер для внешних интеграций |
| **Speech Engine** | `ISpeech` → `MainV2.speechEngine` | `MainV2.cs:486` | Audio | Text-to-Speech для голосовых оповещений |
| **ADSB** | `adsb` | `ExtLibs/Utilities/adsb.cs` | Airspace | Приём ADS-B данных, отрисовка трафика на карте |
| **Joystick** | `JoystickBase` → `MainV2.joystick` | `Joystick/` | Input | DirectInput (SharpDX) для управления RC override |
| **SRTM** | `srtm` | `ExtLibs/Utilities/srtm.cs` | Elevation | Данные высот из NASA SRTM |
| **DFLog** | `DFLog` | `ExtLibs/Utilities/DFLog.cs` | Logging | Парсинг DataFlash бинарных логов |
| **Tracking** | `Tracking` | `ExtLibs/Utilities/Tracking.cs` | Analytics | Анонимная аналитика использования |
| **Firmware** | `Firmware` | `Utilities/Firmware.cs` | Update | Загрузка и прошивка firmware через `px4uploader` |
| **Auto Update** | `Update` | `Utilities/Update.cs` | Self-update | Самообновление приложения MP |

**Settings.cs — ключевые пути данных:**

| Метод | Платформа | Путь |
|---|---|---|
| `GetRunningDirectory()` | — | Директория `.exe` |
| `GetDataDirectory()` | Windows | `C:\ProgramData\Mission Planner\` |
| `GetDataDirectory()` | Mono | = `GetUserDataDirectory()` |
| `GetUserDataDirectory()` | Windows | `%USERPROFILE%\Documents\Mission Planner\` |
| `GetUserDataDirectory()` | Linux | `~/.local/share/Mission Planner/` |

---

## 4. Data Flow: от MAVLink пакета до UI

Это **ключевой архитектурный поток** Mission Planner. Порядок вызовов верифицирован по коду `readPacketAsync()` (MAVLinkInterface.cs:4664-5366) и `SerialReader()` (MainV2.cs:2594-3088).

```
┌──────────────┐
│ Physical     │  USB Serial / TCP / UDP / BLE / WebSocket
│ Transport    │
└──────┬───────┘
       │ bytes
       ▼
┌──────────────┐
│ ICommsSerial │  SerialPort, TcpSerial, UdpSerial, etc.
│ Read()       │
└──────┬───────┘
       │ raw bytes  (вызывается из SerialReader → port.readPacketAsync)
       ▼
┌──────────────────────────────┐
│ MAVLinkInterface             │  readPacketAsync() (MAVLinkInterface.cs:4664)
│  .readPacketAsync()          │  → MavlinkParse.ReadPacket()
│                              │  Парсит MAVLink v1/v2 frame, проверяет CRC,
│                              │  проверяет signing (SHA256)
└──────┬───────────────────────┘
       │ MAVLinkMessage (parsed + validated)
       │
       ├─── 1. MAVlist[sysid,compid].addPacket(message)  ← MAVLinkInterface.cs:5199
       │        Сохраняет в packets[msgid] и packetsLast[msgid]
       │
       ├─── 2. PacketReceived(message)                    ← MAVLinkInterface.cs:5364
       │        Dispatch в Subscriptions (filtered по msgid+sysid+compid)
       │        Используется для: getParam, setParam, mission upload/download
       │
       ├─── 3. _OnPacketReceived?.Invoke(this, message)   ← MAVLinkInterface.cs:5366
       │        Broadcast event (все подписчики, без фильтрации)
       │        │
       │        └──→ CurrentState.Parent_OnPacketReceived()  (CurrentState.cs:2276)
       │              Проверка: sysid+compid match ИЛИ RADIO/RADIO_STATUS broadcast
       │              ИЛИ NAMED_VALUE_FLOAT propagation (setting-controlled)
       │              switch(msgid): ~60+ case-блоков
       │              → Распаковка MAVLink struct → обновление свойств
       │                (roll, pitch, yaw, lat, lng, alt, battery, mode...)
       │
       ▼
  [ возврат в SerialReader loop — MainV2.cs:3046-3057 ]
       │
       │  ПОСЛЕ цикла readPacketAsync (когда BytesToRead <= minbytes):
       ▼
┌──────────────────────────────┐
│ CurrentState                 │  Вызов: MAV.cs.UpdateCurrentSettings(null,false,port,MAV)
│  .UpdateCurrentSettings()    │  ← MainV2.cs:3064 (НЕ из event handler!)
│  (CurrentState.cs:4455)      │  Guard: раз в 50ms (20 Hz)
│                              │  Вычисляет: distTraveled, timeInAir,
│                              │  linkqualitygcs, timeSinceArmInAir
└──────┬───────────────────────┘
       │ Properties updated
       ▼
┌──────────────────────────────┐
│ UI Thread (WinForms)         │  [Assumption] Timer-based BeginInvoke
│  FlightData / FlightPlanner  │  Читает MainV2.comPort.MAV.cs.{property}
│  HUD, QuickView, Gauges      │  напрямую из UI timer callback
└──────────────────────────────┘
```

**Ключевые точки:**

1. **SerialReader** (`MainV2.cs:2594`) — `async void` метод, вызывается из `MainV2_Load` (MainV2.cs:3256). Цикл `while(serialThread)` итерирует по всем портам в `Comports` (MainV2.cs:3024).
2. **readPacketAsync inner loop** (`MainV2.cs:3046-3057`) — вызывает `port.readPacketAsync()` пока `BaseStream.BytesToRead > minbytes` И не прошла 1 секунда. Одновременно читает только один порт.
3. **Порядок dispatch** (MAVLinkInterface.cs:5199→5364→5366): `addPacket` → `Subscriptions` (filtered) → `OnPacketReceived` (broadcast). Это означает, что временные подписки (getParam) обрабатываются РАНЬШЕ чем постоянные (CurrentState).
4. **UpdateCurrentSettings** вызывается ПОСЛЕ выхода из inner read loop, НЕ из event handler. Это отдельный шаг (MainV2.cs:3060-3070) для каждого MAV на порте.
5. **UI Binding** — `[Assumption: Timer + BeginInvoke poll]` — не WPF data binding. UI потенциально читает `MainV2.comPort.MAV.cs.*` напрямую. Требует верификации чтением FlightData.cs.

---

## 5. Потоки выполнения

| Поток | Управление | Метод / точка запуска | Описание |
|---|---|---|---|
| **UI Thread** | `Application.Run(MainV2)` | `Program.cs` | WinForms message pump. Все UI-операции. |
| **Serial Reader** | `serialThread` flag | `MainV2.SerialReader()` (MainV2.cs:2594) | Основной MAVLink read loop. Async void, вызывает `readPacketAsync()`. Обрабатывает speech, battery alerts, heartbeat sending. |
| **Plugin Thread** | `pluginthreadrun` flag | `MainV2` | Периодически вызывает `Plugin.Loop()` для всех загруженных плагинов |
| **Joystick Thread** | `joystickthreadrun` flag | `MainV2` | Чтение джойстика через SharpDX DirectInput, генерация RC override |
| **HTTP Server** | `httpthread` Thread | `Utilities/httpserver.cs` | Встроенный HTTP API (TCP listener) |
| **ADSB Thread** | `adsbThread` flag | `MainV2` | Приём ADS-B данных via SBS format |
| **Plugin CS Compile** | `Task.Run()` | `PluginLoader.LoadAll()` (PluginLoader.cs:214) | Background компиляция `.cs` плагинов через Roslyn |

---

## 6. Зависимости между подсистемами

### 6.1 Матрица зависимостей

| Зависящий ↓ / Зависимость → | MainV2 | MAVLinkInterface | CurrentState | Settings | ICommsSerial | PluginHost | ThemeManager | GMap.NET |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **MainV2** | — | ✅ | ✅ (через MAV.cs) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **FlightData** | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| **FlightPlanner** | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| **MAVLinkInterface** | — | — | — | ✅ | ✅ | — | — | — |
| **CurrentState** | — | ✅ (parent.parent) | — | ✅ | — | — | — | — |
| **PluginLoader** | ✅ | — | — | ✅ | — | — | — | — |
| **PluginHost** | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| **Settings** | — | — | — | — | — | — | — | — |
| **ThemeManager** | ✅ | — | — | ✅ | — | — | — | — |

### 6.2 Ключевые coupling points

| Coupling | Описание | Риск |
|---|---|---|
| `MainV2.comPort` (static) | Глобальная точка входа к active MAVLinkInterface | 🔴 Tight coupling. Все компоненты напрямую зависят от этого поля |
| `MainV2.instance` (static) | Глобальный доступ к main form | 🔴 God Object. Используется в PluginHost, ThemeManager, Settings callbacks |
| `CurrentState.parent.parent` | `CurrentState` → `MAVState` → `MAVLinkInterface` | 🟡 Back-reference. Необходимо для подписки на events |
| `CommsBase.Settings` (event) | Transport layer зависит от UI для settings/inputbox | 🟡 Cross-layer callback |
| `PluginHost` → `MainV2.*` | Плагины имеют доступ ко всему через PluginHost | 🟡 No API boundary |

---

## 7. Управление конфигурацией

### 7.1 Settings (config.xml)

**Класс:** `MissionPlanner.Utilities.Settings` (Settings.cs)
**Хранилище:** `Dictionary<string, string>` → XML файл `config.xml`
**Паттерн:** Singleton с lazy load

```csharp
Settings.Instance["key"]                    // get/set string
Settings.Instance.GetBoolean("key", false)  // typed accessor
Settings.Instance.GetFloat("key", 0)        // typed accessor
Settings.Instance.GetList("key")            // semicolon-separated list
Settings.Instance.ComPort                   // convenience property → this["comport"]
Settings.Instance.BaudRate                  // → this[ComPort + "_BAUD"]
```

**Поддержка defaults:** `custom.config.xml` в running directory — загружается ПЕРЕД `config.xml`, переопределяется user-config.

### 7.2 ThemeManager

**Класс:** `MissionPlanner.Utilities.ThemeManager` (ThemeManager.cs:159)
**Хранилище:** XML-сериализованный `ThemeColorTable` → `.mpsystheme` / `.mpusertheme` файлы
**Паттерн:** Static class с runtime reflection

- 25+ цветовых переменных (`BGColor`, `TextColor`, `ButBG`, `HudGroundTop` и т.д.)
- `LoadTheme(name)` — загружает XML → через reflection обновляет static fields
- `ApplyThemeTo(Control)` — рекурсивно применяет тему ко всем дочерним контролам
- `[PreventThemingAttribute]` — opt-out для конкретных контролов

---

## 8. Multi-Vehicle Architecture

```
MainV2
  ├── comPort : MAVLinkInterface      // ACTIVE connection (static)
  └── Comports : List<MAVLinkInterface>  // ALL connections (static)
        ├── [0] MAVLinkInterface ──── ICommsSerial (Serial COM3)
        │     └── MAVlist : MAVList
        │           ├── [1,1] → MAVState (vehicle 1, autopilot)
        │           │     ├── cs : CurrentState
        │           │     └── param : MAVLinkParamList
        │           ├── [1,100] → MAVState (vehicle 1, camera)
        │           └── [2,1] → MAVState (vehicle 2, autopilot)
        ├── [1] MAVLinkInterface ──── ICommsSerial (UDP :14550)
        │     └── MAVlist
        │           └── [3,1] → MAVState (vehicle 3)
        └── ...
```

**Логика переключения:**
- `MAVLinkInterface.sysidcurrent` / `compidcurrent` — определяют активный `MAVState`
- `MAVLinkInterface.MAV` — shortcut для `MAVlist[sysidcurrent, compidcurrent]`
- `MainV2.comPort` — определяет активный `MAVLinkInterface`
- Изменение `sysidcurrent` → fires `MavChanged` event → UI перерисовывается

---

## 9. MainSwitcher — View Lifecycle

**Класс:** `MissionPlanner.Controls.MainSwitcher` (MainSwitcher.cs)

```
                         MainSwitcher.ShowScreen(name)
                                    │
                ┌───────────────────┤
                ▼                   ▼
        [Current != null]     [Find next screen]
                │                   │
        Deactivate()          Create if null:
        Remove from panel       Activator.CreateInstance(Type)
        if !Persistent:       │
          Close()             Set Dock = Fill
          Dispose()           Apply Theme
          Control = null      │
                              Activate()
                              Add to MainControl
                              current = nextscreen
```

**Interfaces:**
- `IActivate` — вызывается при показе view
- `IDeactivate` — вызывается при скрытии view
- `MyUserControl` — базовый класс для всех view'ов (расширяет `UserControl` с `Close()`)

---

## ❓ Open Questions

- [ ] **Data binding:** Как именно UI views (FlightData) получают обновления из `CurrentState`? `[Assumption: Timer + BeginInvoke poll]` Нужна верификация чтением `FlightData.cs` — искать `Timer`, `BeginInvoke`, `bindingSource`, или `PropertyChanged`.
- [ ] **Thread safety CurrentState:** `CurrentState` обновляется из SerialReader thread (через `Parent_OnPacketReceived`), а `UpdateCurrentSettings` защищён `lock(this)` (CurrentState.cs:4458). Но отдельные property setters (roll, pitch, yaw, lat, lng) НЕ synchronized — `[Assumption: возможны torn reads на UI thread для double/float свойств]`.
- [ ] **httpserver endpoints:** Какие HTTP API endpoints экспортируются? Каков формат данных? Требует чтения `Utilities/httpserver.cs`.
- [ ] **Mirror streams:** `MAVLinkInterface.Mirrors : List<Mirror>` (MAVLinkInterface.cs:174) — `Mirror` содержит `ICommsSerial MirrorStream` + `bool MirrorStreamWrite`. `[Assumption: используется для ретрансляции MAVLink потока на второй порт (GCS↔GCS forwarding)]`. Требует проверки вызовов `Mirrors` в readPacketAsync.
- [x] **MAVList и hot-plug:** ✅ RESOLVED. Обнаружение нового vehicle происходит внутри `readPacketAsync()` при получении `HEARTBEAT` (MAVLinkInterface.cs:5280-5306): если `MAVlist.Contains(sysid,compid)` = false → `MAVlist.Create(sysid,compid)` → `_MAVDetected?.Invoke()`. Аналогично для `HIGH_LATENCY2` (MAVLinkInterface.cs:5309-5336) и `UAVCAN_NODE_STATUS` (MAVLinkInterface.cs:5248-5264).

---

## 📎 Ссылки на исходники

| Компонент | Файл | Строки |
|---|---|---|
| MainV2 class | `MainV2.cs` | 1-4827 |
| MainSwitcher | `ExtLibs/Controls/MainSwitcher.cs` | 1-277 |
| MAVLinkInterface | `ExtLibs/ArduPilot/Mavlink/MAVLinkInterface.cs` | 1-6899 |
| MAVState | `ExtLibs/ArduPilot/Mavlink/MAVState.cs` | 1-341 |
| CurrentState | `ExtLibs/ArduPilot/CurrentState.cs` | 1-4892 |
| ICommsSerial | `ExtLibs/Interfaces/ICommsSerial.cs` | 1-75 |
| IMAVLinkInterface | `ExtLibs/Utilities/IMAVLinkInterface.cs` | 1-37 |
| CommsBase | `ExtLibs/Comms/CommsBase.cs` | 1-69 |
| Settings | `ExtLibs/Utilities/Settings.cs` | 1-562 |
| ThemeManager | `Utilities/ThemeManager.cs` | 159-1430 |
| PluginLoader | `Plugin/PluginLoader.cs` | 1-342 |
| Plugin + PluginHost | `Plugin/Plugin.cs` | 1-251 |
