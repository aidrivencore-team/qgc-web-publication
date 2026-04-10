# 📊 Mission Planner — Codebase Audit Report

> **Репозиторий:** MissionPlanner-master (github.com/ArduPilot/MissionPlanner)
> **Дата анализа:** 2026-04-06
> **Автор проекта:** Michael Oborne
> **Лицензия:** GPLv3 (COPYING.txt)
> **Тип архитектуры:** Модульный монолит с плагин-системой
> **Гипотеза:** *"Mission Planner — это WinForms-based Ground Control Station для ArduPilot, построенная как монолит на .NET Framework 4.7.2, с модульной декомпозицией через ExtLibs и runtime plugin system."* — **Подтверждена.**

---

## 1. Общие метрики репозитория

| Метрика | Значение |
|---|---|
| Всего `.cs` файлов | **3 675** |
| `.cs` в корне проекта (без ExtLibs) | **472** |
| `.cs` в ExtLibs | **3 203** |
| `.resx` файлов (локализация) | **1 253** |
| `.csproj` проектов | **129** |
| `.sln` solutions | **16** (в корне: `MissionPlanner.sln`, `MissionPlannerLib.sln`; остальные 14 — в ExtLibs и Updater) |
| Проектов в MissionPlanner.sln | **93** |
| Поддерживаемые языки (LOC) | C# (основной), Python (скрипты mavlink), HTML (HUD), Lua |

---

## 2. Структура репозитория

### 2.1 Директории верхнего уровня

| Директория | Назначение | Тип |
|---|---|---|
| `/` (root) | Основной проект MissionPlanner: `MainV2.cs`, `Program.cs`, конфигурация, входные XML | Application Root |
| `GCSViews/` | **Основные экраны** приложения: FlightData, FlightPlanner, SITL, InitialSetup, SoftwareConfig, Help | UI Views |
| `GCSViews/ConfigurationView/` | Конфигурационные панели (734 файлов вкл. .resx/.Designer.cs, ~123 чистых .cs): firmware, calibration, parameters, failsafe, motors и т.д. | UI Config |
| `Controls/` | Пользовательские WinForms контролы: ConnectionControl, MAVLink Inspector, DroneCAN UI, Gimbal, Joystick | UI Controls |
| `ExtLibs/` | **Внешние и внутренние библиотеки** (~89 поддиректорий) — ядро системы | Libraries |
| `ExtLibs/ArduPilot/` | Модели ArduPilot: CurrentState, MAVLinkInterface, Fence, Missions, Params | Domain Models |
| `ExtLibs/Mavlink/` | Автогенерированный MAVLink-протокол (Mavlink.cs — 1.7MB) | Protocol |
| `ExtLibs/Comms/` | Транспортный слой: Serial, TCP, UDP, WebSocket, BLE, NTRIP, WinUSB | Communications |
| `ExtLibs/Utilities/` | Утилиты: Settings, SRTM, ADSB, Grid, DFLog, Tracking, GeoRef, параметры | Utilities |
| `ExtLibs/Controls/` | Shared WinForms контролы: HUD, BackstageView, MainSwitcher, Gauges | Shared UI |
| `ExtLibs/Maps/` | Кастомные карт-провайдеры (WMS, WMTS, MapBox, Japan, Arctic и др.) | Maps |
| `Plugin/` | Плагин-система: `Plugin.cs` (базовый класс), `PluginLoader.cs`, `PluginHost.cs` | Plugin Framework |
| `Plugins/` | Конкретные плагины: Shortcuts, FaceMap, OpenDroneID, Dowding, TerrainMaker | Plugins |
| `plugins/` (lowercase) | Runtime `.cs` плагины (компилируются на лету): ~25 примеров | Runtime Plugins |
| `Utilities/` | Утилиты уровня приложения: ThemeManager, httpserver, Firmware, Update, Speech, BoardDetect | App Utilities |
| `Log/` | Подсистема логов: LogBrowse, LogDownload (MAVLink, SCP), LogIndex, MavlinkLog | Log Management |
| `LogAnalyzer/` | Автоматический анализ полётных логов | Log Analysis |
| `Joystick/` | Поддержка джойстиков: JoystickSetup, JoystickAxis | Input Devices |
| `Radio/` | Конфигурация SiK-радио модулей | Radio Config |
| `SikRadio/` | Отдельный проект для SiK Radio | Radio Tool |
| `Antenna/` | Трекер антенны (TrackerUI) | Antenna Tracker |
| `Swarm/` | Управление роем: Grid, Status | Multi-Vehicle |
| `Warnings/` | Система предупреждений: WarningControl | Alerts |
| `Grid/` | Survey grid / сеточное планирование миссий | Mission Planning |
| `GeoRef/` | Гео-привязка фотографий | Photo Geotagging |
| `NoFly/` | NFZ (No Fly Zones) | Airspace |
| `Scripts/` | Пользовательские IronPython-скрипты | Scripting |
| `Resources/` | Встроенные ресурсы (иконки, изображения) | Assets |
| `Properties/` | Assembly info, app.manifest | Build Config |
| `Drivers/` | USB-драйверы для полётных контроллеров (CubePilot, ChibiOS, Holybro) | Drivers |
| `Updater/` | Auto-update приложения | Self-Update |
| `Msi/` | WiX MSI installer | Installer |
| `wix/` | WiX installer project | Installer |
| `MissionPlannerTests/` | Юнит-тесты | Tests |
| `.github/` | GitHub Actions CI/CD | CI/CD |
| `docs/` | Документация | Docs |
| `graphs/` | XML-определения графиков (EKF, mavgraphs) | Data Viz Config |
| `m3u/` | Видео-потоки (playlist) | Media |
| `test/` | Тестовые данные | Test Data |

