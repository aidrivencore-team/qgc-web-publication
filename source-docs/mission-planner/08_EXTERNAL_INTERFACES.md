# 08_EXTERNAL_INTERFACES.md — Mission Planner External Interfaces

**Version:** 1.1 (self-reviewed)  
**Date:** 2026-04-07  
**Scope:** Все внешние интерфейсы Mission Planner — API, plugins, scripting, cloud services, file formats  
**Method:** Static code analysis, no runtime testing  

---

## 1. Обзор внешних интерфейсов

```
┌────────── INBOUND (в MP) ──────────┐  ┌────────── OUTBOUND (из MP) ──────────┐
│                                     │  │                                       │
│  Vehicles (MAVLink serial/TCP/UDP)  │  │  firmware.ardupilot.org (firmware)   │
│  Joystick (DirectInput)             │  │  terrain.ardupilot.org (SRTM)         │
│  GPS/NTRIP (RTK corrections)        │  │  github.com/ArduPilot (firmware)      │
│  DroneCAN devices (CAN bus)         │  │  api.dronelogbook.com (logging)       │
│  AltitudeAngel API (airspace)       │  │  AltitudeAngel (airspace/auth)        │
│  Plugins (.dll/.cs)                 │  │  Tile servers (map tiles)             │
│  IronPython scripts (.py)           │  │  Dowding API (tracking)               │
│                                     │  │                                       │
├──────── SERVED (MP как сервер) ─────┤  ├───────── FILE I/O ───────────────────┤
│                                     │  │                                       │
│  HTTP API (port 56781)              │  │  .tlog / .rlog (telemetry logs)       │
│  WebSocket (live telemetry)         │  │  .waypoints (mission files)           │
│  MJPEG stream (video)              │  │  .kml/.kmz (Google Earth)             │
│  Network KML (Google Earth)         │  │  .param (parameter files)             │
│                                     │  │  .bin/.log (dataflash logs)           │
│                                     │  │  .fence/.rally (geofence/rally)       │
└─────────────────────────────────────┘  └───────────────────────────────────────┘
```

---

## 2. Plugin API (compiled C#)

### 2.1 Plugin base class

**Файл:** `Plugin/Plugin.cs` (251 строк)

```csharp
public abstract class Plugin {
    public PluginHost Host { get; }        // Доступ ко всему приложению
    public abstract string Name { get; }
    public abstract string Version { get; }
    public abstract string Author { get; }

    // Lifecycle:
    public abstract bool Init();           // Проверка — загрузать ли плагин
    public abstract bool Loaded();         // Одноразовая инициализация
    public virtual bool Loop() { }         // Периодический вызов (loopratehz)
    public virtual bool SetupUI() { }      // UI конфигурация
    public abstract bool Exit();           // Выгрузка
    
    public virtual float loopratehz { get; set; }   // Частота Loop()
    public virtual DateTime NextRun { get; set; }    // Override для timing
}
```

### 2.2 PluginHost API

**Файл:** `Plugin/Plugin.cs:74-250` — полный доступ к приложению:

| Property/Method | Тип | Доступ |
|----------------|-----|--------|
| `Host.MainForm` | `MainV2` | Главная форма (через `MainV2.instance`) |
| `Host.cs` | `CurrentState` | 500+ свойств телеметрии |
| `Host.comPort` | `MAVLinkInterface` | Прямой MAVLink доступ |
| `Host.config` | `Settings` | Чтение/запись конфигурации |
| `Host.FDMenuMap` | `ContextMenuStrip` | Добавление пунктов меню в FlightData map |
| `Host.FDMenuHud` | `ContextMenuStrip` | Добавление пунктов меню в HUD |
| `Host.FPMenuMap` | `ContextMenuStrip` | Добавление пунктов меню в FlightPlanner |
| `Host.FDGMapControl` | `GMapControl` | Прямой доступ к FlightData map |
| `Host.FPGMapControl` | `GMapControl` | Прямой доступ к FlightPlanner map |
| `Host.FPDrawnPolygon` | `GMapPolygon` | Полигон, нарисованный пользователем |
| `Host.AddWPtoList()` | method | Добавление waypoint в mission |
| `Host.InsertWP()` | method | Вставка waypoint по индексу |
| `Host.GetWPs()` | method | Загрузка WP с автопилота |
| `Host.RedrawFPPolygon()` | method | Перерисовка survey polygon |
| `Host.DeviceChanged` | event | USB device change notification |

