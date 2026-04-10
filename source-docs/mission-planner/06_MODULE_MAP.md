# 06_MODULE_MAP.md — Mission Planner Module Map

**Version:** 1.1 (self-reviewed)  
**Date:** 2026-04-07  
**Scope:** Декомпозиция Mission Planner на модули — список, роли, зоны ответственности и связи  
**Method:** Static code analysis (solution structure, namespaces, project references)  

---

## 1. Верхнеуровневая архитектура

```
MissionPlanner.sln
├── [APP] MissionPlanner.csproj         ← WinForms приложение (net472)
├── [APP] Updater.csproj                ← Автообновление
├── [APP] SikRadio.csproj               ← Конфигуратор SiK radio
├── [APP] wix.csproj                    ← Windows Installer
│
├── [PLUGINS]
│   ├── Shortcuts.csproj
│   ├── FaceMap.csproj
│   └── 37 .cs файлов-плагинов (example*.cs, generator.cs)
│
└── [EXTLIBS] — 89 внутренних библиотек (solution: 93 проекта всего)
    ├── CORE: ArduPilot, Mavlink, Comms, Interfaces, Utilities
    ├── UI: Controls, Maps, ZedGraph, GMap.NET.*, BSE.Windows.Forms
    ├── IO: px4uploader, DroneCAN, Ntrip, Arduino
    ├── DATA: SharpKml, KMLib, netDxf, ProjNet, alglibnet, GDAL
    └── INFRA: mono, Xamarin, wasm, Drawing, Strings, 7zip
```

---

## 2. Модули главного приложения (MissionPlanner.csproj)

### 2.1 Core Application

| Файл | Строк | Роль | Ключевые зависимости |
|------|-------|------|---------------------|
| `Program.cs` | 883 | Entry point, crash handling, assembly loading, splash | MainV2, Settings, ThemeManager |
| `MainV2.cs` | 4827 | **God-object.** App lifecycle, connect/disconnect, serial reader, heartbeat, speech, firmware check, joystick, HTTP API, MQTT | comPort, FlightData, FlightPlanner, Settings, WarningEngine |
| `Script.cs` | 220 | IronPython scripting engine | MainV2.comPort, FlightPlanner.instance, CurrentState |
| `Common.cs` | 484 | Shared utilities, CustomMessageBox | — |
| `MagCalib.cs` | 1528 | Magnetometer calibration wizard | MAVLinkInterface |
| `Splash.cs` | 28 | Splash screen stub (main logic in Program.cs) | — |

### 2.2 GCS Views (основные экраны)

