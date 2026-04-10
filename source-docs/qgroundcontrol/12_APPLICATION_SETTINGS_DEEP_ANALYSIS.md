# Глубокий анализ Application Settings

Анализ построен на reverse-engineering 22 `.SettingsGroup.json` metadata-файлов, 14 `.SettingsUI.json` page-определений, `SettingsPages.json` навигации, и C++ классов `SettingsManager`, `AppSettings`, `UnitsSettings`.

---

## 1. Архитектура настроек

### Механизм хранения

*Источник: `SettingsGroup.h`, `SettingsManager.h`, `SettingsManager.cc`*

```
┌─────────────────────────────────────────────────────────────┐
│                    SettingsManager (Singleton)               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐│
│  │ AppSettings  │ │VideoSettings │ │ MavlinkSettings      ││
│  │ (SettingsGrp)│ │(SettingsGrp) │ │ (SettingsGroup)      ││
│  │  ┌────────┐  │ │  ┌────────┐  │ │  ┌────────────────┐  ││
│  │  │ Fact   │  │ │  │ Fact   │  │ │  │ Fact           │  ││
│  │  │savePath│  │ │  │rtspUrl │  │ │  │telemetrySave   │  ││
│  │  └────────┘  │ │  └────────┘  │ │  └────────────────┘  ││
│  │  ┌────────┐  │ │  ┌────────┐  │ │  ...                 ││
│  │  │ Fact   │  │ │  │ Fact   │  │ │                      ││
│  │  │language│  │ │  │udpUrl  │  │ │                      ││
│  │  └────────┘  │ │  └────────┘  │ │                      ││
│  │  ...         │ │  ...         │ │                      ││
│  └──────────────┘ └──────────────┘ └──────────────────────┘│
│  + 19 других групп...                                       │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐         ┌──────────┐
   │ QSettings│        │ QSettings│         │ QSettings│
   │ (disk)   │        │ (disk)   │         │ (disk)   │
   └──────────┘        └──────────┘         └──────────┘
```

**Ключевые паттерны:**
- Каждая группа = `SettingsGroup` → коллекция `Fact` объектов.
- Metadata: `*.SettingsGroup.json` → type, default, min/max, enum, label, keywords.
- UI: `*.SettingsUI.json` → описание страницы (секции, контролы, bindings, showWhen/enableWhen).
- **Code generation:** QML-страницы генерируются из JSON через `tools/generators/settings_qml/generate_pages.py`.
- Доступ из QML: `QGroundControl.settingsManager.appSettings.savePath.rawValue`.

### Навигация Settings UI

*Источник: `SettingsPages.json`, `AppSettings.qml`*

```
┌─────────────────────────────────────────────────────┐
│ [🔍 Search settings...]                             │
├─────────────────┬───────────────────────────────────┤
│ ● General       │                                   │
│ ● Fly View      │   RIGHT PANEL                     │
│ ● 3D View       │   (Loader → generated QML page)   │
│ ● Plan View     │                                   │
│ ─────────────── │   Sections as collapsible groups   │
│ ● ADSB Server   │   with Fact-bound controls         │
│ ● Comm Links    │                                   │
│ ● Logging       │                                   │
│ ● Maps          │                                   │
│ ● NTRIP/RTK     │                                   │
│ ● PX4 Log Xfer  │                                   │
│ ● Remote ID     │                                   │
│ ● Telemetry     │                                   │
│ ● Video         │                                   │
│ ─────────────── │                                   │
│ ● Help          │                                   │
│ ─────────────── │                                   │
│ ○ Mock Link     │  (debug only)                     │
│ ○ Debug         │  (debug only)                     │
│ ○ Palette Test  │  (debug only)                     │
└─────────────────┴───────────────────────────────────┘
```

Навигация: expandable sections, search по keywords, auto-open RemoteID если `commingFromRIDIndicator`.

---

## 2. Группы настроек — полная карта

### 22 группы (SettingsGroup)

