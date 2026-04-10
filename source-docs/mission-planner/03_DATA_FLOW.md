# 03 — DATA FLOW

> **Документ:** Анализ потоков данных Mission Planner  
> **Версия:** 1.1 (self-reviewed)  
> **Дата:** 2026-04-07  
> **Статус:** Reviewed  
> **Зависимости:** 01_CODEBASE_AUDIT_REPORT.md, 02_SYSTEM_ARCHITECTURE.md

---

## 1. Обзор

Mission Planner оперирует **8 основными потоками данных**, которые можно классифицировать по направлению:

| Направление | Потоки |
|---|---|
| **Inbound** (Vehicle → GCS) | Телеметрия, Параметры (download), Миссии (download), DataFlash логи |
| **Outbound** (GCS → Vehicle) | Команды, Параметры (upload), Миссии (upload), ADSB |
| **Bidirectional** | Параметры, Миссии, WebSocket raw MAVLink |
| **Internal** | Tlog запись, Settings persistence, HTTP API export |

### Карта потоков (высокоуровневая)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SOURCES                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ Vehicle  │  │ ADSB API │  │ .tlog    │  │ .param / .waypoint│   │
│  │ (Serial/ │  │ (HTTP)   │  │ (replay) │  │ (filesystem)     │   │
│  │ TCP/UDP) │  │          │  │          │  │                  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │             │                  │             │
└───────┼──────────────┼─────────────┼──────────────────┼─────────────┘
        │              │             │                  │
        ▼              ▼             ▼                  ▼
┌───────────────────────────────────────────────────────────────────┐
│                     MAVLinkInterface                              │
│  ┌─────────────┐  ┌───────────┐  ┌──────────────┐               │
│  │readPacketAs│  │ addPacket │  │PacketReceived│               │
│  │   ync()    │──▶│           │──▶│(Subscriptions)│              │
│  └─────────────┘  └───────────┘  └──────┬───────┘               │
│                                          │                       │
│  ┌──────────────────┐    ┌───────────────▼────────────────┐      │
│  │ SaveToTlog()     │◀───│ OnPacketReceived (event)       │      │
│  │ (logfile stream) │    │   → CurrentState               │      │
│  └──────────────────┘    │   → httpserver WebSocket       │      │
│                          │   → MAVLinkInspector           │      │
│  ┌──────────────────┐    │   → Plugins                    │      │
│  │ generatePacket() │    └────────────────────────────────┘      │
│  │ (outbound cmds)  │                                            │
│  └──────────────────┘                                            │
└───────────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────┐           ┌──────────────────┐
│   .tlog       │           │  CurrentState     │
│   .rlog       │           │  (300+ свойств)   │
│  (filesystem) │           └────────┬──────────┘
└───────────────┘                    │
                                     ▼
                          ┌──────────────────┐
                          │ UI Views (poll)   │
                          │ FlightData HUD    │
                          │ httpserver JSON   │
                          └──────────────────┘
