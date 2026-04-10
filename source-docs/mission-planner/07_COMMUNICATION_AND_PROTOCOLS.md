# 07_COMMUNICATION_AND_PROTOCOLS.md — Mission Planner Communication & Protocols

**Version:** 1.0  
**Date:** 2026-04-07  
**Scope:** Коммуникационный стек Mission Planner — протоколы, транспорты, data flow и security  
**Method:** Static code analysis, no runtime testing  

---

## 1. Протокольный стек — обзор

```
┌──────────────────────────────────────────────────────────┐
│ APPLICATION LAYER                                        │
│  FlightData.mainloop() → CurrentState.* (500+ свойств)   │
│  FlightPlanner → WP upload/download, Geofence, Rally     │
│  Config* → PARAM_SET, PARAM_REQUEST_*, calibration        │
│  PluginHost → direct access to MAVLinkInterface           │
├──────────────────────────────────────────────────────────┤
│ SERVICE LAYER                                            │
│  doCommandAsync()    — COMMAND_LONG / COMMAND_INT → ACK  │
│  getParamList()      — PARAM_REQUEST_LIST → PARAM_VALUE  │
│  setWPTotal/setWP()  — MISSION_COUNT/ITEM → ACK          │
│  MAVFtp              — FILE_TRANSFER_PROTOCOL             │
│  SubscribeToPacketType() — observer callbacks             │
├──────────────────────────────────────────────────────────┤
│ PROTOCOL LAYER                                           │
│  MAVLink v1 (STX=0xFE) / MAVLink v2 (STX=0xFD)          │
│  generatePacket() → serialize + CRC + signing            │
│  readPacketAsync() → parse + validate + dispatch          │
│  DroneCAN (UAVCAN v0) — CAN bus protocol                 │
├──────────────────────────────────────────────────────────┤
│ TRANSPORT LAYER                                          │
│  ICommsSerial interface                                   │
│  SerialPort | TcpSerial | UdpSerial | UdpSerialConnect   │
├──────────────────────────────────────────────────────────┤
│ PHYSICAL / NETWORK                                       │
│  USB serial | Bluetooth | WiFi | Ethernet | 3DR Radio    │
└──────────────────────────────────────────────────────────┘
```

---

## 2. MAVLink — основной протокол

### 2.1 Версии

| Версия | STX | Header | Signing | Сообщения | Определение в коде |
|--------|-----|--------|---------|-----------|-------------------|
| MAVLink v1 | `0xFE` | 6 bytes | Нет | ID < 256 | `MAVLINK_STX_MAVLINK1` |
| MAVLink v2 | `0xFD` | 10 bytes | SHA-256 | ID до 16M | `MAVLINK_STX` |

**Auto-negotiation** (MAVLinkInterface.cs:1292):
```csharp
if (!MAVlist[sysid, compid].mavlinkv2 && messageType < 256 && !forcemavlink2)
    // MAVLink v1 format
else
    // MAVLink v2 format with optional signing
```
Если vehicle отвечает MAVLink v2 пакетом → `mavlinkv2 = true`, дальше используется v2.

### 2.2 Packet lifecycle

#### Отправка (generatePacket, строки 1256-1440)

```
1. Struct → byte[] (MavlinkUtil.StructureToByteArray)
2. v1? → [STX][len][seq][sysid][compid][msgid][payload][CRC16]
   v2? → [STX][len][incompat][compat][seq][sysid][compid][msgid×3][payload][CRC16]
3. v2+signing? → append [linkid][timestamp×6][signature×6] (SHA-256)
4. lock(writelock) → BaseStream.Write(packet)
5. logfile?.Write(timestamp + packet)  // tlog recording
6. OnPacketSent?.Invoke()
```

**Ключевые детали:**
- **GCS sysid** = 255 (`gcssysid`, строка 230)
- **GCS compid** = `MAV_COMP_ID_MISSIONPLANNER` (строка 1310)
- **Sequence** = per-interface counter (`packetcount++`, строка 1307)
- **CRC** = MAVLink CRC16 с extra CRC byte per message type
- **ReadOnly mode** (строки 1264-1281) — разрешает только READ запросы (MISSION_REQUEST, PARAM_REQUEST)