| # | Группа | C++ Class | JSON | Кол-во параметров |
|---|---|---|---|---|
| 1 | **App** | `AppSettings` | `App.SettingsGroup.json` | 25 |
| 2 | **AutoConnect** | `AutoConnectSettings` | `AutoConnect.SettingsGroup.json` | 12 |
| 3 | **Mavlink** | `MavlinkSettings` | `Mavlink.SettingsGroup.json` | 10 |
| 4 | **Video** | `VideoSettings` | `Video.SettingsGroup.json` | 16 |
| 5 | **FlyView** | `FlyViewSettings` | `FlyView.SettingsGroup.json` | 16 |
| 6 | **PlanView** | `PlanViewSettings` | `PlanView.SettingsGroup.json` | 7 |
| 7 | **Units** | `UnitsSettings` | `Units.SettingsGroup.json` | 6 |
| 8 | **FlightMap** | `FlightMapSettings` | `FlightMap.SettingsGroup.json` | 3 |
| 9 | **Maps** | `MapsSettings` | `Maps.SettingsGroup.json` | 2 |
| 10 | **OfflineMaps** | `OfflineMapsSettings` | `OfflineMaps.SettingsGroup.json` | 3 |
| 11 | **RTK** | `RTKSettings` | `RTK.SettingsGroup.json` | 8 |
| 12 | **NTRIP** | `NTRIPSettings` | `NTRIP.SettingsGroup.json` | 11 |
| 13 | **RemoteID** | `RemoteIDSettings` | `RemoteID.SettingsGroup.json` | 20 |
| 14 | **ADSB** | `ADSBVehicleManagerSettings` | `ADSBVehicleManager.SettingsGroup.json` | 3 |
| 15 | **BatteryIndicator** | `BatteryIndicatorSettings` | `BatteryIndicator.SettingsGroup.json` | 4 |
| 16 | **APMStreamRate** | `APMMavlinkStreamRateSettings` | `APMMavlinkStreamRate.SettingsGroup.json` | 7 |
| 17 | **FlightMode** | `FlightModeSettings` | `FlightMode.SettingsGroup.json` | 14 |
| 18 | **GimbalController** | `GimbalControllerSettings` | `GimbalController.SettingsGroup.json` | 11 |
| 19 | **Joystick** | `JoystickSettings` | `Joystick.SettingsGroup.json` | 18 |
| 20 | **MavlinkActions** | `MavlinkActionsSettings` | `MavlinkActions.SettingsGroup.json` | 2 |
| 21 | **FirmwareUpgrade** | `FirmwareUpgradeSettings` | `FirmwareUpgrade.SettingsGroup.json` | 3 |
| 22 | **Viewer3D** | `Viewer3DSettings` | `Viewer3D.SettingsGroup.json` | 5 |

**Итого: ~185 параметров** распределённых по 22 группам.

---

## 3. Детальный разбор по страницам UI

### 3.1 General (Общие)

*Источник: `General.SettingsUI.json`, `App.SettingsGroup.json`*

**Секции:** General, Units

| Параметр | Тип | Default | Влияние | Boat? |
|---|---|---|---|---|
| `qLocaleLanguage` | enum (combobox) | System | Язык UI. Требует перезапуск | ⚠️ |
| `indoorPalette` | enum | Outdoor(0) | Цветовая схема: Indoor(тёмная) / Outdoor (светлая). Mobile default = Indoor | ✅ Outdoor для лодки |
| `followTarget` | enum | When in Follow Me | Стриминг GCS GPS → аппарат. Never/Always/Follow Me mode | ⚠️ |
| `audioVolume` | slider 0-100% | 100% | Громкость аудио-оповещений + кнопка Mute + Test | ✅ Важен на воде |
| `audioMuted` | bool | false | Полное отключение звука | — |
| `gstDebugLevel` | enum 0-7 | 0 (Disabled) | Уровень отладки GStreamer. Требует перезапуск | 🔧 |
| `uiScalePercent` | scaler 50-200% | 100% | Масштаб всего UI | ✅ На ярком солнце |
| `savePath` | browse (desktop only) | "" | Корневая директория для всех файлов. Подкаталоги: Missions/, Telemetry/, Logs/, Video/, Photo/, Parameters/, CrashLogs/, Settings/ | ✅ |
| `clearSettingsNextBoot` | bool | false | Сброс всех настроек при следующем запуске | 🔧 |

**Units (подсекция):**