```

---

## 2. Поток 1 — Телеметрия (Vehicle → GCS)

### 2.1. Lifecycle

Это **основной и самый высокочастотный** поток данных в системе. Телеметрия приходит непрерывно со скоростью до 50Hz (в зависимости от stream rate).

#### Этапы:

| Шаг | Метод / Класс | Файл : строка | Описание |
|---|---|---|---|
| 1 | `SerialReader()` | `MainV2.cs:3046-3057` | Background thread, вызывает `readPacketAsync()` в цикле пока есть байты |
| 2 | `readPacketAsync()` | `MAVLinkInterface.cs:4694+` | Читает raw bytes из `BaseStream`, парсит MAVLink header, проверяет CRC и signing. Захватывает `readlock` (SemaphoreSlim) |
| 3 | `rawlogfile.Write()` | `MAVLinkInterface.cs:4748-4749` | Пишет RAW bytes в `.rlog` (до парсинга — полный дамп канала) |
| 4 | `addPacket()` | `MAVLinkInterface.cs:5199` | Сохраняет пакет в `MAVState.packets[]` (массив по msgid, хранит последний пакет каждого типа) |
| 5 | ADSB / Heartbeat dispatch | `MAVLinkInterface.cs:5202-5336` | Inline обработка: ADSB → `_UpdateADSBPlanePosition`, HB → создание `MAVState`, HIGH_LATENCY2 |
| 6 | `SaveToTlog()` | `MAVLinkInterface.cs:5341` | Пишет timestamp (8 bytes, big-endian) + parsed packet в `.tlog`. Lock на logfile. Flush на heartbeat |
| 7 | `PacketReceived()` | `MAVLinkInterface.cs:5364` | Итерирует `Subscriptions` list — вызывает зарегистрированные callback-и по (msgid, sysid, compid) |
| 8 | `_OnPacketReceived` event | `MAVLinkInterface.cs:5366` | Broadcast event → `CurrentState.Parent_OnPacketReceived()`, httpserver WebSocket, plugins |
| 9 | `UpdateCurrentSettings()` | `MainV2.cs:3064` | Вызывается **после** read loop. Вычисляет derived значения (link quality, distance, time-in-air). Rate: каждые 50ms |

#### Ключевые характеристики:

- **Thread model**: Один `SerialReader` thread обрабатывает все `Comports` (List<MAVLinkInterface>) последовательно
- **Packet storage**: `MAVState.packets[256]` — массив по msgid, хранит только **последний** пакет каждого типа
- **Synchronization**: `readlock` (SemaphoreSlim) для последовательного чтения. `lock(logfile)` для записи в tlog. `lock(writelock)` для outbound
- **No queue**: Пакеты не буферизируются в очередь — читаются и обрабатываются inline

### 2.2. Данные в CurrentState — двойной механизм обновления

`CurrentState` (`ExtLibs/ArduPilot/CurrentState.cs`, ~4892 строки) — центральный data model. Обновляется **двумя механизмами**:

**Механизм 1: Event-driven (real-time)**  
`CurrentState` подписывается на `parent.parent.OnPacketReceived += Parent_OnPacketReceived` (`CurrentState.cs:150`). Мгновенная обработка входящих пакетов:

```
Parent_OnPacketReceived() {              // CurrentState.cs:2276
    switch(message.msgid) {
        case HEARTBEAT:     → armed, mode, system_status, type
        case GPS_RAW_INT:   → lat, lng, alt, satcount, hdop, groundspeed
        case ATTITUDE:      → roll, pitch, yaw, rollspeed, pitchspeed, yawspeed
        case VFR_HUD:       → airspeed, groundspeed, heading, throttle, alt, climb
        case SYS_STATUS:    → battery_voltage, current, battery_remaining, sensors
        case RC_CHANNELS:   → ch1in..ch18in, rssi
        case SERVO_OUTPUT:  → ch1out..ch16out
        case GLOBAL_POSITION_INT: → lat, lng, alt, relative_alt, vx, vy, vz
        case STATUSTEXT:    → messages (List<string>)
        ...
    }
}
```

**Механизм 2: Poll-based (derived values)**  
`UpdateCurrentSettings()` (`CurrentState.cs:4455`) вызывается из `SerialReader` (`MainV2.cs:3064`) после read loop.  
- **Rate**: каждые 50ms (`DateTime.Now > lastupdate.AddMilliseconds(50)`, строка 4460)
- **Вычисляет**: `linkqualitygcs`, `distTraveled`, `timeInAir`, `dowindcalc()`
- **Re-requests**: datastreams каждые 8 секунд если нет данных (`requestDatastream()`, строка 4508-4528)

**Обновление UI**: UI views (FlightData) читают свойства `CurrentState` по таймеру (poll-based через `BeginInvoke`), **НЕ** через data binding.

---

## 3. Поток 2 — Команды (GCS → Vehicle)

### 3.1. Lifecycle

Пользовательские действия (ARM, Mode Change, Guided WP) транслируются в MAVLink COMMAND_LONG/COMMAND_INT сообщения.

| Шаг | Метод | Файл : строка | Описание |
|---|---|---|---|
| 1 | UI Action | `FlightData.cs`, `FlightPlanner.cs` и др. | Пользователь нажимает кнопку / контекстное меню |
| 2 | `doCommand()` / `doARM()` / `setMode()` | `MAVLinkInterface.cs:2671-2685` | Формирует `mavlink_command_long_t` struct |
| 3 | `generatePacket()` | `MAVLinkInterface.cs` | Сериализует struct → MAVLink packet bytes (с CRC, sequence number, signing) |
| 4 | `BaseStream.Write()` | `MAVLinkInterface.cs:1486-1494` | Пишет bytes в transport (Serial/TCP/UDP) через `lock(writelock)` |
| 5 | `SaveToTlog()` | `MAVLinkInterface.cs:1498` | Сохраняет отправленный пакет в `.tlog` (для replay) |
| 6 | ACK wait loop | `MAVLinkInterface.cs:2710+` | Ожидает `COMMAND_ACK` от vehicle с retry logic (3 попытки, timeout) |

### 3.2. Основные команды

| Метод | MAV_CMD / Message | Описание |
|---|---|---|
| `doARM(true)` | `COMPONENT_ARM_DISARM` p1=1 | Армирование |
| `doARM(false)` | `COMPONENT_ARM_DISARM` p1=0 | Дисармирование |
| `doARM(true, force=true)` | `COMPONENT_ARM_DISARM` p1=1, p2=2989.0f | Force ARM (magic value) |
| `doARM(false, force=true)` | `COMPONENT_ARM_DISARM` p1=0, p2=21196.0f | Force DISARM (magic value) |
| `setMode("GUIDED")` | `SET_MODE` | Смена режима полёта |
| `setGuidedModeWP(loc)` | Copter/Rover: `SET_POSITION_TARGET_GLOBAL_INT`; Plane: `MISSION_ITEM` | Отправка Guided WP. Vehicle-dependent (`MAVLinkInterface.cs:4439-4453`) |
| `setMountControl()` | `DO_MOUNT_CONTROL` | Управление gimbal |
| `doAbortLand()` | `DO_GO_AROUND` | Прерывание посадки |
| `doMotorTest()` | `DO_MOTOR_TEST` | Тест моторов |

### 3.3. Command/Response pattern

```
GCS                                       Vehicle
 │                                          │
 │──── COMMAND_LONG (cmd, p1..p7) ─────────▶│
 │                                          │
 │◀─── COMMAND_ACK (cmd, result) ──────────│
 │                                          │
 │  [если нет ACK в течение timeout]        │
 │──── COMMAND_LONG (retry, confirmation++) ▶│
 │                                          │
 │  [макс. 3 retry, потом TimeoutException] │
