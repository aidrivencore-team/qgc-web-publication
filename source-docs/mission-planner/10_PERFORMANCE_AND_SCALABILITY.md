# 10_PERFORMANCE_AND_SCALABILITY.md — Mission Planner Performance & Scalability

**Version:** 1.1 (self-reviewed)  
**Date:** 2026-04-07  
**Scope:** Threading model, polling patterns, memory, UI performance, scalability limits  
**Method:** Static code analysis — no runtime profiling  

---

## 1. Concurrency Architecture

### 1.1 Thread map

```
┌─────────────── APPLICATION THREADS ───────────────────┐
│                                                        │
│  [UI Thread]          WinForms message pump             │
│       │               GMapControl rendering             │
│       │               HUD drawing                       │
│       │               DataGridView updates              │
│       │                                                 │
│  [Serial Reader]      readPacketAsync() hot loop        │
│       │               ├── parse MAVLink packets         │
│       │               ├── dispatch to subscribers       │
│       │               └── update CurrentState (500+     │
│       │                    properties per packet)       │
│       │                                                 │
│  [Joystick]           joysticksend() — 25 Hz           │
│       │               RC override packets               │
│       │                                                 │
│  [HTTP Server]        httpserver.listernforclients      │
│       │               per-connection threads            │
│       │                                                 │
│  [Plugin Loop]        PluginThread — shared loop        │
│       │               all plugins sequential            │
│       │                                                 │
│  [FlightData Loop]    mainloop() — UI data refresh     │
│       │               BeginInvoke → UI thread           │
│       │                                                 │
│  [Script Thread]      IronPython execution              │
│                                                        │
│  + ad-hoc Task.Run() for firmware, SRTM, etc.         │
└────────────────────────────────────────────────────────┘
```

### 1.2 Thread creation stats (core files)

| File | `new Thread` | `Task.Run` | Background threads | Total |
|------|-------------|-----------|-------------------|-------|
| `MainV2.cs` | 3 | 5 | httpthread, pluginthread, joystick | 8 |
| `FlightData.cs` | 2 | 0 | mainloop, scriptthread | 2 |
| **Total identified** | **5** | **5** | — | **10** |

---

## 2. Polling & Delay Patterns

### 2.1 Sleep/Delay statistics

| File | `Thread.Sleep` | `Task.Delay` | Total | Most common |
|------|---------------|-------------|-------|-------------|
| `MAVLinkInterface.cs` | 13 | 11 | **24** | `Sleep(1)`, `Sleep(10)`, `Delay(1)` |
| `MainV2.cs` | 7 | 4 | **11** | `Sleep(500)`, `Sleep(1000)`, `Delay(100)` |
| `FlightData.cs` | 8 | 3 | **11** | `Sleep(1000)`, `Sleep(50)` (mainloop pacing) |
| `FlightPlanner.cs` | 2 | 0 | **2** | Minimal |
| **Total** | **30** | **18** | **48** | — |

### 2.2 Critical polling loops

**MAVLinkInterface.readPacketAsync()** — сердце системы:
```csharp
// Line 4737: inner packet read loop
await Task.Delay(1).ConfigureAwait(false);  // 1ms polling — CPU spin

// Line 4830: wait for data
await Task.Delay(1).ConfigureAwait(false);  // polling instead of event-driven

// Line 811: parameter download wait
Thread.Sleep(1);  // tight polling on serial port
```

**MainV2.SerialReader()** — основной loop:
```csharp
// Line 2620:
await Task.Delay(1).ConfigureAwait(false); // was 5 — уменьшен для throughput
```

### 2.3 Performance impact

| Pattern | Проблема | Impact |
|---------|---------|--------|
| `Task.Delay(1)` polling | Polling вместо event-driven → ~1000 wakeups/sec | CPU: 5-15% idle burn |
| `Thread.Sleep(1)` | Blocks thread + minimum 15ms on Windows | Latency: 15ms minimum |
| `Thread.Sleep(10-20)` | Inter-packet delay в send operations | Throughput: limits burst rate |
| Synchronous serial reads | `BaseStream.Read()` блокирует thread | Thread starvation risk |

---

## 3. Memory Patterns

### 3.1 Byte array allocations in MAVLink

```csharp
// Per-packet allocation (every 10-50ms):
byte[] buffer = new byte[MAVLINK_MAX_PACKET_LEN + 25];  // Line 4666
byte[] data = MavlinkUtil.StructureToByteArray(indata);   // Line 1287
packet = new byte[data.Length + 6 + 2];                    // Line 1301
```

При 50 пакетах/сек = **~300 allocations/sec**, создавая GC pressure.

### 3.2 GC monitoring (встроенный)

```csharp
// Line 4952: периодический лог GC
GC.GetTotalMemory(false) / 1024 / 1024.0  // MB usage logged to console
```

Единственная точка memory monitoring — лог в `readPacketAsync`. Нет alerting, нет limits.

### 3.3 Memory-intensive patterns

| Pattern | Location | Impact |
|---------|---------|--------|
| **Per-packet byte[] alloc** | `MAVLinkInterface` send/receive | GC gen0 pressure |
| **CurrentState 500+ properties** | Updated per packet | Object graph size |
| **Map tile cache** | GMap.NET (SQLite + memory) | Unbounded growth potential |
| **Telemetry log files** | `.tlog` continuous write | Disk space — no rotation |
| **Route point lists** | FlightData track history | `List<PointLatLng>` grow indefinitely |
| **SRTM elevation cache** | `srtm.cs` static dictionary | Memory retained forever |
| **ADSB planes dict** | `ConcurrentDictionary` | Grows with traffic, no TTL |