---

## 3. Технологический стек

### 3.1 Базовый стек

| Слой | Технология | Версия | Роль |
|---|---|---|---|
| **Язык** | C# | ~8.0 | Основной язык |
| **Фреймворк** | .NET Framework | 4.7.2 (net472) | Runtime |
| **UI Framework** | Windows Forms (WinForms) | 4.x | Desktop UI |
| **Скрипты** | IronPython | 3.4.1 | Пользовательские скрипты |
| **IDE** | Visual Studio 2022+ | 17.3+ | Рекомендуемая IDE |
| **Build** | MSBuild (SDK-style) | — | Система сборки |

### 3.2 Ключевые NuGet-зависимости

| Пакет | Версия | Назначение |
|---|---|---|
| `Newtonsoft.Json` | 13.0.3 | Сериализация JSON |
| `log4net` | 2.0.13 | Логирование |
| `SkiaSharp` | 2.88.8 | 2D-графика (кросс-платформенный рендеринг) |
| `OpenTK` / `OpenTK.GLControl` | 3.1.0 | 3D-визуализация (OpenGL) |
| `SharpDX` / `SharpDX.DirectInput` | 4.1.0 | DirectX Input (джойстики) |
| `Accord.Imaging` / `Accord.Vision` | 3.8.0 | Компьютерное зрение |
| `GDAL` / `GDAL.Native` | 2.3.2 | Геопространственные данные / elevation |
| `SSH.NET` | 2020.0.2 | SSH-соединения |
| `Flurl` / `Flurl.Http` | 3.0.2 / 3.2.0 | HTTP-клиент |
| `System.Reactive` | 4.0.0 | Reactive Extensions |
| `BouncyCastle.Cryptography` | 2.4.0 | Криптография |
| `Xamarin.Essentials` | 1.6.1 | Кросс-платформенные API |
| `Xamarin.Forms` | 5.0.0.2012 | Кросс-платформенный UI (Android/iOS) |
| `GeoJSON.Net` | 1.1.64 | GeoJSON parsing |
| `WebSocket4Net` | 0.15.2 | WebSocket-клиент |
| `CSMatIO` | 1.0.20 | MATLAB file I/O |
| `DotNetZip` | 1.12.0 | ZIP-архивы |
| `System.IO.Ports` | 4.7.0 | Serial port |

### 3.3 Внутренние библиотеки (ExtLibs — Project References)