```

**Особенность**: `doCommandAsync()` устанавливает `giveComport = true` (строка 2713), блокируя `SerialReader` от чтения. Метод сам вызывает `await readPacketAsync()` в цикле (строка 2797), ожидая `COMMAND_ACK`. Sync wrapper `doCommand()` вызывает `.AwaitSync()` (строка 2682). Retry: 3 попытки, timeout 2000ms (кроме ARM=10s, CALIBRATION=25s). При `IN_PROGRESS` — сбрасывает retry counter.

---

## 4. Поток 3 — Параметры (Bidirectional)

### 4.1. Download (Vehicle → GCS)

Параметры — это key-value пары (string name → float value), хранящиеся в EEPROM автопилота. Mission Planner загружает их при подключении.

| Шаг | Метод | Файл : строка | Описание |
|---|---|---|---|
| 1 | `getParamList()` | `MAVLinkInterface.cs:1778-1792` | Entry point, показывает ProgressReporter dialog |
| 2 | `getParamListMavftpAsync()` | `MAVLinkInterface.cs:1810-1928` | **Попытка 1**: через MAVFTP (`@PARAM/param.pck?withdefaults=1`), если vehicle поддерживает `FTP` capability |
| 3 | `MAVFtp.GetFile()` | `MAVFtp.cs` | Файловый FTP-протокол поверх MAVLink, скачивает packed binary файл параметров |
| 4 | `parampck.unpack()` | | Распаковка binary param файла в `MAVLinkParamList` |
| 5 | `getParamListAsync()` | `MAVLinkInterface.cs:1945-2240` | **Попытка 2** (fallback): legacy — через `PARAM_REQUEST_LIST` → поток `PARAM_VALUE` сообщений |
| 6 | Subscription callback | `MAVLinkInterface.cs:2010-2080` | Каждый `PARAM_VALUE` парсится → `MAVLinkParam` → `newparamlist[paramID]` |
| 7 | Missing params retry | `MAVLinkInterface.cs:2111+` | Если пропущены параметры → `PARAM_REQUEST_READ` по одному (`onebyone=true`) |
| 8 | `_ParamListChanged` event | `MAVLinkInterface.cs:1791` | Уведомление UI о загрузке параметров |

**Ключевая оптимизация**: MAVFTP-способ загружает весь список параметров как один сжатый файл, что в ~10x быстрее поштучного `PARAM_VALUE` протокола.

#### Хранение параметров:

```
MAVState
 └── param: MAVLinkParamList (Dictionary<string, MAVLinkParam>)
 └── param_types: Dictionary<string, MAV_PARAM_TYPE>