#### Приём (readPacketAsync, строки 4664-5457)

```
1. await readlock.WaitAsync()          // async semaphore
2. BaseStream.Read(buffer, 0, 1)       // byte-by-byte header scan
3. Check STX (0xFE or 0xFD)
4. Read remaining header + payload + CRC
5. Validate CRC16
6. v2+signing? → CheckSignature(SHA-256)
7. Identify sysid/compid → MAVlist[sysid,compid].Create()
8. PacketReceived(message)             // dispatch to Subscriptions
9. _OnPacketReceived?.Invoke()         // global event
10. SaveToTlog(message)                // binary logging
11. Process specific msg types (HEARTBEAT, STATUSTEXT, ADSB, etc.)
12. MAVlist[sysid,compid].lastvalidpacket = DateTime.UtcNow
```

**Non-MAVLink data handling** (строки 4767-4799):
Байты вне MAVLink пакетов (printable ASCII) записываются в `plaintxtline` — это для обнаружения bootloader/GPS вывода.

### 2.3 Message categories (используемые в MP)

| Категория | Примеры | Направление | Механизм |
|-----------|---------|-------------|----------|
| **Telemetry** | HEARTBEAT, SYS_STATUS, GPS_RAW_INT, ATTITUDE, VFR_HUD, GLOBAL_POSITION_INT | Vehicle→GCS | Periodic stream |
| **Commands** | COMMAND_LONG, COMMAND_INT | GCS→Vehicle | Request/ACK |
| **Parameters** | PARAM_REQUEST_LIST, PARAM_VALUE, PARAM_SET | Bilateral | Request/Response |
| **Missions** | MISSION_COUNT, MISSION_ITEM_INT, MISSION_REQUEST, MISSION_ACK | Bilateral | Transaction |
| **Geofence** | FENCE_POINT, FENCE_FETCH_POINT | Bilateral | Request/Response |
| **Rally** | RALLY_POINT, RALLY_FETCH_POINT | Bilateral | Request/Response |
| **Status** | STATUSTEXT, NAMED_VALUE_FLOAT, TIMESYNC | Vehicle→GCS | Event-driven |
| **ADSB** | ADSB_VEHICLE | External→GCS | Broadcast |
| **File Transfer** | FILE_TRANSFER_PROTOCOL | Bilateral | MAVFTP |
| **Calibration** | MAG_CAL_PROGRESS, MAG_CAL_REPORT | Vehicle→GCS | during calib |

### 2.4 Data streams & rates

**Файл:** `MAVLinkInterface.cs:3240-3260`

```csharp
// requestDatastream called on connect:
generatePacket(MAVLINK_MSG_ID.REQUEST_DATA_STREAM, req, sysid, compid);
// Requests streams: RAW_SENSORS, EXTENDED_STATUS, RC_CHANNELS,
//   RAW_CONTROLLER, POSITION, EXTRA1, EXTRA2, EXTRA3
```

Типичные rates (настраиваются через `SR*_*` параметры):
- HEARTBEAT: 1 Hz (hardware)
- ATTITUDE: 4-10 Hz
- POSITION: 2-4 Hz
- RC_CHANNELS: 2 Hz
- SYS_STATUS: 1-2 Hz

---

## 3. Transport layer — ICommsSerial

### 3.1 Реализации

| Класс | Файл | Протокол | Особенности |
|-------|------|----------|-------------|
| `SerialPort` | `Comms/SerialPort.cs` | USB/UART serial | Основной; DTR toggle для reboot |
| `TcpSerial` | `Comms/TcpSerial.cs` | TCP client | Для WiFi telemetry (ESP8266 и т.д.) |
| `UdpSerial` | `Comms/UdpSerial.cs` | UDP listen | Для SITL — GCS слушает на порту |
| `UdpSerialConnect` | `Comms/UdpSerialConnect.cs` | UDP connect | Для направленного UDP |
| `WebSocket` | ? | WebSocket | Для browser-based клиентов |