| Параметр | Enum | Default | Boat? |
|---|---|---|---|
| `horizontalDistanceUnits` | Feet / Meters | Feet(0) | ✅ Meters для морских |
| `verticalDistanceUnits` | Feet / Meters | Feet(0) | ✅ Meters |
| `areaUnits` | sq.ft / sq.m / sq.km / Hectares / Acres / sq.mi | sq.ft(0) | ⚠️ |
| `speedUnits` | ft/s / m/s / mph / km/h / **Knots** | ft/s(0) | ✅ **Knots** для морских |
| `temperatureUnits` | Celsius / Fahrenheit | Celsius(0) | ✅ |

### 3.2 Fly View (Настройки полётного экрана)

*Источник: `FlyView.SettingsUI.json`, `FlyView.SettingsGroup.json`*

**Секции:** General, Guided Commands, MAVLink Actions, Virtual Joystick, Instrument Panel

| Параметр | Default | Влияние | Boat? |
|---|---|---|---|
| `useChecklist` | false | Включить предполётный чеклист | ✅ Важен для pre-mission |
| `enforceChecklist` | false | Блокировать ARM до прохождения чеклиста | ✅ Безопасность |
| `enableMultiVehiclePanel` | true | Панель для нескольких аппаратов | ⚠️ Если флот |
| `keepMapCenteredOnVehicle` | false | Автоцентрирование карты | ✅ Рекомендуется |
| `showLogReplayStatusBar` | false | Показывать панель Log Replay | ✅ Для анализа |
| `showSimpleCameraControl` | false | Кнопка DIGICAM_CONTROL | ⚠️ Если камера |
| `updateHomePosition` | false | Обновлять Home из GCS GPS | ⚠️ |
| `enableAutomaticMissionPopups` | true | Диалоги старта/resume миссии | ✅ |
| `guidedMinimumAltitude` | 2 m | Мин. высота для Guided | ❌ Не для лодки |
| `guidedMaximumAltitude` | 121.92 m (400ft) | Макс. высота | ❌ Не для лодки |
| `maxGoToLocationDistance` | 1000 m | Макс. дистанция GoTo | ✅ Настроить для акватории |
| `goToLocationRequiresConfirmInGuided` | true | Подтверждение GoTo | ✅ Безопасность |
| `virtualJoystick` | false | Виртуальный джойстик на экране | ✅ Ручное управление лодкой |
| `virtualJoystickAutoCenterThrottle` | true | Авто-центр газа | ⚠️ Для лодки лучше false |
| `instrumentQmlFile2` | IntegratedCompassAttitude | Тип HUD: Integrated/Horizontal/Large Vertical | ✅ |
| `lockNoseUpCompass` | false | Компас всегда на Север | ⚠️ |

### 3.3 Plan View

*Источник: `PlanView.SettingsUI.json`, `PlanView.SettingsGroup.json`*

| Параметр | Default | Boat? |
|---|---|---|
| `takeoffItemNotRequired` | false | ✅ Для лодки takeoff не нужен |
| `showMissionItemStatus` | true | ✅ |
| `allowMultipleLandingPatterns` | true | ❌ Landing не для лодки |
| `useConditionGate` | false | ⚠️ |
| `vtolTransitionDistance` | 300 m | ❌ VTOL only |

**Также:** `appSettings.offlineEditingFirmwareClass` (ArduPilot=3/PX4=12), `offlineEditingVehicleClass` (Rover=10), `offlineEditingCruiseSpeed` (15 m/s), `defaultMissionItemAltitude` (50m).

### 3.4 Comm Links (Подключения)

*Источник: `CommLinks.SettingsUI.json`, `AutoConnect.SettingsGroup.json`*

**Секции:** AutoConnect, NMEA GPS, Link Management

| Параметр | Default | Влияние | Boat? |
|---|---|---|---|
| `autoConnectPixhawk` | true | Авто-подключение USB Pixhawk | ✅ |
| `autoConnectSiKRadio` | true | Авто-подключение SiK Radio | ✅ Если радио-линк |
| `autoConnectUDP` | true | Авто-подключение UDP | ✅ **Критичен для SITL** |
| `autoConnectRTKGPS` | true | Авто-подключение RTK GPS | ⚠️ Если RTK |
| `autoConnectLibrePilot` | true | LibrePilot boards | ❌ |
| `autoConnectZeroConf` | true | Обнаружение через mDNS | ⚠️ |
| `udpListenPort` | 14550 | UDP порт для auto-connect | ✅ **SITL default** |
| `udpTargetHostIP` | "" | Target IP | ⚠️ Для remote boat |
| `autoConnectNmeaPort` | "Disabled" | NMEA GPS для позиции GCS | ⚠️ |