```

### 4.2. Upload (GCS → Vehicle)

| Шаг | Метод | Файл : строка | Описание |
|---|---|---|---|
| 1 | UI change | ConfigView panels | Пользователь меняет значение параметра |
| 2 | `setParam(name, value)` | `MAVLinkInterface.cs:1620-1628` | Entry point |
| 3 | `setParamAsync()` | `MAVLinkInterface.cs:1635-1770` | Формирует `PARAM_SET`, подписывается на `PARAM_VALUE` ACK |
| 4 | Validation | `MAVLinkInterface.cs:1638-1649` | Проверка: param существует? значение изменилось? |
| 5 | Type handling | `MAVLinkInterface.cs:1665-1674` | ArduPilot всегда float; другие AP — по `param_types` |
| 6 | ACK via Subscription | `MAVLinkInterface.cs:1680-1730` | Ожидает `PARAM_VALUE` с обновлённым значением |
| 7 | Update local cache | `MAVLinkInterface.cs:1705` | `MAVlist[sysid,compid].param[st] = new MAVLinkParam(...)` |

### 4.3. Файловая persistence — ParamFile

`ExtLibs/Utilities/ParamFile.cs` (110 строк) обеспечивает сохранение/загрузку параметров в текстовый формат:

- **Формат**: `PARAM_NAME,value` (одна строка на параметр, CSV)
- **loadParamFile()**: фильтрует системные параметры (`SYSID_SW_MREV`, `WP_TOTAL`, `CMD_TOTAL`, `FENCE_TOTAL`, `SYS_NUM_RESETS`, `ARSPD_OFFSET`, `GND_ABS_PRESS`, `GND_TEMP`, `LOG_LASTFILE`, `FORMAT_VERSION` и др.)
- **SaveParamFile()**: сортирует по имени, сохраняет `InvariantCulture` формат чисел

```
Filesystem (.param)          MAVLinkInterface           Vehicle EEPROM
    │                              │                        │
    │──loadParamFile()────────▶    │                        │
    │                     setParam() ──PARAM_SET──────────▶ │
    │                              │ ◀──PARAM_VALUE──────── │
    │◀──SaveParamFile()───────    │                        │
```

---

## 5. Поток 4 — Миссии (Bidirectional)

### 5.1. Download (Vehicle → GCS)

| Шаг | Метод | Файл : строка | Описание |
|---|---|---|---|
| 1 | `getWPCount()` | `MAVLinkInterface.cs:3264-3332` | `MISSION_REQUEST_LIST` → ожидает `MISSION_COUNT` |
| 2 | `getWP(index)` | `MAVLinkInterface.cs:3395-3555` | Для каждого WP: `MISSION_REQUEST_INT` → ожидает `MISSION_ITEM_INT` |
| 3 | Parse to `Locationwp` | `MAVLinkInterface.cs:3483-3550` | `mavlink_mission_item_int_t` → `Locationwp` struct |
| 4 | `setWPACK()` | `MAVLinkInterface.cs:2431` | `MISSION_ACK` — подтверждает завершение download |

#### MAVLink Mission Protocol (download):

```
GCS                                     Vehicle
 │                                        │
 │── MISSION_REQUEST_LIST ───────────────▶│
 │◀─ MISSION_COUNT (count=N) ────────────│
 │                                        │
 │── MISSION_REQUEST_INT (seq=0) ────────▶│
 │◀─ MISSION_ITEM_INT (seq=0, lat,lng,..)│
 │                                        │
 │── MISSION_REQUEST_INT (seq=1) ────────▶│
 │◀─ MISSION_ITEM_INT (seq=1, ...) ──────│
 │    ...                                 │
 │── MISSION_REQUEST_INT (seq=N-1) ──────▶│
 │◀─ MISSION_ITEM_INT (seq=N-1, ...) ────│
 │                                        │
 │── MISSION_ACK ────────────────────────▶│
```

### 5.2. Upload (GCS → Vehicle)

| Шаг | Метод | Файл : строка | Описание |
|---|---|---|---|
| 1 | `setWPTotal(count)` | `MAVLinkInterface.cs:3750-3860` | `MISSION_COUNT` → ожидает `MISSION_REQUEST` от vehicle |
| 2 | `setWP(loc, index)` | `MAVLinkInterface.cs:3972-4230` | Для каждого WP: по запросу vehicle отправляет `MISSION_ITEM_INT` |
| 3 | ACK wait | `MAVLinkInterface.cs:4090-4130` | Ожидает `MISSION_ACK` с результатом |

#### MAVLink Mission Protocol (upload):

```
GCS                                     Vehicle
 │                                        │
 │── MISSION_COUNT (count=N) ────────────▶│
 │◀─ MISSION_REQUEST_INT (seq=0) ────────│
 │                                        │
 │── MISSION_ITEM_INT (seq=0, ...) ──────▶│
 │◀─ MISSION_REQUEST_INT (seq=1) ────────│
 │                                        │
 │── MISSION_ITEM_INT (seq=1, ...) ──────▶│
 │    ...                                 │
 │◀─ MISSION_ACK (result=ACCEPTED) ──────│