**Критический аспект:** PluginHost дает полный, неограниченный доступ ко всему приложению. Нет sandboxing, нет permission model. Плагин может:
- Читать/писать любые параметры
- Отправлять любые MAVLink команды
- Модифицировать UI
- Получать доступ к файловой системе

### 2.3 Plugin loading mechanism

**Файл:** `Plugin/PluginLoader.cs` (341 строка)

```
1. Scan directory for *.dll files
2. Filter out system/Microsoft DLLs
3. Check DisabledPluginNames (from config.xml)
4. Assembly.LoadFile(file) — load into AppDomain
5. Reflection: find types inheriting Plugin base class
6. Expression.Lambda → compile + instantiate
7. plugin.Init() → if true, add to LoadingPlugins
8. Later: plugin.Loaded() → move to Plugins list
9. Background task runs plugin.Loop() at loopratehz
```

**Single-file .cs plugins** — компилируются в runtime через Roslyn (C# 8) с fallback на CodeDomProvider (C# 5):
```
Plugins/ directory → *.cs files
  → Try 1: CodeGenRoslyn.BuildCode() (C# 8, modern syntax)
  → Try 2: CodeGen.CreateCompiler() + CompileCodeFile() (CodeDomProvider, C# 5 max)
  → Assembly → InitPlugin() → same lifecycle as DLL plugins
```
Специальная директива `//loadassembly: AssemblyName` в .cs файлах позволяет загружать зависимости.

---

## 3. IronPython Scripting API

### 3.1 Script engine

**Файл:** `Script.cs` (220 строк)

```csharp
engine = Python.CreateEngine(options);  // IronPython 3.4.1

// Exposed variables:
scope.SetVariable("MainV2", MainV2.instance);
scope.SetVariable("FlightPlanner", FlightPlanner.instance);
scope.SetVariable("FlightData", FlightData.instance);
scope.SetVariable("Ports", MainV2.Comports);
scope.SetVariable("MAV", MainV2.comPort);
scope.SetVariable("cs", MainV2.comPort.MAV.cs);
scope.SetVariable("Script", this);
scope.SetVariable("mavutil", this);
scope.SetVariable("Joystick", MainV2.joystick);
```

### 3.2 Script API methods

| Method | Signature | Назначение |
|--------|-----------|-----------|
| `Script.ChangeParam()` | `(string param, float value) → bool` | Set autopilot parameter |
| `Script.GetParam()` | `(string param) → float` | Get autopilot parameter |
| `Script.ChangeMode()` | `(string mode) → bool` | Change flight mode |
| `Script.WaitFor()` | `(string message, int timeout) → bool` | Wait for STATUSTEXT |
| `Script.SendRC()` | `(int channel, short pwm, bool sendnow) → bool` | RC override (ch 1-8) |
| `Script.Sleep()` | `(int ms) → void` | Thread.Sleep wrapper |
| `Script.runScript()` | `(string filename) → void` | Run another script |

### 3.3 Прямой доступ через variables

Python скрипт имеет полный доступ ко всем .NET объектам:
```python
# Пример скрипта
print(cs.roll)                    # Текущий крен
print(cs.alt)                     # Высота
MAV.doCommand(...)                # MAVLink команда
FlightPlanner.AddCommand(...)     # Добавить WP
```

---

## 4. HTTP API (встроенный сервер)

**Файл:** `Utilities/httpserver.cs` (1288 строк), порт 56781

| Endpoint | Метод | Response | Назначение |
|----------|-------|----------|-----------|
| `/` | GET | HTML | Index page со ссылками на все endpoints |
| `/mav/*` | GET | JSON | Telemetry: `cs.*` properties via reflection |
| `/mavlink/*` | GET | JSON | Raw MAVLink messages by type (ATTITUDE+VFR_HUD+...) |
| `/hud.jpg` | GET | JPEG | HUD screenshot |
| `/map.jpg` | GET | JPEG | Map screenshot |
| `/both.jpg` | GET | JPEG | Map + HUD combined image |
| `/hud.html` | GET | HTML | HUD overlay page (HTML5) |
| `/network.kml` | GET | KML | Network link for Google Earth |
| `/georefnetwork.kml` | GET | KML | Georeferenced imagery KML |
| `/websocket/server` | WS | JSON | WebSocket telemetry stream |
| `/websocket/raw` | WS | binary | WebSocket raw MAVLink stream |
| MJPEG | — | multipart/jpeg | Live video stream |

**Пример использования:**
```
http://localhost:56781/mav?cs.lat&cs.lng&cs.alt&cs.roll&cs.pitch
→ {"cs.lat": -35.363, "cs.lng": 149.165, "cs.alt": 585.4, ...}
```

---

## 5. Cloud/Remote Services

### 5.1 ArduPilot Infrastructure

| Сервис | URL | Назначение |
|--------|-----|-----------|
| **Firmware manifest** | `firmware.ardupilot.org/Tools/MissionPlanner/Firmware/firmware2.xml` | Список доступных firmware |
| **Firmware binary** | `github.com/ArduPilot/binary/raw/master/Firmware/` | Скачивание firmware |
| **SRTM 1-sec** | `terrain.ardupilot.org/SRTM1/` | Elevation data (1 arc-second, ~30m) |
| **SRTM 3-sec** | `terrain.ardupilot.org/SRTM3/` | Elevation data (3 arc-second, ~90m) |
| **Parameter metadata** | `autotest.ardupilot.org/Parameters/` | Описания параметров |
| **Old firmware** | `github.com/diydrones/binary/raw/!Hash!/Firmware/` | Legacy firmware |

### 5.2 Third-party APIs

| Сервис | Модуль | Назначение |
|--------|--------|-----------|
| **AltitudeAngel** | `ExtLibs/AltitudeAngelWings/` | Airspace awareness — зоны полётов, NOTAM, разрешения |
| **Dronelogbook** | `ExtLibs/WebAPIs/Dronelogbook/` | Cloud flight logging — `api.dronelogbook.com` |
| **Dowding** | `ExtLibs/WebAPIs/Dowding/` | Tracking/surveillance API — `localhost/api/1.0` (configurable) |
| **Map tile providers** | `ExtLibs/GMap.NET.Core/` | Google, Bing, OpenStreetMap, ArcGIS, Yandex, etc. |

### 5.3 AltitudeAngel integration (подробно)

**Самая зрелая cloud-интеграция:**

```
ExtLibs/AltitudeAngelWings/
├── Clients/
│   ├── Auth/AuthClient.cs        ← OAuth2 authentication
│   ├── Api/ApiClient.cs          ← General API
│   ├── Flight/FlightClient.cs    ← Flight planning/logging
│   └── Surveillance/SurveillanceClient.cs ← Real-time airspace
├── ServiceLocatorConfiguration.cs ← DI container (одна из немногих)
└── Plugin/ ← MP plugin integration
```

Использует `IHttpClientFactory` — единственное место с современным HTTP client pattern.

---

## 6. File Format Interfaces

### 6.1 Mission Planner native formats

| Формат | Расширение | R/W | Назначение |
|--------|-----------|-----|-----------|
| **Telemetry log** | `.tlog` | R/W | Raw MAVLink binary stream с timestamps |
| **Raw log** | `.rlog` | W | Unprocessed serial stream |
| **Waypoints** | `.waypoints` | R/W | Mission в формате MAVProxy |
| **Parameters** | `.param` | R/W | `param_name VALUE` per line |
| **Fence** | `.fence` | R/W | Lat/Lng points per line |
| **Rally** | `.rally` | R/W | Rally point list |
| **Settings** | `config.xml` | R/W | Application settings (Dictionary XML) |
| **Theme** | `.mpsystheme`, `.mpusertheme` | R | UI theme definitions |

### 6.2 Standard formats (import/export)

| Формат | Библиотека | R/W | Назначение |
|--------|-----------|-----|-----------|
| **KML/KMZ** | SharpKml | R/W | Google Earth — mission, track, overlay |
| **DXF** | netDxf | R | AutoCAD — polygon/area import |
| **GeoPackage** | — | R | GIS geo data import |
| **GeoTIFF** | GDAL | R | Elevation/raster data |
| **DTED** | `DTED.cs` | R | Military elevation format |
| **SHP** | — | R | Shapefile import |
| **CSV** | — | R/W | Log export, param export |
| **GPX** | GMap.NET / MavlinkLogBase | W | GPS exchange format (log export only) |

> **Note:** SHP (Shapefile) support exists только в `temp.cs` (non-production code), не в основных модулях.

### 6.3 DataFlash logs

| Формат | Расширение | Source | Назначение |
|--------|-----------|-------|-----------|
| **Binary log** | `.bin` | ArduPilot SD card | High-rate onboard log |
| **Text log** | `.log` | Converted from .bin | Human-readable log |
| **Tlog** | `.tlog` | Mission Planner | MAVLink replay |

---

## 7. Hardware Interfaces

### 7.1 USB/Serial

| Interface | Класс | Назначение |
|-----------|-------|-----------|
| **USB Serial** | `SerialPort` | Основной link к autopilot |
| **USB DFU** | `px4uploader` | Firmware upload (PX4/STM32) |
| **USB CAN** | `DroneCAN` | CAN bus через USB adapter |
| **SiK Radio** | `SikRadio.csproj` | Настройка 3DR/SiK radio |

### 7.2 Network

| Interface | Класс | Назначение |
|-----------|-------|-----------|
| **TCP Client** | `TcpSerial` | WiFi telemetry (ESP8266) |
| **UDP Listen** | `UdpSerial` | SITL, MAVProxy |
| **UDP Connect** | `UdpSerialConnect` | Направленный UDP |
| **NTRIP** | `Ntrip/` | RTK GPS corrections |
| **SSH** | `SSHTerminal.cs` | Companion computer access |
| **Zeroconf** | `Zeroconf/` | mDNS device discovery |

### 7.3 Input devices

| Interface | Механизм | Назначение |
|-----------|----------|-----------|
| **Joystick** | SharpDX / custom JoystickBase (MainV2) | RC override через USB joystick |
| **TTS output** | System.Speech.Synthesis (Win) / festival (Linux) | Spoken warnings & status |
| **Video capture** | DirectShowLib (`OSDVideo.cs`) | Camera capture for OSD overlay |

---

## 8. Extensibility boundaries

### 8.1 Точки расширения

| Точка | Тип | API surface |
|-------|-----|------------|
| **C# Plugin** | Compiled DLL | Полный доступ через PluginHost (без sandbox) |
| **IronPython script** | Interpreted | Полный доступ через scope variables |
| **HTTP API** | Network | Read-only telemetry (reflection-based) |
| **Map providers** | Конфигурация | Tile URL templates |
| **Custom themes** | Files | .mpsystheme/.mpusertheme XML |
| **MAVLink subscription** | Code | SubscribeToPacketType() |

### 8.2 Отсутствующие интерфейсы

| Что отсутствует | Где пригодилось бы |
|----------------|-------------------|
| **REST API (modern)** | Интеграция с веб-приложениями |
| **gRPC / GraphQL** | Typed, efficient remote access |
| **WebSocket telemetry (modern)** | Real-time web dashboards |
| **Event bus / message broker** | Decoupled module communication |
| **Plugin sandbox** | Безопасная загрузка сторонних плагинов |
| **Plugin marketplace** | Централизованное распространение |
| **OAuth/API keys** | Аутентификация для HTTP API |
| **OpenAPI/Swagger** | API documentation |

---

## 9. Security analysis

| Аспект | Состояние | Риск |
|--------|----------|------|
| **HTTP API auth** | Нет | Любой в сети может читать телеметрию |
| **HTTP API TLS** | Нет | Данные передаются в открытомtексте |
| **Plugin trust** | Нет | Любой DLL загружается с полными правами |
| **Python script trust** | Нет | Скрипт имеет доступ ко всему .NET runtime |
| **MAVLink signing** | Опционально (v2) | SHA-256, но нет key management UI |
| **Settings encryption** | Нет | config.xml хранит пароли в plaintext |
| **Update channel** | HTTPS | firmware.ardupilot.org → HTTPS |
| **Map tile requests** | Mixed | Некоторые провайдеры — HTTP |

---

*Следующий шаг: 09_TESTING_AND_QUALITY.md*