**Link Management** — ручное создание/удаление подключений: Serial, TCP, UDP, Bluetooth, Log Replay.

### 3.5 Telemetry (MAVLink / Телеметрия)

*Источник: `Telemetry.SettingsUI.json`, `Mavlink.SettingsGroup.json`, `APMMavlinkStreamRate.SettingsGroup.json`*

**Секции:** Ground Station, MAVLink Forwarding, Logging, Stream Rates, Signing Key, Link Status

| Параметр | Default | Влияние | Boat? |
|---|---|---|---|
| `gcsMavlinkSystemID` | 255 | System ID GCS (1-255) | ✅ Если несколько GCS |
| `sendGCSHeartbeat` | true | Генерация GCS heartbeat | ✅ Не выключать |
| `noInitialDownloadWhenFlying` | false | Не скачивать params/mission при подключении к летящему | ✅ Полезно для reconnect |
| `forwardMavlink` | false | Проброс MAVLink на другой адрес | ✅ **Для Edge Gateway** |
| `forwardMavlinkHostName` | localhost:14445 | Адрес проброса | ✅ |
| `telemetrySave` | true | Автосохранение .tlog | ✅ **Критичен** |
| `telemetrySaveNotArmed` | false | Сохранять даже без ARM | ✅ Рекомендуется |
| `saveCsvTelemetry` | false | Сохранять CSV телеметрию 1Hz | ⚠️ Для анализа |

**APM Stream Rates (ArduPilot only):**

| Stream | Default Hz | Что содержит | Boat? |
|---|---|---|---|
| Raw Sensors | 2 | IMU, baro, mag | ⚠️ |
| Extended Status | 2 | SYS_STATUS, POWER | ✅ |
| RC Channels | 2 | RC input | ⚠️ |
| Position | 3 | GPS, GLOBAL_POS | ✅ **Увеличить до 5** |
| Extra 1 | 10 | ATTITUDE | ✅ |
| Extra 2 | 10 | VFR_HUD | ✅ |
| Extra 3 | 3 | AHRS, BATTERY | ✅ |

**Signing Key** — управление MAVLink 2 signing (шифрование пакетов). Компонент `SigningKeyManager`.

**Link Status** — отображение статистики: packets sent/received, loss%, latency. Компонент `MavlinkLinkStatus`.

### 3.6 Video (Видеопоток)

*Источник: `Video.SettingsUI.json`, `Video.SettingsGroup.json`*

**Секции:** Video Source, Connection, Settings, Local Video Storage

| Параметр | Default | Влияние | Boat? |
|---|---|---|---|
| `videoSource` | "" (auto) | Источник: UDP h.264/h.265, RTSP, TCP, MPEG-TS, UVC Camera, Disabled | ✅ Если камера на лодке |
| `udpUrl` | 0.0.0.0:5600 | UDP endpoint | ⚠️ |
| `rtspUrl` | "" | RTSP адрес (например IP-камера на лодке) | ✅ |
| `tcpUrl` | "" | TCP endpoint | ⚠️ |
| `aspectRatio` | 1.777777 (16:9) | Соотношение сторон | ✅ |
| `disableWhenDisarmed` | false | Выключить видео при disarm | ⚠️ |
| `lowLatencyMode` | false | Уменьшить задержку ~200ms | ✅ **Рекомендуется** |
| `forceVideoDecoder` | Default(0) | Выбор декодера: Software/HW/NVIDIA/VA-API/D3D11/VideoToolbox/Intel/Vulkan | 🔧 |
| `recordingFormat` | mp4(2) | Формат записи: mp4/mov/mkv | ✅ |
| `enableStorageLimit` | false (desktop) / true (mobile) | Автоудаление старых записей | ⚠️ |
| `maxVideoSize` | 10240 MB / 2048 MB (mobile) | Лимит хранилища | ⚠️ |
| `streamEnabled` | true | Включён ли стриминг | ✅ |