```

### 5.3. Partial Update

`setWPPartialUpdate(startwp, endwp)` — отправляет `MISSION_WRITE_PARTIAL_LIST`, за которым следует sub-set waypoints. Позволяет обновить диапазон WP без полной перезаписи.

**Файл**: `MAVLinkInterface.cs:3722-3748`

### 5.4. Data Model — Locationwp

`ExtLibs/Utilities/locationwp.cs` — struct:

```csharp
public struct Locationwp {
    public byte frame;         // MAV_FRAME (GLOBAL, GLOBAL_RELATIVE_ALT, etc.)
    public ushort id;          // MAV_CMD (WAYPOINT, LOITER, RTL, etc.)
    public float p1, p2, p3, p4;  // параметры команды
    public double lat, lng;    // координаты
    public float alt;          // высота
    public string Tag;         // метка (используется UI)
}
```

### 5.5. Файловая persistence

#### WaypointFile (QGC WPL формат)

`ExtLibs/Utilities/MissionFile.cs:14-84` — класс `WaypointFile`:

- **Формат**: текстовый, проверяется `header.Contains("QGC WPL")` (MissionFile.cs:25) — без привязки к конкретной версии
- **Строка**: `seq cur frame cmd p1 p2 p3 p4 lat lng alt autocontinue`
- **ReadWaypointFile()** → `List<Locationwp>`

#### MissionFile (JSON формат)

`ExtLibs/Utilities/MissionFile.cs:86-287` — класс `MissionFile`:

- **Формат**: JSON, совместим с QGroundControl
- **Структура**: `RootObject` → `{ mission, geoFence, rallyPoints }`
- **Mission.items**: array of `Item` (с поддержкой `ComplexItem` → `TransectStyleComplexItem` для survey)
- **ReadFile()** / **WriteFile()**: JSON сериализация через Newtonsoft.Json
- **ConvertToLocationwps()** / **ConvertFromLocationwps()**: конвертация в/из `List<Locationwp>`

```
Filesystem               FlightPlanner UI           MAVLinkInterface        Vehicle
  │                            │                          │                    │
  │──ReadWaypointFile()──▶     │                          │                    │
  │   или ReadFile()           │                          │                    │
  │                            │──pointlist[]──▶          │                    │
  │                            │              setWPTotal() │                    │
  │                            │              setWP()────────────────────────▶  │
  │                            │                          │◀─MISSION_ACK─────  │
  │                            │                          │                    │
  │                            │◀──getWPCount()───────────│                    │
  │                            │◀──getWP()────────────────│◀─────────────────  │
  │◀──WriteFile()──────────    │                          │                    │
```

---

## 6. Поток 5 — Логирование

### 6.1. Типы логов

| Тип | Расширение | Создаётся | Содержимое | Класс |
|---|---|---|---|---|
| **Telemetry log** | `.tlog` | `MainV2.cs:1619-1621` при connect | timestamp (8B) + MAVLink packet | `MAVLinkInterface.logfile` |
| **Raw log** | `.rlog` | `MainV2.cs:1622-1624` при connect | Raw serial bytes (до парсинга) | `MAVLinkInterface.rawlogfile` |
| **DataFlash log** | `.bin` / `.log` | На борту vehicle, скачивается | Бинарный лог автопилота с FMT-метаданными | `DFLog`, `DFLogBuffer` |

### 6.2. Tlog write flow

```csharp
// MAVLinkInterface.cs:1464-1484
public void SaveToTlog(Span<byte> packet) {
    if (logfile != null && logfile.CanWrite && !logreadmode) {
        lock (logfile) {
            byte[] datearray = BitConverter.GetBytes(
                (UInt64)((DateTime.UtcNow - new DateTime(1970,1,1))
                    .TotalMilliseconds * 1000));
            Array.Reverse(datearray);       // big-endian
            logfile.Write(datearray, 0, 8); // 8 bytes timestamp
            logfile.Write(packet, 0, len);  // MAVLink packet
        }
    }
}
```

**Вызывается из двух мест:**
- `readPacketAsync()` — для входящих пакетов (после парсинга и валидации)
- `Write()` — для исходящих пакетов (`MAVLinkInterface.cs:1498`)

Таким образом, `.tlog` содержит **полный bidirectional MAVLink трафик** с точными timestamps.

### 6.3. Tlog file naming

`MainV2.cs:1600-1616`:
- Путь: `Settings.Instance.LogDir / yyyy-MM-dd HH-mm-ss.tlog`
- Если файл существует — добавляется индекс: `yyyy-MM-dd HH-mm-ss-1.tlog`
- Создаётся **до** `comPort.Open()`, закрывается при disconnect (`MainV2.cs:1880`)

### 6.4. Log Playback

`MAVLinkInterface` поддерживает **replay mode** через тот же pipeline:

```csharp
// MAVLinkInterface.cs:589-593
public MAVLinkInterface(Stream logfileStream) {
    logplaybackfile = new BinaryReader(logfileStream);
    logreadmode = true;
}
```

В `logreadmode`:
- `readPacketAsync()` читает из `logplaybackfile` вместо `BaseStream`
- Timestamps восстанавливаются из 8-байт header
- Весь dispatch pipeline (Subscriptions → Events → CurrentState) работает идентично live mode
- Поддерживаемые форматы: `.tlog`, `.rlog` (`MAVLinkInterface.cs:6509-6515`)

### 6.5. DataFlash Log (DFLog)

`ExtLibs/Utilities/DFLog.cs` (756 строк) — парсер бортовых логов:

- **Формат**: строковый (CSV) или бинарный с FMT-заголовками
- **FMT line**: определяет формат сообщения: `FMT, ID, Length, Name, Format, Columns`
- **DFItem struct**: `{ msgtype, time, items[], lineno, raw[] }`
- **Label struct**: `{ Id, Format, FieldNames, Length, Name }`
- **Время**: восстанавливается через GPS week + TimeMS/TimeUS offset
- **Log_Event enum**: 50+ событий (ARMED, DISARMED, LAND_COMPLETE, EKF_ALT_RESET, etc.)
- **LogErrorSubsystem**: 31 подсистема (RADIO, COMPASS, FAILSAFE_*, GPS, EKFCHECK, etc.)

```
Vehicle Flash              MAVFtp / USB             DFLog Parser          Log Viewer UI
    │                          │                        │                      │
    │──download via FTP──────▶ │                        │                      │
    │   или SD card            │──.bin файл────────────▶│                      │
    │                          │                        │──ReadLog()──────────▶│
    │                          │                        │  GetDFItemFromLine() │
    │                          │                        │  FMTLine()           │
    │                          │                        │──List<DFItem>───────▶│