| Проект | Назначение |
|---|---|
| `MissionPlanner.ArduPilot` | Модели ArduPilot, CurrentState, MAVLinkInterface, Fence, перечисления режимов |
| `MAVLink` | Авто-gen MAVLink протокол, парсер, сообщения |
| `MissionPlanner.Comms` | Абстракция транспорта: SerialPort, TCP, UDP, BLE, NTRIP, WebSocket, WinUSB |
| `MissionPlanner.Utilities` | Settings, SRTM, ADSB, DFLog, Grid, Extensions, PointLatLngAlt |
| `MissionPlanner.Controls` | HUD, BackstageView, MainSwitcher, QuickView, ProgressReporter |
| `MissionPlanner.Maps` | Кастомные map providers (WMS, WMTS, MapBox, Japan, Arctic) |
| `MissionPlanner.Strings` | Строковые ресурсы для локализации |
| `GMap.NET.Core` / `GMap.NET.WindowsForms` / `GMap.NET.Drawing` | Картографический движок |
| `DroneCAN` | DroneCAN/UAVCAN протокол |
| `MissionPlanner.HIL` | Hardware-in-the-Loop simulation |
| `MissionPlanner.Antenna` | Antenna Tracker integration |
| `px4uploader` | Firmware uploader для PX4/ArduPilot |
| `ZedGraph` | Графики / Charts |
| `SharpKml` / `KMLib` | KML/KMZ parsing |
| `AltitudeAngelWings` + Plugin | UTM airspace data |
| `Onvif` | ONVIF camera control |
| `WebCamService` | Video capture |
| `LibVLC.NET` | VLC video rendering |
| `Transitions` | UI animations |
| `Interfaces` | Shared interfaces |
| `Ntrip` | NTRIP corrections |
| `NMEA2000` | NMEA 2000 protocol |
| `Flasher` / `DroneCANFlasher` | Firmware flashing |

---

## 4. Точки входа

### 4.1 Основная (Desktop Application)

| Файл | Класс / Метод | Описание |
|---|---|---|
| `Program.cs` | `Program.Main(string[] args)` | `[STAThread]` entry point. Вызывает `Program.Start()` |
| `Program.cs` | `Program.Start()` | Инициализация: log4net, GMap кэш, карты, proxy, splash, запуск `Application.Run(new MainV2())` |
| `MainV2.cs` | `MainV2()` constructor | Основная форма: загрузка конфигурации, инициализация тем, comPort, speech engine, serial ports, ADSB |
| `MainV2.cs` | `MainV2_Load()` | Выполняется после показа формы: загрузка плагинов, обновление, запуск serial thread, HTTP-сервер |

### 4.2 Startup Object (csproj)

```xml
<StartupObject>MissionPlanner.Program</StartupObject>
```

### 4.3 Альтернативные entry points

| Контекст | Описание |
|---|---|
| `/update` CLI flag | `Utilities.Update.DoUpdate()` — автообновление |
| `/updatebeta` CLI flag | Beta-канал обновления |
| `-config <file.xml>` | Загрузка альтернативной конфигурации |
| `MissionPlannerLib.sln` | Сборка как библиотека (`#if LIB` conditional compilation) |

---

## 5. Ключевые Namespaces