### 3.7 Maps (Карты)

*Источник: `Maps.SettingsUI.json`, `FlightMap.SettingsGroup.json`, `Maps.SettingsGroup.json`*

**Секции:** Map Provider, Offline Maps, Tokens, Mapbox Login, Custom Map URL, Tile Cache

| Параметр | Default | Boat? |
|---|---|---|
| `mapProvider` | "Bing" | ✅ Выбрать морскую подложку |
| `mapType` | "Hybrid" | ✅ Satellite для акватории |
| `elevationMapProvider` | "Copernicus" | ❌ Высоты не для лодки |
| `maxCacheDiskSize` | 1024 MB | ✅ Увеличить для offshore |
| `maxCacheMemorySize` | 128 MB (16 mobile) | ✅ |
| Map Tokens | "" | ✅ Mapbox/Esri/Custom для морских карт |
| `customURL` | "" | ✅ **Морские карты**: OpenSeaMap, NOAA tiles |

**Offline Maps** — скачивание тайлов для оффлайн работы:
- `minZoomLevelDownload` = 13, `maxZoomLevelDownload` = 19, `maxTilesForDownload` = 100000.
- Компонент `OfflineMapSettings` + `OfflineMapEditor` для управления наборами тайлов.

### 3.8 NTRIP/RTK

*Источник: `NTRIP.SettingsUI.json`, `NTRIP.SettingsGroup.json`, `RTK.SettingsGroup.json`*

**Секции:** NTRIP Server Settings, Connection Status, RTK Settings

| Параметр | Default | Boat? |
|---|---|---|
| `ntripServerConnectEnabled` | false | ✅ Если RTK для точной навигации |
| `ntripServerHostAddress` | "" | ✅ |
| `ntripServerPort` | 2101 | ✅ |
| `ntripUsername/Password` | "" | ✅ |
| `ntripMountpoint` | "" | ✅ |
| `ntripWhitelist` | "" (all) | ⚠️ Фильтр RTCM сообщений |
| `ntripUseTls` | false | ✅ Для безопасности |
| RTK Survey-In accuracy | 2.0 m | ⚠️ |
| RTK Survey-In duration | 180 sec | ⚠️ |
| `useFixedBasePosition` | Survey-In(0) | ⚠️ |

### 3.9 Remote ID

*Источник: `RemoteID.SettingsUI.json`, `RemoteID.SettingsGroup.json`*

20 параметров для дистанционной идентификации (FAA/EU). Включает Operator ID, Basic ID, Self ID, регион (FAA/EU), классификацию EU.

**Boat?** ⚠️ Юридически может быть необходим в зависимости от юрисдикции. Для surface vessels пока не обязателен в большинстве стран.

### 3.10 ADSB Server

| Параметр | Default | Boat? |
|---|---|---|
| `adsbServerConnectEnabled` | false | ⚠️ Для awareness о воздушном трафике |
| `adsbServerHostAddress` | 127.0.0.1 | — |
| `adsbServerPort` | 30003 | — |

### 3.11 3D View (Viewer3D)

| Параметр | Default | Boat? |
|---|---|---|
| `enabled` | false | ❌ Не нужен для лодки |
| `mapProvider` | OpenStreetMap | — |
| `osmFilePath` | "" | — |
| `buildingLevelHeight` | 3 m | — |
| `altitudeBias` | 0 m | — |

### 3.12 Скрытые / Runtime группы

Эти группы не имеют отдельных страниц, но влияют на поведение:

| Группа | UI элемент | Boat? |
|---|---|---|
| **BatteryIndicator** | Toolbar battery icon | ✅ `threshold1`=80%, `threshold2`=60% |
| **FlightMode** | FlightMode selector | ✅ `apmHiddenFlightModesRoverBoat` = "" (ничего не скрыто) |
| **GimbalController** | Gimbal controls on FlyView | ⚠️ Если камера с gimbal |
| **Joystick** | Joystick calibration/config | ✅ Если USB джойстик для лодки |
| **MavlinkActions** | Custom MAVLink action buttons | ✅ Custom buttons для лодки |
| **FirmwareUpgrade** | Firmware flash dialog | ⚠️ |