### 3.2 Lifecycle

```
User selects port/baud → MainV2.comPort.BaseStream = new SerialPort(port, baud)
  → BaseStream.Open()
  → MainV2.Connect() → MAVLinkInterface.getHeartBeat()
  → success → requestDatastream()
  → FlightData.mainloop() starts consuming MAV.cs.*
```

### 3.3 Mirror streams

**Файл:** `MAVLinkInterface.cs:168-174, 5460-5496`

```csharp
public class Mirror {
    public ICommsSerial MirrorStream { get; set; }
    public bool MirrorStreamWrite { get; set; }
}
public List<Mirror> Mirrors { get; set; }
```

Все принятые пакеты форвардятся в Mirror streams. Если `MirrorStreamWrite = true`, ответы из mirror записываются обратно в основной stream. Используется для:
- Forwarding telemetry на второй GCS
- UDP broadcasting для внешних приложений

---

## 4. Высокоуровневые протоколы

### 4.1 Command protocol

**doCommandAsync** (строки 2685-2830):

```
1. Create COMMAND_LONG struct (cmd, p1-p7, target_sysid, target_compid)
2. generatePacket(COMMAND_LONG)
3. Wait for COMMAND_ACK (via readPacketAsync loop)
4. Retry up to 3 times if no ACK
5. Return bool success
```

**doCommandIntAsync** (строки 2844-2960):
Аналогично, но использует `COMMAND_INT` — для команд с lat/lng в int32 формате (больше точности чем float).

### 4.2 Parameter protocol

**getParamList** (строки 1651-1770):

```
1. SubscribeToPacketType(PARAM_VALUE, callback)
2. generatePacket(PARAM_REQUEST_LIST)
3. callback accumulates params into MAVLinkParamList
4. Wait until param.TotalReported == param.TotalReceived
5. Retry missing params via PARAM_REQUEST_READ
6. Cache result to disk (MAVState.ParamCachePath → JSON)
```

**setParam** (строки 1700-1770):

```
1. Create PARAM_SET with name + value + type
2. generatePacket(PARAM_SET)
3. Wait for PARAM_VALUE echo
4. Verify returned value matches
5. Retry up to 10 times
```

### 4.3 Mission protocol

**setWPTotal + setWP** / **getWPCount + getWP**:

Upload:
```
GCS → MISSION_COUNT(count) → Vehicle
Vehicle → MISSION_REQUEST(seq=0) → GCS
GCS → MISSION_ITEM_INT(seq=0) → Vehicle
Vehicle → MISSION_REQUEST(seq=1) → GCS
... repeat ...
Vehicle → MISSION_ACK → GCS
```

Download:
```
GCS → MISSION_REQUEST_LIST → Vehicle
Vehicle → MISSION_COUNT(count) → GCS
GCS → MISSION_REQUEST(seq=0) → Vehicle
Vehicle → MISSION_ITEM_INT(seq=0) → GCS
... repeat ...
GCS → MISSION_ACK → Vehicle
```

### 4.4 MAVFTP — file transfer

**Файл:** `ExtLibs/ArduPilot/Mavlink/MAVFtp.cs` (classe, ~600 строк)

```csharp
public class MAVFtp {
    // Uses FILE_TRANSFER_PROTOCOL message
    // Operations: ListDirectory, OpenFileRO, ReadFile, 
    //             CreateFile, WriteFile, RemoveFile,
    //             CreateDirectory, RemoveDirectory,
    //             CalcFileCRC32, BurstReadFile
}
```

Используется для:
- Загрузку параметров через файл (`@PARAM/param.pck`)
- Скрипты на SD card
- Логи на SD card

### 4.5 MAVLink Signing (security)

**Файлы:** `MAVLinkInterface.cs:1381-1440, 5498-5522`