| Namespace | Основные классы | Описание |
|---|---|---|
| `MissionPlanner` | `Program`, `MainV2`, `Common`, `Script`, `MagCalib` | Корень приложения, main form, entry point |
| `MissionPlanner.GCSViews` | `FlightData`, `FlightPlanner`, `SITL`, `InitialSetup`, `SoftwareConfig`, `Help` | Основные экраны (UserControl) |
| `MissionPlanner.GCSViews.ConfigurationView` | `ConfigFirmware`, `ConfigRawParams`, `ConfigFlightModes`, `ConfigFailSafe`, `ConfigRadioInput`, ~50+ views | Конфигурационные панели |
| `MissionPlanner.Controls` | `ConnectionControl`, `MAVLinkInspector`, `DroneCANParams`, `FollowMe`, `GimbalVideoControl`, `SerialOutput*` | Пользовательские UI-контролы |
| `MissionPlanner.ArduPilot` | `CurrentState`, `Fence`, `Camera`, `GimbalPoint`, `APFirmware` | Модели данных ArduPilot |
| `MissionPlanner.ArduPilot.Mavlink` | `MAVLinkInterface`, `MAVState`, `MAVList`, `MAVFtp`, `CameraProtocol`, `GimbalProtocol` | MAVLink коммуникация |
| `MissionPlanner.Comms` | `SerialPort`, `TcpSerial`, `UdpSerial`, `WebSocket`, `CommsBLE`, `CommsNTRIP` | Транспортный слой |
| `MissionPlanner.Utilities` | `Settings`, `Tracking`, `adsb`, `DFLog`, `Grid`, `srtm`, `PointLatLngAlt`, `ParamFile`, `MissionFile` | Утилиты и алгоритмы |
| `MissionPlanner.Plugin` | `Plugin` (abstract), `PluginHost`, `PluginLoader` | Плагин-система |
| `MissionPlanner.Maps` | `WMSProvider`, `WMTSProvider`, `MapBox`, `NoMap`, `Japan`, `GIBSArctic` | Карт-провайдеры |
| `MissionPlanner.Log` | `LogBrowse`, `LogDownload`, `MavlinkLog`, `LogIndex` | Управление логами |
| `MissionPlanner.Warnings` | `WarningControl` | Предупреждения |
| `MissionPlanner.Joystick` | `JoystickBase`, `JoystickSetup`, `JoystickAxis` | Джойстик-контроль |
| `MissionPlanner.Swarm` | `Grid`, `Status` | Multi-vehicle / рой |
| `MAVLink` | `MAVLinkMessage`, `MavlinkParse`, `MavlinkUtil`, `MAVLinkParam` | Протокол MAVLink (auto-gen) |
| `DroneCAN` | — | DroneCAN/UAVCAN протокол |
| `GMap.NET.*` | `GMapControl`, `GMapOverlay`, `GMaps` | Картографический движок |

---

## 6. Архитектурная модель

### 6.1 Тип: Модульный монолит

Mission Planner — это **монолитное десктопное приложение** с модульной внутренней структурой:

```
┌─────────────────────────────────────────────────┐
│                  MainV2 (Form)                  │
│         Главная форма + MainSwitcher            │
├───────┬────────┬──────┬───────────┬─────────────┤
│Flight │Flight  │SITL  │Initial    │Software     │
│Data   │Planner │      │Setup      │Config       │
│(view) │(view)  │(view)│(view)     │(view)       │
├───────┴────────┴──────┴───────────┴─────────────┤
│               Controls Layer                     │
│  ConnectionControl, HUD, MAVLink Inspector,     │
│  DroneCAN UI, Gimbal, Servo, FollowMe, etc.     │
├──────────────────────────────────────────────────┤
│              Plugin System                       │
│  Plugin → PluginHost → MainV2/comPort/FlightData │
├──────────────────────────────────────────────────┤
│          ArduPilot Domain Layer                   │
│  MAVLinkInterface, CurrentState, MAVState,       │
│  Fence, mav_mission, parampck                    │
├──────────────────────────────────────────────────┤
│          Communication Layer                     │
│  Serial, TCP, UDP, WebSocket, BLE, NTRIP,       │
│  WinUSB, MAVFtp                                 │
├──────────────────────────────────────────────────┤
│           Utilities Layer                        │
│  Settings, DFLog, SRTM, ADSB, Grid,            │
│  Tracking, GeoRef, ParameterMetadata            │
├──────────────────────────────────────────────────┤
│           Maps & Visualization                   │
│  GMap.NET, Custom Providers, ZedGraph, OpenGL    │
└──────────────────────────────────────────────────┘
```

### 6.2 Ключевые архитектурные характеристики

| Характеристика | Описание |
|---|---|
| **Single-process** | Всё работает в одном процессе (первично Windows, также Mono Linux/Mac) |
| **Event-driven** | MAVLink heartbeat loop → `Parent_OnPacketReceived` → обновление `CurrentState` → UI poll (см. 02_SYSTEM_ARCHITECTURE.md §4) |
| **Singleton pattern** | `MainV2.instance`, `MainV2.comPort` (static), `Settings.Instance` |
| **Multi-transport** | Один `MAVLinkInterface` поверх абстрактного `ICommsSerial` |
| **Multi-vehicle** | `MainV2.Comports` (List<MAVLinkInterface>), `MAVList` внутри interface |
| **Plugin architecture** | Runtime compilation `.cs` файлов + compiled `.dll` плагины |
| **Theming** | ThemeManager + `.mpsystheme` файлы (BurntKermit, HighContrast, Custom) |
| **i18n** | 15+ языков через `.resx` файлов |