| Файл | Строк | Роль | Ключевые зависимости |
|------|-------|------|---------------------|
| `GCSViews/FlightData.cs` | 6693 | **God-object.** HUD, карта, graphs, actions, QuickView, log playback, scripts, servo, transponder | MainV2.comPort, CurrentState, ZedGraph, GMap |
| `GCSViews/FlightPlanner.cs` | 8557 | **God-object.** Mission editing, map overlays, WP upload/download, geofence, rally, survey grids, KML, elevation | MainV2.comPort, Locationwp, GMap |
| `GCSViews/InitialSetup.cs` | 405 | Hardware configuration hub — загрузка Config* pages через BackstageView | BackstageView, ConfigurationView/* |
| `GCSViews/SoftwareConfig.cs` | 331 | Software configuration hub — params, tuning, planner settings | BackstageView, ConfigurationView/* |
| `GCSViews/SITL.cs` | ~1100 | SITL simulator launcher и manager | MainV2.comPort |
| `GCSViews/Help.cs` | 84 | Ссылки на документацию | — |

### 2.3 Configuration Pages (GCSViews/ConfigurationView/)

**65** отдельных UserControl-ов, каждый отвечает за один аспект настройки:

| Категория | Pages | Примеры |
|-----------|-------|---------|
| **Firmware** | 3 | `ConfigFirmware`, `ConfigFirmwareManifest`, `ConfigFirmwareDisabled` |
| **Hardware Setup** | 12 | `ConfigRadioInput`, `ConfigHWCompass`, `ConfigAccelerometerCalibration`, `ConfigBatteryMonitoring`, `ConfigFrameClassType`, `ConfigHWRangeFinder`, `ConfigHWOptFlow`, `ConfigHWAirspeed`, `ConfigHWOSD`, `ConfigHWBT`, `ConfigHWCAN`, `ConfigHWParachute` |
| **Vehicle Tuning** | 5 | `ConfigArducopter`, `ConfigArduplane`, `ConfigArdurover`, `ConfigAteryx`, `ConfigTradHeli` |
| **Flight Modes** | 1 | `ConfigFlightModes` |
| **Failsafes** | 1 | `ConfigFailSafe` |
| **Geofence** | 1 | `ConfigAC_Fence` |
| **Parameters** | 3 | `ConfigRawParams`, `ConfigFriendlyParams`, `ConfigSimplePids` |
| **Planner** | 2 | `ConfigPlanner`, `ConfigPlannerAdv` |
| **Communication** | 3 | `ConfigSerialInjectGPS`, `ConfigSerial`, `ConfigHWesp8266` |
| **DroneCAN** | 1 | `ConfigDroneCAN` (71558 bytes — крупнейший config page) |
| **Other** | 8+ | `ConfigMotorTest`, `ConfigESCCalibration`, `ConfigMount`, `ConfigOSD`, `ConfigSecure`, `ConfigTerminal`, `ConfigADSB`, `ConfigFFT` |

### 2.4 App Utilities (Utilities/)

| Файл | Строк | Роль |
|------|-------|------|
| `ThemeManager.cs` | 1430 | Runtime theme engine — 30+ типов контролов, .mpsystheme/.mpusertheme |
| `Firmware.cs` | ~1600 | Firmware download/flash lifecycle |
| `httpserver.cs` | 1287 | Встроенный HTTP API сервер |
| `Speech.cs` | ~150 | Text-to-speech wrapper |
| `Update.cs` | ~800 | Self-update mechanism |
| `BoardDetect.cs` | ~750 | USB board identification (PID/VID) |
| `LogAnalyzer.cs` | ~250 | Log file analysis |
| `SSHTerminal.cs` | 1437 | SSH client для companion computers |
| `POI.cs` | ~180 | Points of Interest management |

### 2.5 Plugin System (Plugin/)

| Файл | Строк | Роль |
|------|-------|------|
| `Plugin.cs` | 251 | Abstract base class + `PluginHost` API definition |
| `PluginLoader.cs` | 341 | Discovery, compilation, lifecycle management |
| `PluginUI.cs` | 149 | Plugin management UI |

---

## 3. ExtLibs — Internal Libraries

### 3.1 CORE слой — протоколы и данные

| Модуль | Файл/Проект | Target | Роль | Ключевые классы |
|--------|-------------|--------|------|----------------|
| **MAVLink** | `ExtLibs/Mavlink/` | netstandard2.0 | Автогенерированные MAVLink structs и enums | `MAVLink`, `MAVLINK_MSG_ID`, все `mavlink_*_t` structs |
| **ArduPilot** | `ExtLibs/ArduPilot/` | netstandard2.0 | MAVLink engine + vehicle state | `MAVLinkInterface` (6898 строк), `MAVState`, `MAVList`, `CurrentState` (4891 строк), `MAVFtp`, `Firmwares`, `MAVLinkParamList` |
| **Comms** | `ExtLibs/Comms/` | netstandard2.0 | Transport implementations | `SerialPort`, `TcpSerial`, `UdpSerial`, `UdpSerialConnect` |
| **Interfaces** | `ExtLibs/Interfaces/` | netstandard2.0 | Transport abstraction | `ICommsSerial` |
| **Utilities** | `ExtLibs/Utilities/` | netstandard2.0 | Settings, WarningEngine, ADSB, Download, Tracking | `Settings`, `WarningEngine`, `CustomWarning`, `adsb`, `ParameterMetaDataRepository`, `Locationwp` |
| **Strings** | `ExtLibs/Strings/` | netstandard2.0 | Localization resources | `Strings.*` (15+ языков) |
| **Core** | `ExtLibs/Core/` | netstandard2.0 | Shared core types | Common base types |

### 3.2 UI слой — визуальные компоненты

| Модуль | Target | Роль | Ключевые классы |
|--------|--------|------|----------------|
| **Controls** | net472;netstandard2.0 | Custom WinForms controls | `HUD`, `QuickView`, `MyButton`, `MyLabel`, `BackstageView`, `ProgressReporterDialogue`, `MavlinkCheckBox`, `LineSeparator` |
| **GMap.NET.Core** | netstandard2.0 | Map engine core | `GMapControl`, `GMapOverlay`, `GMapMarker`, tile providers |
| **GMap.NET.WindowsForms** | net472;netstandard2.0 | WinForms map control | `GMapControl` (WinForms rendering) |
| **GMap.NET.Drawing** | netstandard2.0 | Drawing helpers для maps | SVG/Drawing integration |
| **Maps** | netstandard2.0 | MP-specific map providers | Custom tile sources |
| **ZedGraph** | net472;netstandard2.0 | Graphing library (forked) | `ZedGraphControl`, `GraphPane`, `RollingPointPairList` |
| **BSE.Windows.Forms** | net472 | Extended WinForms controls | Panel, Splitter helpers |
| **LEDBulb** | net472 | LED indicator control | `Bulb` |
| **Transitions** | netstandard2.0 | UI animation library | Animated transitions |
| **ObjectListView** | net472 | Enhanced ListView | — |
| **LibVLC.NET** | net472 | Video playback | VLC integration |
| **OSDConfigurator** | net472 | On-Screen Display editor | OSD parameters |

### 3.3 IO слой — устройства и протоколы

| Модуль | Target | Роль |
|--------|--------|------|
| **px4uploader** | netstandard2.0 | PX4/STM32 firmware upload via USB |
| **DroneCAN** | netstandard2.0 | DroneCAN (UAVCAN) protocol stack |
| **Arduino** | netstandard2.0 | Arduino bootloader communication |
| **Ntrip** | netcoreapp3.1 | NTRIP client для RTK GPS |
| **Antenna** | netstandard2.0 | Antenna tracker control |
| **HIL** | netstandard2.0 | Hardware-in-the-loop simulation |
| **solo** | netstandard2.0 | 3DR Solo drone integration |
| **SharpAdbClient** | netstandard2.0 | Android Debug Bridge client (для Herelink) |
| **ManagedNativeWifi.Simple** | netstandard2.0 | Wi-Fi network management |
| **WebCamService** | net472 | Webcam capture |
| **DirectShowLib** | net472 | DirectShow video capture |
| **Zeroconf** | netstandard2.0 | mDNS/Zeroconf service discovery |

### 3.4 DATA слой — форматы и обработка

| Модуль | Target | Роль |
|--------|--------|------|
| **SharpKml / KMLib** | netstandard2.0 | KML/KMZ parsing and generation |
| **netDxf** | netstandard2.0 | DXF file format (CAD import) |
| **ProjNet** | netstandard2.0 | Coordinate projection transforms |
| **GeoUtility** | netstandard2.0 | Geographic calculations |
| **alglibnet** | netstandard2.0 | Numerical algorithms (curve fitting, FFT) |
| **GDAL** | net472 | Geospatial Data Abstraction Library |
| **MetaDataExtractor** | netstandard2.0 | Image EXIF/metadata extraction |
| **AviFile** | netstandard2.0 | AVI video file creation |
| **ICSharpCode.SharpZipLib** | netstandard2.0 | ZIP compression |
| **7zip** | netstandard2.0 | 7z compression |
| **LibTessDotNet** | netstandard2.0 | Polygon tessellation |

### 3.5 INFRA слой — cross-platform и drawing

| Модуль | Target | Роль |
|--------|--------|------|
| **mono** | netstandard2.0 | Mono System.Windows.Forms reimplementation |
| **MissionPlanner.Drawing** | netstandard2.0 | Abstraction over System.Drawing |
| **MissionPlanner.Drawing.Common** | netstandard2.0 | Shared drawing primitives |
| **System.Drawing.android** | netstandard2.0 | Android-compatible drawing |
| **SvgNet** | net472;netstandard2.0 | SVG rendering |
| **Xamarin** | varies | Xamarin.Forms experiments (incomplete) |
| **Xamarin.Forms.Platform.WinForms** | net472 | WinForms renderer for Xamarin |
| **wasm** | netstandard2.0 | WebAssembly experiments |
| **uno** | varies | UNO Platform experiments (incomplete) |

### 3.6 TOOLS — утилиты сборки

| Модуль | Роль |
|--------|------|
| **ParameterMetaDataGenerator** | Генератор метаданных параметров из ArduPilot source |
| **Installer** | MSI installer builder |
| **DriverCleanup** | USB driver cleanup utility |
| **md5sum** | Checksum utility |
| **tlogThumbnailHandler** | Windows Explorer thumbnail handler для .tlog |

---

## 4. Граф зависимостей

### 4.1 Dependency layers

```
┌─────────────────────────────────────────────────────┐
│                  MissionPlanner.csproj               │ ← net472
│  MainV2, FlightData, FlightPlanner, Config*, Script │
├─────────────────────────────────────────────────────┤
│ Plugin/    │ Utilities/  │ SikRadio   │ Updater     │
├────────────┴─────────────┴────────────┴─────────────┤
│              ExtLibs (APPLICATION LAYER)             │
│  Controls, Maps, ZedGraph, GMap.NET.WF, BSE         │ ← net472 / dual
├─────────────────────────────────────────────────────┤
│              ExtLibs (DOMAIN LAYER)                  │
│  ArduPilot, Utilities, DroneCAN, px4uploader         │ ← netstandard2.0
├─────────────────────────────────────────────────────┤
│              ExtLibs (INFRASTRUCTURE LAYER)          │
│  Comms, MAVLink, Interfaces, GMap.Core, Drawing     │ ← netstandard2.0
├─────────────────────────────────────────────────────┤
│              ExtLibs (DATA LAYER)                    │
│  SharpKml, ProjNet, alglibnet, SharpZipLib           │ ← netstandard2.0
└─────────────────────────────────────────────────────┘
```

### 4.2 Критические зависимости (coupling hotspots)

```
MainV2.comPort ──────────► MAVLinkInterface
    │                           │
    ├── FlightData.mainloop() ──┤── MAVState.cs (CurrentState)
    ├── FlightPlanner.saveWPs() ┤── MAVList
    ├── InitialSetup.*  ────────┤── MAVLinkParamList
    ├── SoftwareConfig.* ───────┤
    ├── Script.cs ──────────────┤
    ├── PluginHost ─────────────┤
    └── WarningEngine ──────────┘── via CurrentState reflection

Settings.Instance ───► ALL modules (global config)
ThemeManager ────────► ALL UI controls (static colors)
```

### 4.3 Циклические зависимости

```
MAVState.cs:18 → [InternalsVisibleTo("MissionPlanner")]
  ↓
ExtLibs/ArduPilot знает о MissionPlanner (assembly friend)
  ↓
MissionPlanner ссылается на ArduPilot как на library
  = CIRCULAR AWARENESS (не circular reference, но awareness)
```

---

## 5. Plugins — catalog

### 5.1 Built-in example plugins (Plugins/)

| Plugin | Тип | Роль |
|--------|-----|------|
| `Shortcuts.csproj` | Project plugin | Keyboard shortcuts customization |
| `FaceMap.csproj` | Project plugin | Face/feature mapping survey |
| `example*.cs` | Single-file plugins | Reference implementations (32 example files) |
| `generator.cs` | Single-file plugin | Code generation tool |
| `AnonymizeBinlogPlugin.cs` | Single-file plugin | Privacy: anonymize bin log GPS data |
| `InitialParamsCalculator.cs` | Single-file plugin | Auto-calculate initial parameters |

### 5.2 ExtLibs plugins

| Plugin | Роль |
|--------|------|
| `AltitudeAngelWings.Plugin` | Airspace awareness integration |
| `MavlinkMessagePlugin` | Custom MAVLink message handler |
| `TestPlugin` | Plugin system test |
| `OpenDroneID2` | Remote ID compliance |
| `Dowding` | Radar/tracking data integration |
| `TerrainMakerPlugin` | Terrain data processing |

---

## 6. Статистика модулей

### 6.1 По размеру (строки кода, .cs only)

| Модуль | Приблизительно строк | % от total |
|--------|---------------------|-----------|
| ExtLibs/ArduPilot (MAVLinkInterface, CurrentState, MAVFtp...) | ~25,000 | Core engine |
| GCSViews/ (FlightData, FlightPlanner, Config*) | ~30,000 | UI layer |
| MainV2.cs + Program.cs + Script.cs | ~6,000 | App shell |
| ExtLibs/Controls | ~15,000 | Custom controls |
| ExtLibs/Utilities | ~10,000 | Shared utilities |
| ExtLibs/GMap.NET.* | ~20,000 | Map engine |
| ExtLibs/ZedGraph | ~15,000 | Graphing |
| Plugins/ | ~5,000 | Extensions |
| Utilities/ (ThemeManager, Firmware, httpserver) | ~8,000 | App utilities |
| Остальные ExtLibs | ~50,000+ | Libraries |

### 6.2 По target framework

| Framework | Проектов | Назначение |
|-----------|----------|-----------|
| `netstandard2.0` only | ~52 | Platform-agnostic core |
| `net472` only | ~19 | Windows-specific (LEDBulb, Installer, WinForms renderers, tools) |
| Dual (`net472;netstandard2.0`) | ~11 | Cross-platform ready (Controls, GMap.WF, ZedGraph, SvgNet) |
| `netcoreapp3.1` | 1 | Ntrip (modern .NET) |
| Other (Android, UNO) | ~3 | Experimental platforms |

---

## 7. Модульные boundaries — что хорошо и что плохо

### ✅ Хорошие границы

| Граница | Почему хорошо |
|---------|--------------|
| `ICommsSerial` interface | Чистая абстракция транспорта — Comms не знает о MAVLink |
| `MAVLink` ↔ `ArduPilot` | Автогенерированные structs отделены от logic |
| `BackstageView` компонент | Изолированный navigation framework |
| `Plugin` base class | Чёткий API контракт через `PluginHost` |
| Config* pages | Каждая страница — отдельный UserControl |
| `Strings` project | Локализация отделена от кода |

### ❌ Нарушенные границы

| Проблема | Последствие |
|---------|------------|
| `MainV2.cs` — 10+ responsibilities в одном классе | Невозможно заменить или протестировать любой аспект |
| `FlightData.cs` — UI + data + control + logging | Изменение tuning графика может сломать map overlay |
| `FlightPlanner.cs` — mission + map + survey + KML | Добавление нового survey pattern затрагивает весь файл |
| `CurrentState` — 500+ свойств в одном классе | Любое добавление свойства может повлиять на binding |
| `Utilities/` (ExtLibs) — Settings + Warnings + ADSB + Download + ... | Unrelated concerns в одной сборке |
| `ThemeManager` (1430 строк) — знает о 30+ типах контролов | Каждый новый контрол требует изменения ThemeManager |

---

## 8. Рекомендуемая target декомпозиция

`[Assumption]` — основано на анализе coupling и responsibilities:

| Текущий модуль | Предлагаемое разделение |
|---------------|------------------------|
| `MainV2.cs` (4827) | → `ConnectionManager`, `HeartbeatService`, `SpeechService`, `JoystickService`, `HttpApiService` |
| `FlightData.cs` (6693) | → `FlightDataView`, `TuningGraphService`, `ActionDispatcher`, `LogPlayer`, `QuickViewManager` |
| `FlightPlanner.cs` (8557) | → `MissionEditor`, `MapOverlayManager`, `WaypointService`, `SurveyEngine`, `ImportExportService` |
| `CurrentState` (4891) | → `NavigationState`, `AttitudeState`, `BatteryState`, `RCState`, `SensorState` |
| `MAVLinkInterface` (6898) | → `PacketRouter`, `ParameterManager`, `MissionProtocol`, `CommandExecutor`, `FirmwareUploader` |

---

*Следующий шаг: 07_COMMUNICATION_AND_PROTOCOLS.md*