```
Signing process (SHA-256):
1. Each packet gets: [linkid][timestamp(6bytes)][signature(6bytes)]
2. signature = SHA-256(secret_key + header + payload + CRC + linkid + timestamp)[:6]
3. secret_key = 32 bytes, per vehicle (MAVState.signingKey)
4. timestamp = microseconds since 2015-01-01
```

**CheckSignature** (строки 5498-5522):
```csharp
using (SHA256CryptoServiceProvider signit = new SHA256CryptoServiceProvider()) {
    signit.TransformBlock(AuthKey, 0, AuthKey.Length, null, 0);
    signit.TransformFinalBlock(message.buffer, 0, 
        message.Length - MAVLINK_SIGNATURE_BLOCK_LEN + 7);
    var ctx = signit.Hash;
    valid = ByteArrayCompare(ctx[0..6], message.sig[7..13]);
}
```

---

## 5. DroneCAN (UAVCAN v0)

**Файл:** `ExtLibs/DroneCAN/DroneCAN.cs` (2275 строк)

| Аспект | Описание |
|--------|----------|
| **Протокол** | CAN bus protocol для intercommunication между модулями (ESC, GPS, mag, etc.) |
| **Транспорт** | Через MAVLink CAN_FRAME messages (tunneling) или прямой CAN adapter |
| **Использование** | `ConfigDroneCAN.cs` — конфигурация CAN устройств, firmware update |
| **Масштаб** | 2275 строк core + 71558 bytes ConfigDroneCAN UI |

---

## 6. HTTP API

**Файл:** `Utilities/httpserver.cs` (1288 строк)

```csharp
// Port: 56781 (hardcoded)
listener = new TcpListener(IPAddress.Any, 56781);
```

| Endpoint паттерн | Формат | Назначение |
|-----------------|--------|-----------|
| `/` | HTML | Mavelous web interface |
| `/mav/*` | JSON | MAVLink telemetry data (CurrentState.*) |
| `/mavs` | JSON | List of connected vehicles |
| `/map*.jpg` | JPEG | Map tile proxy |
| `/hud.html` | HTML | HUD overlay |
| `/network.kml` | KML | Network link for Google Earth |
| `/georef/*` | JPEG | Georeferenced images |
| MJPEG stream | MJPEG | Live video stream |
| WebSocket | Binary | Real-time telemetry streaming |

**Механизм:** Raw TCP listener → manual HTTP parsing → response based on URL pattern. Нет использования ASP.NET или любого HTTP framework.

---

## 7. Событийная модель (Events)

### 7.1 MAVLinkInterface events

| Event | Signature | Назначение |
|-------|-----------|-----------|
| `OnPacketReceived` | `EventHandler<MAVLinkMessage>` | Каждый валидный пакет от любого vehicle |
| `OnPacketSent` | `EventHandler<MAVLinkMessage>` | Каждый отправленный пакет |
| `MAVDetected` | `EventHandler<(byte sysid, byte compid)>` | Новый vehicle обнаружен |
| `ParamListChanged` | `EventHandler` | Параметры перечитаны |
| `MavChanged` | `EventHandler` | Активный vehicle переключен |
| `CommsClose` | `EventHandler` | Соединение закрыто |
| `UpdateADSBPlanePosition` | `EventHandler<PointLatLngAltHdg>` | ADSB traffic update (static) |
| `UpdateADSBCollision` | `EventHandler<(string, MAV_COLLISION_THREAT_LEVEL)>` | Collision alert (static) |

### 7.2 Subscription system

```csharp
// Subscribe to specific message type:
var sub = comPort.SubscribeToPacketType(
    MAVLINK_MSG_ID.PARAM_VALUE,    // message type
    (msg) => { ... return true; }, // callback
    sysid, compid,                 // target vehicle
    exclusive: false               // don't remove others
);

// Unsubscribe:
comPort.UnSubscribeToPacketType(sub);
```

**Dispatch** (PacketReceived, строки 5525-5552):
- Lock Subscriptions → copy to array
- For each subscription: match msgId + (sysid,compid) or (0,0=current)
- Call callback synchronously in reader thread