### 6.3 Паттерн навигации

`MainV2` использует `MainSwitcher` (tab-like navigation) — не стандартный `TabControl`, а кастомный переключатель view:

- **FlightData** — мониторинг в реальном времени (HUD + карта + quickview)
- **FlightPlanner** — планирование миссии (карта + waypoint table)
- **InitialSetup** — начальная настройка (firmware, calibration)
- **SoftwareConfig** — конфигурация ПО (parameters, flight modes, failsafe)
- **SITL** — Software-in-the-Loop симуляция
- **Help** — справка

### 6.4 Потоки выполнения (Threads)

| Поток | Описание | Файл |
|---|---|---|
| **Base Thread** (UI) | WinForms message loop, Application.Run(MainV2) | `Program.cs:478` |
| **Serial Reader Thread** | `serialThread` — чтение MAVLink из comPort | `MainV2.cs` |
| **Plugin Thread** | `pluginthreadrun` — вызов `Plugin.Loop()` | `MainV2.cs` |
| **Joystick Thread** | `joystickthreadrun` — чтение joystick input | `MainV2.cs` |
| **HTTP Server Thread** | `httpthread` — встроенный HTTP API | `MainV2.cs`, `Utilities/httpserver.cs` |
| **ADSB Thread** | `adsbThread` — приём ADS-B данных | `MainV2.cs` |

---

## 7. Зависимости и внешние сервисы

### 7.1 Внешние сервисы (из README)

| Сервис | Использование |
|---|---|
| `firmware.oborne.me` | CDN для проверки обновлений MP (раз в день) |
| `firmware.ardupilot.org` | Обновления, firmware, SRTM, SITL, user alerts |
| `github.com / api.github.com` | Beta-обновления, param preload files |
| `ssl.google-analytics.com` | Анонимная аналитика (opt-out доступен) |
| `altitudeangel.com` | UTM airspace data (user-enabled) |
| `cloudflare.com` | Геолокация для NFZ |
| Map providers (many) | Google/Bing/OSM/MapBox и др. |

### 7.2 Данные кэша (offline)

| Путь | Содержимое |
|---|---|
| `C:\ProgramData\Mission Planner\gmapcache` | Кэш карт |
| `C:\ProgramData\Mission Planner\srtm` | Данные высот SRTM |
| `C:\ProgramData\Mission Planner\*.pdef.xml` | Кэш параметров |
| `C:\ProgramData\Mission Planner\LogMessages*.xml` | Метаданные DataFlash логов |

---

## 8. CI/CD и инфраструктура

| Компонент | Конфигурация |
|---|---|
| **CI: GitHub Actions** | `.github/workflows/main.yml` (.NET), `android.yml`, `mac.yml` |
| **CI: AppVeyor** | `appveyor.yml` — альтернативный CI |
| **CI: Azure Pipelines** | `azure-pipelines.yml` — ещё один CI |
| **Installer** | WiX MSI (`wix/`, `Msi/`), Windows Store (`ExtLibs/WindowsStore/`) |
| **Auto-update** | `Updater/` — встроенный механизм обновления |
| **Build scripts** | `build.bat`, `build - debug.bat`, `build - Clean.bat`, `build - Lib.ps1` |

---

## 9. Кросс-платформенность

| Платформа | Статус | Механизм |
|---|---|---|
| **Windows** | ✅ Primary | .NET Framework 4.7.2 + WinForms |
| **Linux** | ⚠️ Mono | `mono MissionPlanner.exe` (ограниченная функциональность) |
| **Android** | ✅ Google Play | Xamarin.Forms + Xamarin.Essentials |
| **macOS/iOS** | ⚠️ Experimental | Отдельные releases |
| **LIB mode** | ✅ | `#if LIB` — сборка как библиотека без Desktop-зависимостей |

---

## 10. Ключевые выводы

1. **Масштаб:** Проект огромен — 3 675 .cs файлов, 93 проекта в solution, более 15 лет разработки (Copyright 2010-2024).