---

## 4. Сводная таблица: группы → влияние → boat

| Группа настроек | Назначение | Влияние на работу | Важно для boat? |
|---|---|---|---|
| **General** | Язык, тема, звук, масштаб, путь сохранения | UX, локализация, хранение | ✅ Да — звук, масштаб, savePath |
| **Units** | Единицы измерения | Все числа в UI | ✅ **Критичен** — Knots, Meters |
| **Fly View** | HUD, компас, Guided limits, vJoystick, checklist | Полётный экран | ✅ Да — checklist, vJoystick, GoTo |
| **Plan View** | Mission planner настройки | Планирование миссий | ✅ takeoffNotRequired = true |
| **Comm Links** | AutoConnect, NMEA GPS, Link Manager | Подключение к аппарату | ✅ **Критичен** — UDP, Serial |
| **Telemetry** | MAVLink ID, Heartbeat, Forwarding, Logging, Streams | Протокол связи и запись | ✅ **Критичен** — logging, streams |
| **Video** | Источник видео, кодек, запись, latency | Видеопоток | ✅ Если камера на лодке |
| **Maps** | Провайдер, оффлайн, токены, кеш, custom URL | Картография | ✅ **Критичен** — морские карты |
| **NTRIP/RTK** | Точный GPS через RTK коррекции | Навигационная точность | ⚠️ Если RTK для точного позиционирования |
| **Remote ID** | Дистанционная идентификация (FAA/EU) | Соответствие законам | ⚠️ Зависит от юрисдикции |
| **ADSB** | Приём данных ADS-B трафика | Awareness воздушного трафика | ❌ Не для лодки |
| **3D View** | 3D визуализация зданий/рельефа | Только UI | ❌ Не для лодки |
| **BatteryIndicator** | Пороги и отображение батареи | Toolbar indicator | ✅ Настроить пороги |
| **FlightMode** | Скрытие режимов по типу аппарата | Selector доступных режимов | ✅ RoverBoat = всё видно |
| **GimbalController** | Управление gimbal | Камера | ⚠️ Если gimbal на лодке |
| **Joystick** | Джойстик калибровка и настройки | Ручное управление | ✅ Если USB джойстик |
| **MavlinkActions** | Кастомные MAVLink action-кнопки | Кнопки на FlyView | ✅ Custom boat actions |
| **APM Stream Rates** | Частоты телеметрии ArduPilot | Количество данных | ✅ Настроить Position=5Hz |
| **FirmwareUpgrade** | Прошивка контроллера | Setup | ⚠️ Разовая операция |
| **OfflineMaps** | Скачивание тайлов | Оффлайн доступ | ✅ Для offshore работы |

---

## 5. Что критически важно для SITL

### Минимальная конфигурация для подключения к ArduPilot SITL Rover/Boat:

| Параметр | Значение | Почему |
|---|---|---|
| `autoConnectSettings.autoConnectUDP` | **true** | SITL слушает на UDP 14550 |
| `autoConnectSettings.udpListenPort` | **14550** | Порт по умолчанию |
| `mavlinkSettings.telemetrySave` | **true** | Записывать .tlog для анализа |
| `mavlinkSettings.telemetrySaveNotArmed` | **true** | Записывать всё, а не только armed |
| `mavlinkSettings.sendGCSHeartbeat` | **true** | Поддерживать связь |
| `appSettings.offlineEditingVehicleClass` | **10 (Rover)** | Для offline mission editing |
| `appSettings.offlineEditingFirmwareClass` | **3 (ArduPilot)** | Для ArduPilot boat |

### Рекомендуемые настройки для SITL-тестирования:

| Параметр | Значение | Причина |
|---|---|---|
| `flyViewSettings.keepMapCenteredOnVehicle` | true | Следить за лодкой на карте |
| `flyViewSettings.showLogReplayStatusBar` | true | Для воспроизведения .tlog |
| `appSettings.virtualJoystick` | true | Тестировать ручное управление |
| `flyViewSettings.maxGoToLocationDistance` | 5000 | Для больших акваторий |
| `planViewSettings.takeoffItemNotRequired` | true | Лодке не нужен takeoff |
| `mavlinkSettings.forwardMavlink` | true | Параллельный доступ к данным |