---

## 8. Concurrency model

### 8.1 Threads

| Thread | Роль | Rate | Файл |
|--------|------|------|------|
| **UI thread** | WinForms event loop | Event-driven | MainV2 |
| **Reader thread** | readPacketAsync loop | Continuous | MainV2.SerialReader |
| **mainloop** | UI update, graphs, map | ~20Hz (50ms sleep) | FlightData.cs:3345 |
| **Speech thread** | TTS + warning checks | ~20Hz (50ms sleep) | MainV2.cs:2500 |
| **Heartbeat** | Send HEARTBEAT to vehicle | 1Hz | MAVLinkInterface |
| **HTTP server** | Listen + serve | Per-connection | httpserver.cs |

### 8.2 Synchronization primitives

| Primitive | Файл | Назначение |
|-----------|------|-----------|
| `giveComport` (volatile bool) | MAVLinkInterface.cs:268 | Exclusive port access |
| `readlock` (SemaphoreSlim) | MAVLinkInterface.cs | One reader at a time |
| `writelock` (object) | MAVLinkInterface.cs | Serialize writes |
| `lock(Subscriptions)` | MAVLinkInterface.cs | Thread-safe subscription list |
| `BeginInvokeIfRequired()` | MainV2.cs | UI thread marshaling |

### 8.3 Data flow

```
[Vehicle] ──serial/tcp/udp──► [ICommsSerial]
    │
    ▼
[readPacketAsync()] ──readlock──► Parse MAVLink packet
    │
    ├── PacketReceived() → Subscriptions callbacks (sync)
    ├── _OnPacketReceived?.Invoke() → global handlers  
    ├── SaveToTlog() → binary log
    └── Update MAVState.cs + CurrentState properties
              │
              ▼ (via BindingSource / reflection)
    [FlightData.mainloop()] ──sleep(50)──► Update HUD, Graphs, Map
              │
              ▼ (via BeginInvokeIfRequired)
    [WinForms UI Thread] → Render
```

---

## 9. Проблемы и риски

| Проблема | Описание | Impact |
|---------|---------|--------|
| **No async transport** | `ICommsSerial.Read/Write` — sync only; `readPacketAsync` wraps with `Task.Delay(1)` polling | Performance, scalability |
| **Single writer lock** | `lock(writelock)` — все writes сериализованы; long tlog write blocks sending | Latency |
| **giveComport fragility** | Boolean mutex без ownership — любой thread может unlock | Data corruption risk |
| **Inline subscriptions** | Callbacks run in reader thread — slow callback blocks all reading | Throughput |
| **No message queue** | No buffering between reader and consumers — packet loss on slow consumer | Reliability |
| **HTTP API raw TCP** | Manual HTTP parsing, no framework — security, compliance risks | Security |
| **Hardcoded port 56781** | Not configurable | Deployment |
| **Static ADSB events** | `UpdateADSBPlanePosition` is static — всё ADSB data shared globally | Multi-instance |
| **No TLS** | HTTP API и MAVLink signing — но нет encryption | Security |
| **CRC-only integrity** | MAVLink v1 has no signing — replay attacks possible | Security |

---

## 10. Ключевые выводы

### Что работает хорошо
1. **MAVLink v1/v2 auto-negotiation** — seamless upgrade
2. **Transport abstraction** — `ICommsSerial` enables multiple transports
3. **Subscription system** — flexible message-specific observers
4. **MAVLink signing** — SHA-256 based security for v2
5. **Mirror streams** — telemetry forwarding built-in
6. **MAVFTP** — file operations over MAVLink

### Что создаёт проблемы
1. **Sync I/O** — `ICommsSerial` has no async API
2. **Single-threaded reader** — one readPacketAsync thread per connection
3. **giveComport** — fragile concurrency primitive
4. **No message queue** — reader directly dispatches, no backpressure
5. **Raw HTTP server** — not production-ready for external exposure

---

*Следующий шаг: 08_EXTERNAL_INTERFACES.md*