2. **Монолит с модулями:** Несмотря на один процесс, код разделён по библиотекам (ExtLibs). Однако изоляция не строгая: `MainV2.instance` и `MainV2.comPort` (static singletons) пронизывают все слои, создавая tight coupling (см. 02_SYSTEM_ARCHITECTURE.md §6.2).

3. **MAVLink — ядро:** Вся коммуникация строится вокруг `MAVLinkInterface` → `MAVState` → `CurrentState`. Это центральная ось системы.

4. **Гибкость транспорта:** 12 реализаций `ICommsSerial` — от Serial до BLE. `SerialPort` использует Decorator-паттерн (см. 02_SYSTEM_ARCHITECTURE.md §3.4).

5. **Plugin-система:** Позволяет расширять функциональность без модификации ядра. Поддержка runtime-компиляции `.cs` файлов.

6. **Богатая экосистема:** DroneCAN, NTRIP, ADS-B, ONVIF, GStreamer, RTK, NFZ, Survey Grid, LogAnalyzer — каждый как отдельный модуль.

7. **Устаревший UI-стек:** WinForms ограничивает кросс-платформенность и современный UX. Xamarin.Forms используется для мобильной версии.

8. **Отсутствие явного DI:** Используются статические синглтоны (`MainV2.instance`, `MainV2.comPort`), а не Dependency Injection.

9. **Огромные файлы:** `MainV2.cs` — 4 827 строк, `FlightPlanner.cs` — 8 556 строк (335KB), `FlightData.cs` — 6 692 строк (273KB), `MAVLinkInterface.cs` — 6 899 строк (280KB), `CurrentState.cs` — 4 892 строк. Рефакторинг назрел.

10. **Богатая локализация:** 15+ языков через .resx, но UI-тексты часто hardcoded.

---

## ❓ Open Questions

- [x] Как организован data flow от MAVLink serial thread до UI update? ✅ **RESOLVED** в 02_SYSTEM_ARCHITECTURE.md §4: `SerialReader` → `readPacketAsync()` → `addPacket` → `PacketReceived(Subscriptions)` → `OnPacketReceived` → `CurrentState.Parent_OnPacketReceived` (switch по msgid). `UpdateCurrentSettings` вызывается ПОСЛЕ read loop из SerialReader (MainV2.cs:3064), НЕ из event handler. UI читает свойства `[Assumption: через Timer + BeginInvoke poll]`.
- [ ] Какова роль `MissionPlannerLib.sln` vs `MissionPlanner.sln`? (`[Assumption: LIB — для embedded/headless использования, сборка с #if LIB без WinForms UI]`)
- [ ] Есть ли реальные юнит-тесты в `MissionPlannerTests/`? Каково покрытие? Требует чтения файлов.
- [ ] Как работает `httpserver.cs` — какие эндпоинты экспортирует? Требует чтения `Utilities/httpserver.cs`.
- [x] Каковы зависимости между плагинами и основным кодом? ✅ **RESOLVED** в 02_SYSTEM_ARCHITECTURE.md §3.5 и §6.2: API stability contract отсутствует. `PluginHost` предоставляет прямой доступ к `MainV2`, `comPort`, `FlightData`, `FlightPlanner`, `Settings` без какого-либо API boundary (🟡 риск).

---

## 📎 Зоны для дальнейшего анализа

| # | Тема | Приоритет |
|---|---|---|
| 02 | **MAVLink Communication Layer** — глубокий анализ MAVLinkInterface, transport, message flow | 🔴 High |
| 03 | **CurrentState + Data Models** — reverse-engineering модели состояния | 🔴 High |
| 04 | **Mission / Waypoint System** — FlightPlanner, mav_mission, locationwp | 🔴 High |
| 05 | **Parameter System** — metadata, storage, upload/download flow | 🟡 Medium |
| 06 | **Plugin Architecture** — loader, host, live examples | 🟡 Medium |
| 07 | **Logging Subsystem** — DFLog, tlog, LogBrowse, LogAnalyzer | 🟡 Medium |
| 08 | **HTTP API / External Integration** — httpserver.cs endpoints | 🟢 Low |
| 09 | **Сравнение с QGroundControl** — архитектурные паттерны, отличия | 🔴 High |