---

## 6. Что критически важно для boat use case

### Tier 1: Обязательно настроить

| Настройка | Действие | Обоснование |
|---|---|---|
| **Units → Speed** | Knots | Морской стандарт |
| **Units → Distance** | Meters | SI для навигации |
| **Telemetry → Save** | ON + Not Armed | Каждая сессия = лог |
| **Comm Links** | Настроить UDP/Serial | Канал связи |
| **Maps → Custom URL** | OpenSeaMap tiles | Морские карты |
| **Maps → Offline** | Скачать акваторию | Offshore может не быть интернета |
| **Plan View → Takeoff** | Not Required | Boat не взлетает |
| **Fly View → Checklist** | Enable + Enforce | Безопасность на воде |

### Tier 2: Рекомендуется

| Настройка | Действие | Обоснование |
|---|---|---|
| **Fly View → Center Map** | ON | Следить за лодкой |
| **APM Streams → Position** | 5 Hz | Точнее трек |
| **Battery → Thresholds** | Настроить | Для морских условий |
| **Video → Low Latency** | ON | Камера на лодке |
| **MAVLink Forwarding** | ON → Edge Gateway | Для cloud-архитектуры |
| **General → Audio Volume** | ≥ 80% | Слышно на открытом воздухе |
| **Virtual Joystick → Auto-Center Throttle** | OFF | Лодке нужен постоянный ход |
| **FlightMode → Hidden Modes** | Оставить "" | Все режимы Rover доступны |

### Tier 3: Опционально

| Настройка | Когда | Обоснование |
|---|---|---|
| **NTRIP/RTK** | Точное позиционирование | RTK для причаливания |
| **Gimbal Controller** | Камера с PTZ | Обзорная камера |
| **Joystick** | USB gamepad | Ручное управление |
| **MavlinkActions** | Custom buttons | Якорь, освещение, насос |
| **MAVLink Signing** | Безопасность | Защита от перехвата |

---

## 7. Файловая система сохранения

*Источник: `AppSettings.cc:254`, `AppSettings.h:106-114`*

```
savePath/
├── Missions/          (.plan, .waypoints)
├── Parameters/        (.params)
├── Telemetry/         (.tlog)
├── Logs/              (.ulg)
├── Video/             (recorded video)
├── Photo/             (captured photos)
├── CrashLogs/         (crash dumps)
├── MavlinkActions/    (custom action JSON)
└── Settings/          (.settings export)
```

Каждый подкаталог создаётся автоматически при первом использовании.

---

## 8. Архитектурные выводы для новой системы

### Что перенести

| Паттерн | Почему | Адаптация |
|---|---|---|
| **Fact-based settings** | Типизация, validation, persistence бесплатно | → JSON Schema + REST API |
| **JSON metadata** | Описание параметров декларативно | → OpenAPI spec для Settings API |
| **Code generation** | QML из JSON автоматически | → React components из JSON schema |
| **Search** | Keywords по всем settings | → Fuzzy search по settings API |
| **Units system** | 6 категорий convert-on-display | → Backend: always SI, Frontend: convert per user prefs |

### Что улучшить

| Текущее ограничение | Решение |
|---|---|
| Настройки локальны (QSettings) | → Cloud-synced user profiles |
| Нет ролей (все видят всё) | → Role-based: Operator / Engineer / Admin |
| Нет presets | → Named profiles: "Boat Default", "Survey", "Debug" |
| Custom Maps URL — один | → Overlay layers: base + OpenSeaMap + AIS + weather |
| Stream Rates — ручная настройка | → Auto-profiles: Navigation / Debug / Low-bandwidth |
| MAVLink Forwarding — один host | → Multiple subscribers через message broker |

### Новые группы настроек для boat

| Группа | Параметры |
|---|---|
| **Maritime** | AIS display, collision avoidance rules (COLREGS), depth sounder, water temp sensor |
| **Weather** | Wind overlay, current overlay, tide data source |
| **Communication** | 4G/LTE modem config, satellite link, mesh radio |
| **Geofence Maritime** | Port/harbor zones, restricted areas, anchorage zones |
| **Autonomy** | Station keeping settings, path following PID, obstacle avoidance |