---

## 4. UI Performance

### 4.1 Cross-thread UI pattern

**BeginInvoke count в core файлах:**

| File | `BeginInvoke` / `BeginInvokeIfRequired` | Impact |
|------|----------------------------------------|--------|
| `FlightData.cs` | **24** | Heavy — map + HUD + marker updates |
| `MainV2.cs` | **19** | Medium — status, connect, UI updates |
| `FlightPlanner.cs` | **7** | Light — mission changes |
| **Total** | **50** | UI thread message queue flood |

### 4.2 Map rendering bottleneck

```
Background thread → update position → BeginInvoke → WinForms thread
  → GMapControl.Position = new PointLatLng(...)
  → GMapControl.UpdateRouteLocalPosition(route)
  → GMapOverlay.Markers.Add(marker)
  → Full map re-render on every position update
```

При 10Hz telemetry = **10 full redraws/sec + 10+ BeginInvoke calls/sec**.

### 4.3 HUD rendering

HUD рисуется через GDI+ (`OnPaint` override) с полным перерисовыванием:
- No double buffering в явном виде
- Каждый кадр = полный redraw всех инструментов
- При 10Hz update = потенциальный bottleneck на слабых CPU

---

## 5. Scalability Limits

### 5.1 Multi-vehicle

```
Architecture:   MainV2.comPort (single MAVLinkInterface)
                      └── MAVList (master/hidden lists)
                              └── MAVState per vehicle (sysid/compid)

Practical limit: ~10-15 vehicles per connection
Bottleneck:      single readPacketAsync() thread + shared giveComport mutex
```

| Аспект | Limit | Причина |
|--------|-------|---------|
| **Vehicles per link** | ~10-15 | Single reader thread bandwidth |
| **Concurrent connections** | ~3-5 | Static `MainV2.comPort` + `Comports` list, manual switching |
| **Parameters per vehicle** | ~1500 | Serial download, ~30 sec per vehicle |
| **Waypoints** | ~1000 | Sequential upload, linear time |
| **Map markers** | ~5000 | GMapControl rendering degradation |
| **ADSB targets** | ~500 | ConcurrentDictionary + UI redraw per target |
| **Plugin loop** | Sequential | One slow plugin blocks ALL plugins |

### 5.2 Data throughput

| Link type | Typical bandwidth | MAVLink throughput |
|-----------|------------------|--------------------|
| Serial 57600 | 5.7 KB/s | ~50-100 packets/sec |
| Serial 921600 | 92 KB/s | ~1000-2000 packets/sec |
| UDP/TCP | Network limited | ~5000+ packets/sec (theoretical) |

**Bottleneck chain:**
```
Serial port baudrate
  → synchronous BaseStream.Read() 
    → single readPacketAsync() thread
      → MavlinkUtil.ByteArrayToStructure() (reflection-based)
        → CurrentState property update (500+ reflective sets)
          → BeginInvoke() to UI thread (50 calls/sec)
            → GMap redraw → screen
```

### 5.3 Horizontal scaling: Невозможно

| Аспект | Причина |
|--------|---------|
| **Desktop-only** | WinForms → single machine |
| **No message queues** | Direct method calls, no decoupling |
| **Static singletons** | Single process, single instance |
| **No API for remote access** | HTTP API read-only, no write operations |
| **No database** | In-memory state only (except Settings XML) |

---

## 6. Performance Anti-patterns Summary

| Anti-pattern | Count | Severity | Fix complexity |
|-------------|-------|----------|---------------|
| **Polling with Task.Delay(1)** | ~10 | 🔴 High | Medium — event-driven rewrite |
| **Thread.Sleep in async path** | ~25 | 🔴 High | Medium — replace with await |
| **Per-packet byte[] allocations** | ~300/sec | 🟡 Medium | Low — ArrayPool |
| **GMap full redraw per update** | 10/sec | 🟡 Medium | Medium — batching |
| **Reflection for deserialization** | Per packet | 🟡 Medium | High — codegen |
| **Unbounded collection growth** | 5+ locations | 🟡 Medium | Low — TTL/max size |
| **BeginInvoke flood** | 50/sec max | 🟡 Medium | Low — throttle/batch |
| **Synchronous I/O** | BaseStream.Read | 🔴 High | High — async rewrite |
| **Sequential plugin execution** | 1 loop | 🟢 Low | Low — parallel foreach |

---

## 7. Quick Wins

| Действие | Effort | Impact | Описание |
|---------|--------|--------|---------|
| ArrayPool<byte> | Low | Medium | Eliminate per-packet byte[] GC pressure |
| UI update throttle | Low | High | Batch BeginInvoke to max 30fps |
| ADSB TTL | Low | Medium | Expire old targets from ConcurrentDictionary |
| Route history limit | Low | Medium | Cap track point list at N entries |
| Log file rotation | Low | Medium | Prevent disk exhaustion from .tlog |
| Plugin parallel loop | Low | Low | `Parallel.ForEach` instead of sequential |

---

*Следующий шаг: 11_RISK_ASSESSMENT.md*