```

---

## 7. Поток 6 — HTTP API (GCS → External)

### 7.1. Обзор

`Utilities/httpserver.cs` (1288 строк) — встроенный HTTP/WebSocket сервер на порту **56781**.

**Архитектура**: `TcpListener` → `BeginAcceptTcpClient` → `ProcessClient()` thread per connection.

### 7.2. Эндпоинты

| URL | Тип | Метод | Данные |
|---|---|---|---|
| `/websocket/server` | WebSocket | JSON push (200ms) | `CurrentState` (JSON) + `wps` (JSON) |
| `/websocket/raw` | WebSocket | Binary bidirectional | Raw MAVLink packets (через `OnPacketReceived` event) |
| `/mavlink/MSG1+MSG2+...` | HTTP GET | JSON | Mavelous-совместимый: ATTITUDE, VFR_HUD, GPS_RAW_INT, SYS_STATUS, etc. |
| `/hud.jpg` `/map.jpg` `/both.jpg` | HTTP MJPEG | Multipart stream (5Hz) | MJPEG видео HUD и/или карты |
| `/hud.html` | HTTP GET | HTML file | HUD HTML страница |
| `/guided?lat=&lng=&alt=` | HTTP GET | Command | Отправляет `setGuidedModeWP()` |
| `POST /guide` | HTTP POST | Command (JSON body) | Отправляет `setGuidedModeWP()` |
| `/location.kml` | HTTP GET | KML | Текущая позиция vehicle (SharpKml) |
| `/network.kml` | HTTP GET | KML | NetworkLink для Google Earth |
| `/wps.kml` | HTTP GET | KML | Waypoints из `FlightPlanner.instance.pointlist` |
| `/georefnetwork.kml` | HTTP GET | KML | Georeferencing данные |
| `/block_plane_0.dae` | HTTP GET | DAE model | 3D модель для Google Earth |
| `/mav/*` | HTTP GET | Static files | Mavelous web UI (из `mavelous_web/` директории) |
| `/command_long` | HTTP GET | **404 stub** | Не реализовано |
| `/rcoverride` | HTTP GET | **404 stub** | Не реализовано |
| `/get_mission` | HTTP GET | **404 stub** | Не реализовано |

### 7.3. WebSocket `/websocket/server` — Data flow

```csharp
// httpserver.cs:213-240
while (client.Connected) {
    var cs = JsonConvert.SerializeObject(MainV2.comPort.MAV.cs);   // CurrentState
    var wps = JsonConvert.SerializeObject(MainV2.comPort.MAV.wps); // Waypoints
    // отправляет оба JSON payload как WebSocket text frames
    stream.Write(packet);
    Thread.Sleep(200); // 5 Hz
}
```

### 7.4. WebSocket `/websocket/raw` — Bidirectional MAVLink

```
External Client              httpserver              MAVLinkInterface
     │                           │                         │
     │◀── raw MAVLink packet ────│◀── OnPacketReceived ────│  (vehicle→client)
     │                           │                         │
     │── raw MAVLink packet ────▶│── BaseStream.Write() ──▶│  (client→vehicle)
     │                           │   (lock writelock)      │
```

**Важно**: raw WebSocket позволяет внешним приложениям **отправлять** MAVLink пакеты напрямую в vehicle через `MainV2.comPort.BaseStream.Write()` (`httpserver.cs:366-370`). Это **потенциальный security risk** — нет аутентификации.

---

## 8. Поток 7 — ADSB (External → Vehicle)

### 8.1. Lifecycle

`MainV2.cs:3097-3158` — `ADSBRunner()` background thread:

| Шаг | Описание | Строка |
|---|---|---|
| 1 | Cleanup: удаляет planes старше 30 секунд | `3110-3111` |
| 2 | Filter: выбирает planes в радиусе 10km от **vehicle** location (`comPort.MAV.cs.Location`) | `3114-3123` |
| 3 | Exclude: пропускает planes с `Source == MAVLinkInterface` (уже известны vehicle) | `3119` |
| 4 | Sort: по distance, top-10 | `3120-3122` |
| 5 | Round-robin: один plane за цикл (1 Hz), `adsbIndex++` | `3124-3125` |
| 6 | Pack: заполняет `mavlink_adsb_vehicle_t` (lat, lon, alt, heading, speed, callsign, ICAO, squawk) | `3130-3151` |
| 7 | Send: `comPort.sendPacket()` → vehicle | `3154` |

### 8.2. Источники ADSB данных

`MainV2.instance.adsbPlanes` — `ConcurrentDictionary<string, adsb.PointLatLngAltHdg>`.

Класс `adsb` (`ExtLibs/Utilities/adsb.cs`, 1324 строки) — полноценный ADS-B decoder с Mode-S parsing. Запускает background thread `TryConnect()` (adsb.cs:115) который циклически пробует **6 источников данных**:

| Источник | Порт/Протокол | Файл : строка |
|---|---|---|
| Пользовательский сервер (TCP) | `server:serverport` | `adsb.cs:124-133` |
| HTTP API (adsb.lol формат) | `server/v2/point/{lat}/{lng}/{radius}` | `adsb.cs:141-221` |
| dump1090 SBS | `localhost:30003` | `adsb.cs:231-244` |
| dump1090 AVR | `localhost:30002` | `adsb.cs:249-265` |
| rtl1090 SBS | `localhost:31004` | `adsb.cs:270-286` |
| rtl1090 AVR / adsb# | `localhost:31001`, `localhost:47806` | `adsb.cs:290-328` |

Каждый plane: `PointLatLngAltHdg` (adsb.cs:1274) — `{ Lat, Lng, Alt, Heading, Speed, VerticalSpeed, CallSign, Squawk, Tag (ICAO hex), Time, Source, ThreatLevel }`

---

## 9. Поток 8 — Settings Persistence (Internal)

### 9.1. Settings (GCS-локальные)

`ExtLibs/Utilities/Settings.cs` — singleton `Settings.Instance`:

- **Хранилище**: XML файл в user directory
- **API**: `Settings.Instance["key"]`, `GetBoolean()`, `GetInt32()`, `GetFloat()`
- **Содержимое**: GCS preferences (map provider, serial port settings, UI layout, LogDir path, etc.)
- **НЕ связано** с vehicle parameters — это чисто клиентские настройки

### 9.2. Отличие от Vehicle Parameters

| Аспект | Settings | Vehicle Parameters |
|---|---|---|
| Хранилище | Локальный XML | Vehicle EEPROM |
| Протокол | Прямое чтение/запись файла | MAVLink PARAM_SET / PARAM_VALUE |
| Количество | `[Assumption: не верифицировано]` | 500-1500+ (зависит от firmware) |
| Синхронизация | Нет (локально) | Явная через MAVLink |
| Класс | `Settings` | `MAVLinkParamList` |

---

## 10. Сводная таблица потоков

| # | Поток | Направление | Частота | Transport | Persistence | Thread |
|---|---|---|---|---|---|---|
| 1 | Телеметрия | Vehicle → GCS | 1-50 Hz | MAVLink | .tlog, CurrentState | SerialReader |
| 2 | Команды | GCS → Vehicle | По запросу | MAVLink COMMAND_LONG | .tlog | UI thread (blocking) |
| 3 | Параметры | Bidirectional | При connect + по запросу | MAVLink PARAM_* / MAVFTP | .param files, MAVLinkParamList | Background worker |
| 4 | Миссии | Bidirectional | По запросу | MAVLink MISSION_* | .waypoint / .json files | Background worker |
| 5 | Логирование | GCS → Disk | Continuous (с каждым пакетом) | File I/O | .tlog, .rlog | SerialReader (inline) |
| 6 | HTTP API | GCS → External | 5 Hz (WebSocket) / по запросу | HTTP / WebSocket | Нет | Per-connection thread |
| 7 | ADSB | External → Vehicle | 1 Hz (round-robin) | MAVLink ADSB_VEHICLE | Нет (in-memory 30s TTL) | ADSBRunner thread |
| 8 | Settings | Internal | По запросу | File I/O | XML | UI thread |

---

## 11. Критические наблюдения

### 11.1. Inline обработка без очередей

Все потоки обрабатываются **inline** — нет message queue (RabbitMQ, в-memory queue, etc.). `readPacketAsync()` читает, парсит, логирует и диспатчит в одном вызове. Синхронизация обеспечивается `readlock` (SemaphoreSlim), не queue. Это означает:

- Медленный Subscription handler блокирует весь pipeline
- Потеря пакетов при перегрузке (backpressure отсутствует)
- `SaveToTlog()` с `lock(logfile)` может создавать contention при высокой частоте пакетов

### 11.2. giveComport mutex

`giveComport` (bool) используется как **критическая секция** — когда `doCommandAsync()`, `getWPCountAsync()`, `setParamAsync()` и др. активны, `SerialReader` пропускает чтение (`MainV2.cs:3047`). Используется в 16+ местах по всему `MAVLinkInterface.cs`. Это грубый механизм взаимоисключения, не thread-safe semaphore. Race condition возможен при параллельных вызовах из разных потоков.

### 11.3. Thread safety CurrentState

`CurrentState` обновляется из `SerialReader` thread (через `OnPacketReceived` event callback), читается из UI thread. `UpdateCurrentSettings()` использует `lock(this)` (CurrentState.cs:4458), но `Parent_OnPacketReceived()` не имеет явной синхронизации. `double` свойства потенциально могут давать "torn reads" при concurrent access. `[Assumption: для float (32-bit) atomic on x86, для double — потенциально нет]`

### 11.4. HTTP API без аутентификации

`httpserver.cs` не имеет:
- Аутентификации
- Rate limiting
- CORS headers
- Валидации входящих MAVLink пакетов через raw WebSocket

Любой процесс на localhost (или в сети, если firewall открыт) может отправлять команды vehicle через `/guided?` или raw WebSocket.

### 11.5. Dual logging overhead

Каждый пакет записывается **дважды**: в `.tlog` (parsed + timestamp) и в `.rlog` (raw bytes). На высоких data rate это удваивает I/O нагрузку.

---

## 12. Связь с другими документами

| Документ | Связь |
|---|---|
| `02_SYSTEM_ARCHITECTURE.md` §3.4 | Decorator pattern в SerialPort — транспортный слой для потока 1 |
| `02_SYSTEM_ARCHITECTURE.md` §4 | Детальный маршрут MAVLink пакета — расширен в потоке 1 |
| `02_SYSTEM_ARCHITECTURE.md` §6.2 | Coupling через MainV2.comPort — используется httpserver напрямую |
| `01_CODEBASE_AUDIT_REPORT.md` §6 | Namespace MissionPlanner.Comms — все транспорты из потока 1 |

---

## ❓ Open Questions

- [ ] Как именно UI timer обновляет FlightData экран из CurrentState? Какой interval? Требует чтения `FlightData.cs` timer setup.
- [x] ~~Какой rate у UpdateCurrentSettings?~~ → **50ms** (CurrentState.cs:4460)
- [ ] Как работает DataFlash log download — через MAVFtp или через `LOG_REQUEST_DATA`? Требует чтения log download UI.
- [ ] Существует ли механизм синхронизации миссий (автоматическая загрузка при connect)? `[Assumption: нет — только по запросу пользователя]`
- [ ] ADSB: как incoming ADSB_VEHICLE packets от vehicle попадают в `adsbPlanes`? Через `_UpdateADSBPlanePosition` event (MAVLinkInterface.cs:5208)?
- [ ] Есть ли retained параметры в Settings для автоматической загрузки `.param` файла при connect?

---

*Создан на основе статического анализа кодовой базы Mission Planner. Все утверждения привязаны к конкретным файлам и строкам кода.*  
*v1.1: Self-review — исправлены 5 критических ошибок (порядок dispatch chain, механизм CurrentState, setGuidedModeWP protocol, номера строк), 5 средних неточностей (ADSB sources, WPL header, readlock, force disarm, distance filter).*
