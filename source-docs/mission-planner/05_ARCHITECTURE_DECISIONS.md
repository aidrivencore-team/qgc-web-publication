# 05_ARCHITECTURE_DECISIONS.md — Mission Planner Architecture Decisions

**Version:** 1.1 (self-reviewed)  
**Date:** 2026-04-07  
**Scope:** Архитектурные решения Mission Planner — что выбрано, почему (или Assumption), и какие последствия это несёт  
**Method:** Static code analysis, no runtime testing  

---

## 1. Сводная таблица решений

| # | Решение | Категория | Оценка |
|---|---------|-----------|--------|
| AD-01 | .NET Framework 4.7.2 + WinForms | Platform | Lock-in |
| AD-02 | Static singletons как архитектурный скелет | Architecture | Anti-pattern |
| AD-03 | `giveComport` — boolean mutex | Concurrency | Risk |
| AD-04 | `ICommsSerial` — abstract transport | Communication | Good |
| AD-05 | Observer pattern через Subscriptions | Communication | Good |
| AD-06 | `MAVList` + `MAVState` — multi-vehicle model | Data Model | Good |
| AD-07 | `Dictionary<string,string>` + XML — Settings | Persistence | Debt |
| AD-08 | Reflection-based data binding | UI/Data | Trade-off |
| AD-09 | `BackstageView` — custom navigation framework | UI Framework | Custom |
| AD-10 | `ThemeManager` — runtime theme engine | UI Framework | Good |
| AD-11 | ExtLibs — internal fork monorepo | Build/Deps | Debt |
| AD-12 | log4net — structured logging | Diagnostics | Standard |
| AD-13 | Plugin + IronPython — dual extensibility | Extensibility | Good |
| AD-14 | Thread.Sleep polling loops | Concurrency | Anti-pattern |
| AD-15 | God-objects (FlightData / FlightPlanner / MainV2) | Architecture | Anti-pattern |
| AD-16 | Tlog binary logging | Telemetry | Proprietary |

---

## 2. Детальный анализ каждого решения

---

### AD-01: .NET Framework 4.7.2 + Windows Forms

**Файл:** `MissionPlanner.csproj:3`  
```xml
<TargetFramework>net472</TargetFramework>
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Целевая платформа — .NET Framework 4.7.2, UI — Windows Forms |
| **Причина** | `[Assumption]` Проект начат в ~2010 году, когда WinForms была стандартной технологией для Windows desktop. .NET Core/5+ ещё не существовал |
| **Последствия** | |
| ✅ Плюс | Зрелая экосистема, обширная база контролов, хорошая поддержка COM/P-Invoke, работа на Windows 7+ |
| ✅ Плюс | Mono совместимость (`public static bool MONO = false;`, MainV2.cs:448) — базовая поддержка Linux/Mac |
| ❌ Минус | **Windows-only** в production (Mono — best-effort) |
| ❌ Минус | **Нет поддержки .NET 6/7/8** — невозможно использовать `async Main`, `Span<T>`, modern C# features |
| ❌ Минус | **Нет кросс-платформенности** — WinForms не работает на macOS/Linux нативно |
| ❌ Минус | .NET Framework 4.7.2 — EOL в ближайшей перспективе |

**Гибридность ExtLibs:**  
Часть библиотек уже нацелены на `netstandard2.0`:
- `Interfaces.csproj` → `netstandard2.0`
- `AviFile.csproj` → `netstandard2.0`  
- `SharpKml.csproj` → `netstandard2.0`
- `ZedGraph.csproj` → `net472;netstandard2.0` (dual target)

Это создаёт **частичную готовность** к миграции на .NET 6+, но основной проект (`MissionPlanner.csproj`) остаётся на `net472`.

---

### AD-02: Static singletons как архитектурный скелет

**Файлы:** `MainV2.cs:401-417`, `FlightData.cs:246`, `FlightPlanner.cs:146`

```csharp
// MainV2.cs:401
public static MAVLinkInterface comPort { get; set; }
static MAVLinkInterface _comPort = new MAVLinkInterface();     // :417

// MainV2.cs:422
public static List<MAVLinkInterface> Comports = new List<MAVLinkInterface>();

// FlightData.cs:246
instance = this;

// FlightPlanner.cs:146
instance = this;
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Глобальное состояние приложения хранится в static полях `MainV2`, доступных отовсюду |
| **Причина** | `[Assumption]` Упрощение доступа к comPort из любого UI контрола или background thread. Типичный подход для WinForms monolith, возникший в ранних версиях |
| **Масштаб** | `MainV2.comPort` используется в 100+ местах через `MainV2.comPort.MAV.cs.*` |

**Граф зависимостей от MainV2:**
```
MainV2.comPort ← FlightData.mainloop()
MainV2.comPort ← FlightPlanner.saveWPs()
MainV2.comPort ← InitialSetup.* (config pages)
MainV2.comPort ← SoftwareConfig.* (param pages)
MainV2.comPort ← Script.cs (Python scripting)
MainV2.comPort ← Plugin/PluginHost.cs:114
MainV2.comPort ← WarningEngine (via CurrentState)
MainV2.instance ← PluginHost.MainForm
```

| Последствие | Влияние |
|-------------|---------|
| ❌ **Невозможность unit testing** | Любой тест требует инициализации `MainV2.comPort`, а значит WinForms Form |
| ❌ **Tight coupling** | Каждый модуль напрямую зависит от `MainV2` — нет инверсии зависимостей |
| ❌ **Race conditions** | Множественные потоки пишут в `comPort` без явной синхронизации (кроме `giveComport`) |
| ✅ **Простота доступа** | Любой код может получить текущее состояние через `MainV2.comPort.MAV.cs` |

---

### AD-03: `giveComport` — boolean mutex

**Файл:** `MAVLinkInterface.cs:237-268`

```csharp
public bool giveComport {
    get { return _giveComport; }
    set {
        if (_giveComport && value) {
            log.Error(new StackTrace().ToString());
            Debugger.Break();  // double-lock detection
        }
        if (value == true) {
            lock (readlock) { }  // wait for current read
        }
        _giveComport = value;
    }
}
private volatile bool _giveComport = false;
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Единственный boolean флаг для exclusive access к serial port/MAVLink потоку |
| **Причина** | `[Assumption]` Необходимость координировать доступ между UI thread, mainloop и background operations. Простейшее решение вместо полноценного mutex/semaphore |
| **Использование** | 90+ мест в `MAVLinkInterface.cs` где `giveComport` устанавливается/сбрасывается |

**Механизм:**
1. Background operation (getParams, getWPs) устанавливает `giveComport = true`
2. `FlightData.mainloop()` проверяет: `if (giveComport) { sleep(50); continue; }` — пропускает цикл
3. UI thread ждёт через `while (comPort.giveComport) Thread.Sleep(100)` (MainV2.cs:2836)
4. Operation завершается → `giveComport = false`

| Последствие | Влияние |
|-------------|---------|
| ❌ **Нет ownership** | Любой поток может установить/сбросить флаг без проверки владельца |
| ❌ **Spinlock pattern** | Ожидание реализовано как `while + Thread.Sleep` — не true mutex |
| ❌ **Double-lock только в debug** | `Debugger.Break()` на production не работает |
| ❌ **Нет fairness** | Нет очереди — произвольный поток может захватить port |
| ✅ **Простота** | Одна точка синхронизации вместо распределённых locks |

---

### AD-04: `ICommsSerial` — абстрактный транспорт

**Файл:** `ExtLibs/Interfaces/ICommsSerial.cs:6`

```csharp
public interface ICommsSerial : IDisposable {
    Stream BaseStream { get; }
    int BaudRate { get; set; }
    bool IsOpen { get; }
    string PortName { get; set; }
    void Open();
    void Close();
    int Read(byte[] buffer, int offset, int count);
    void Write(byte[] buffer, int offset, int count);
    void toggleDTR();
    // ... 20+ members total
}
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Единый интерфейс для всех транспортов, моделирующий Serial Port API |
| **Причина** | MAVLink должен работать поверх Serial, TCP, UDP, WebSocket — transport agnostic |
| **Реализации** | `SerialPort`, `TcpSerial`, `UdpSerial`, `UdpSerialConnect`, `WebSocket` |

| Последствие | Влияние |
|-------------|---------|
| ✅ **Полиморфизм** | `MAVLinkInterface.BaseStream` имеет тип `ICommsSerial` — подставляется любой транспорт |
| ✅ **Тестируемость** | Можно создать mock `ICommsSerial` для unit testing MAVLink |
| ❌ **Leaky abstraction** | Некоторые свойства Serial-specific (`DtrEnable`, `RtsEnable`, `toggleDTR`) не имеют смысла для TCP/UDP |
| ❌ **No async API** | `Read/Write` только синхронные — нет `ReadAsync/WriteAsync` |

---

### AD-05: Observer pattern через Subscriptions

**Файл:** `MAVLinkInterface.cs:5554-5605`

```csharp
readonly private List<(MAVLINK_MSG_ID msgId, Func<MAVLinkMessage, bool> function, 
    bool exclusive, byte sysid, byte compid)> Subscriptions;

public int SubscribeToPacketType(MAVLINK_MSG_ID msgid, 
    Func<MAVLinkMessage, bool> function, byte sysid, byte compid, bool exclusive = false);

public void UnSubscribeToPacketType(int id);
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Callback-based observer pattern для подписки на конкретные типы MAVLink сообщений |
| **Причина** | Разные модули должны реагировать на разные типы пакетов (PARAM_VALUE, STATUSTEXT, MISSION_ACK и т.д.) |
| **Использование** | ~30 мест — `getParamList`, `doARM`, `getHomePosition`, `FlightData` actions |

**Особенности:**
- `exclusive = true` — удаляет предыдущих подписчиков на этот msgId
- Subscribe возвращает `int id` (hashCode) для последующего UnSubscribe
- Все callbacks вызываются **синхронно** в reader thread (inline processing)
- `lock (Subscriptions)` — thread-safe добавление/удаление

| Последствие | Влияние |
|-------------|---------|
| ✅ **Декомпозиция** | Логика обработки пакетов распределена между подписчиками, а не в одном switch |
| ✅ **Temporary subscriptions** | Subscribe/Unsubscribe позволяет временным задачам подписываться на пакеты |
| ❌ **Inline processing** | Callbacks блокируют reader thread — медленный callback замедлит всё |
| ❌ **No message queue** | Нет буферизации — если callback не обработал, пакет теряется |
| ❌ **HashCode as ID** | `GetHashCode()` для ValueTuple не уникален — потенциальные коллизии при UnSubscribe |

---

### AD-06: `MAVList` + `MAVState` — multi-vehicle model

**Файлы:** `MAVList.cs:8`, `MAVState.cs:23`

```csharp
// MAVList — контейнер vehicles
public class MAVList : IEnumerable<MAVState>, IDisposable {
    private Dictionary<int, MAVState> masterlist;   // видимые
    private Dictionary<int, MAVState> hiddenlist;    // скрытые (3DR radio и т.д.)
    // ID = sysid * 256 + compid
}

// MAVState — состояние одного vehicle
public class MAVState : MAVLink, IDisposable {
    public MAVLinkInterface parent;
    public CurrentState cs = new CurrentState();
    public MAVLinkParamList param = new MAVLinkParamList();
    public Dictionary<uint, Queue<MAVLinkMessage>> packets;
    public byte sysid, compid;
    // ...
}
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Каждый vehicle (sysid+compid) имеет собственное состояние в `MAVState`, доступное через `MAVList[sysid, compid]` |
| **Причина** | MAVLink сеть может содержать несколько vehicles и компонентов (autopilot, gimbal, companion) |
| **Активный vehicle** | `comPort.sysidcurrent` / `compidcurrent` определяют текущий |

**Структура владения:**
```
MAVLinkInterface
  ├── MAVList MAVlist
  │     ├── MAVState[1,1]  → CurrentState cs, MAVLinkParamList param
  │     ├── MAVState[1,2]  → (gimbal)
  │     └── MAVState[2,1]  → (second vehicle)
  ├── MAVState MAV         → shortcut to MAVlist[sysidcurrent, compidcurrent]
  └── ICommsSerial BaseStream
```

| Последствие | Влияние |
|-------------|---------|
| ✅ **Multi-vehicle** | Архитектура готова к работе с несколькими vehicles |
| ✅ **Per-vehicle state** | Каждый vehicle имеет свой `CurrentState`, `param` cache |
| ✅ **Hidden list** | 3DR radio и другие служебные компоненты не мешают основному UI |
| ❌ **Single UI** | UI показывает только `MAV` (текущий) — нет multi-vehicle dashboard |
| ❌ **Single BaseStream** | Все vehicles на одном transport — один serial port = все vehicles |

---

### AD-07: `Dictionary<string,string>` + XML — Settings

**Файл:** `Settings.cs:16-562`

```csharp
public class Settings {
    static Settings _instance;                            // Singleton
    public static Dictionary<string, string> config;       // ВСЕ настройки
    public static string FileName { get; set; } = "config.xml";
    
    public string this[string key] {                       // indexer
        get { config.TryGetValue(key, out value); }
        set { config[key] = value; }
    }
    
    public void Load() { /* XmlTextReader */ }
    public void Save() { /* XmlTextWriter */ }
}
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Все настройки приложения — один плоский `Dictionary<string,string>`, persistent в XML |
| **Причина** | `[Assumption]` Максимальная простота — любая настройка = string ключ + string значение |
| **Формат** | XML: `<Config><key1>value1</key1><key2>value2</key2></Config>` |

**Проблемы с ключами** (Settings.cs:527-535):
```csharp
if (key.Contains("/") || key.Contains(" ") || key.Contains("-") || ...)
    Debugger.Break();  // Bad config key!
```

Ключи не могут содержать `/`, ` `, `-`, `:`, `;`, `@`, `!`, `#`, `$`, `%` — значительное ограничение.

| Последствие | Влияние |
|-------------|---------|
| ✅ **Простота** | Любой код: `Settings.Instance["key"] = "value"` |
| ❌ **Untyped** | Все значения — string. Каждый потребитель конвертирует: `GetFloat()`, `GetBoolean()`, `GetInt32()` |
| ❌ **No validation** | Любой ключ/значение может быть записан без проверки |
| ❌ **No schema** | Нет документации какие ключи существуют и какие значения допустимы |
| ❌ **Key restrictions** | Запрет на спецсимволы в ключах из-за XML element names |
| ❌ **No encryption** | Все данные (включая потенциальные credentials) хранятся plain-text |
| ❌ **Not thread-safe** | `Dictionary<string,string>` не потокобезопасен, доступ из нескольких threads |

---

### AD-08: Reflection-based data binding

**Файлы:** `FlightData.cs:460-498`, `CurrentState.cs`

```csharp
// FlightData.cs — binding QuickView to CurrentState property:
var b = new Binding("number", bindingSourceQuickTab, 
    Settings.Instance["quickView" + f], true);

// Tuning graph — PropertyInfo reflection:
list1item = typeof(CurrentState).GetProperty(chk.Name);
list1.Add(time, list1item.GetValue(cs, null).ConvertToDouble());
```

| Аспект | Описание |
|--------|----------|
| **Решение** | UI элементы привязаны к произвольным свойствам `CurrentState` через reflection |
| **Причина** | `CurrentState` содержит 500+ свойств. Hardcoded binding для каждого — невозможен. Reflection позволяет пользователю самому выбирать |
| **Scope** | QuickView панели, tuning graph (20 каналов), WarningEngine conditions |

| Последствие | Влияние |
|-------------|---------|
| ✅ **Гибкость** | Пользователь может привязать QuickView к любому из 500+ свойств CurrentState |
| ✅ **Zero code** | Добавление нового свойства в CurrentState автоматически делает его доступным в UI |
| ❌ **Performance** | `PropertyInfo.GetValue()` on hot path (75ms для tuning) — reflection overhead |
| ❌ **No compile-time safety** | Опечатка в имени свойства = silent failure |
| ❌ **WinForms coupling** | `BindingSource` — WinForms-specific, не переносимо |

---

### AD-09: `BackstageView` — custom navigation framework

**Файл:** `ExtLibs/Controls/BackstageView/BackstageView.cs:18`

```csharp
public partial class BackstageView : MyUserControl, IContainerControl {
    // Left sidebar menu + right content panel
    // Lazy loading of pages
    // Theme-aware
}
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Custom navigation component вместо стандартного TabControl для InitialSetup и SoftwareConfig |
| **Причина** | `[Assumption]` Стандартный TabControl не подходил визуально. BackstageView обеспечивает Ribbon-like sidebar navigation |
| **Использование** | `InitialSetup.backstageView`, `SoftwareConfig.backstageView` |

**Архитектура:**
```
BackstageView
  ├── BackStageViewMenuPanel (left sidebar)
  │     └── BackstageViewButton × N
  └── ContentPanel (right area)
        └── BackstageViewPage.Page (lazy-loaded UserControl)
```

**Lazy loading** (`BackstageViewPage.cs`):
- `Page` not created until tab clicked
- `ApplyTheme` event — static handler для ThemeManager
- `Tracking` event — analytics/page view tracking

| Последствие | Влияние |
|-------------|---------|
| ✅ **Lazy loading** | Config pages loaded on demand — быстрый старт |
| ✅ **Theme integration** | `ApplyTheme` event → все страницы стилизуются uniform |
| ❌ **Custom widget** | Не стандартный WinForms контрол — нужна поддержка |
| ❌ **No MVVM** | Pages напрямую манипулируют `MainV2.comPort` — нет view model |

---

### AD-10: `ThemeManager` — runtime theme engine

**Файл:** `Utilities/ThemeManager.cs:159` (1430 строк)

```csharp
public class ThemeManager {
    public static Color BGColor, ControlBGColor, TextColor, ...;  // 25+ цветовых полей
    public static List<String> ThemeNames;
    
    public static void LoadTheme(string strThemeName);      // из .mpsystheme / .mpusertheme файлов
    public static void ApplyThemeTo(Control control);       // рекурсивный обход всех контролов
}
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Runtime theme system с файлами тем (`.mpsystheme` для системных, `.mpusertheme` для пользовательских) |
| **Причина** | WinForms не имеет встроенной системы тем. Dark mode — критическая функция для GCS (работа ночью) |
| **Механизм** | `ApplyThemeTo(control)` рекурсивно обходит все дочерние контролы и применяет цвета |

**Покрытие типов контролов** (строки 700-1430):
- Обрабатывает 30+ типов контролов: `TreeView`, `SplitContainer`, `ProgressBarPercent`, `DataGridView`, `QuickView`, `HUD`, `ZedGraphControl`, `BackstageView`, `MyButton`, и т.д.

| Последствие | Влияние |
|-------------|---------|
| ✅ **Dark mode** | Default theme "BurntKermit" — тёмная тема для полевого использования |
| ✅ **User themes** | Пользователь может создать свой .mpusertheme |
| ❌ **Performance** | Рекурсивный обход ВСЕХ контролов при смене темы |
| ❌ **Imperative** | Нет CSS-like declarative theming — каждый новый контрол нужно добавлять в `ApplyThemeTo` |
| ❌ **Static state** | Все цвета — static fields = глобальное состояние |

---

### AD-11: ExtLibs — internal fork monorepo

**Каталог:** `ExtLibs/` — 50+ проектов

| Подпроект | Тип | Target |
|-----------|-----|--------|
| `ArduPilot/` | MAVLink, CurrentState, Firmwares | netstandard2.0 |
| `Comms/` | Serial/TCP/UDP | netstandard2.0 |
| `Interfaces/` | ICommsSerial, etc. | netstandard2.0 |
| `Controls/` | Custom WinForms controls | net472;netstandard2.0 |
| `Utilities/` | Settings, WarningEngine, etc. | netstandard2.0 |
| `GMap.NET.Core/` | Forked map library | netstandard2.0 |
| `GMap.NET.WindowsForms/` | WinForms map control | net472;netstandard2.0 |
| `ZedGraph/` | Forked charting library | net472;netstandard2.0 |
| `SharpKml/` | KML parser | netstandard2.0 |
| `mono/` | Mono compatibility layer | netstandard2.0 |
| `Xamarin/` | Mobile UI experiments | varies |

| Аспект | Описание |
|--------|----------|
| **Решение** | Все внешние зависимости (GMap.NET, ZedGraph, SharpKml и др.) включены как **forked source code** в ExtLibs |
| **Причина** | `[Assumption]` Необходимость кастомизации библиотек под нужды проекта. GMap.NET и ZedGraph дополнены специфичной для MP функциональностью |
| **Масштаб** | 50+ проектов в solution, 150k+ строк |

| Последствие | Влияние |
|-------------|---------|
| ✅ **Full control** | Можно патчить баги и добавлять features в любую библиотеку |
| ✅ **No external deps** | Сборка не зависит от доступности NuGet/upstream |
| ❌ **Maintenance burden** | Форки не обновляются из upstream — накапливается расхождение |
| ❌ **Build time** | 50+ проектов → длительная компиляция |
| ❌ **Circular awareness** | ExtLibs зависят от `MissionPlanner` types через `[InternalsVisibleTo]` (MAVState.cs:18) |

---

### AD-12: log4net — structured logging

**Файл:** `MainV2.cs:6,55`, `Program.cs:2-3`

```csharp
using log4net;
using log4net.Config;
// ...
private static readonly ILog log = LogManager.GetLogger(MethodBase.GetCurrentMethod().DeclaringType);
```

| Аспект | Описание |
|--------|----------|
| **Решение** | log4net для application logging (не telemetry — для этого tlog) |
| **Причина** | Стандарт enterprise .NET logging на момент создания проекта |
| **Использование** | Каждый класс имеет `private static readonly ILog log` — per-class logger |

| Последствие | Влияние |
|-------------|---------|
| ✅ **Standard pattern** | Per-class logger с уровнями (Debug, Info, Error) |
| ✅ **Configurable** | XML-based конфигурация appenders |
| ❌ **Legacy** | log4net не обновляется активно; modern .NET использует `Microsoft.Extensions.Logging` |
| ❌ **No structured data** | `log.InfoFormat("set {0} to {1}", ...)` — string formatting, не structured logging |

---

### AD-13: Plugin + IronPython — dual extensibility

**Файлы:** `Plugin/Plugin.cs:13`, `Script.cs:1-220`

| Механизм | Язык | Lifecycle | API |
|----------|------|-----------|-----|
| **Plugin** | C# (.dll или .cs) | `Init → Loaded → Loop(hz) → Exit` | `PluginHost` — comPort, maps, menus, WPs |
| **IronPython** | Python | Single script execution in thread | Direct access to `MainV2`, `cs`, `MAV`, `FlightPlanner` |

| Аспект | Описание |
|--------|----------|
| **Решение** | Два канала расширения: compiled plugins и interpreted Python scripts |
| **Причина** | Plugins — для сложных интеграций (сторонние сервисы, new UI). Scripts — для quick automation (RC override, mode switching, condition monitoring) |

| Последствие | Влияние |
|-------------|---------|
| ✅ **Rich API** | PluginHost даёт доступ к maps, context menus, WP management |
| ✅ **Runtime scripts** | Python скрипты выполняются без компиляции |
| ❌ **IronPython outdated** | IronPython 2.x — Python 2.7 compatible, не Python 3 |
| ❌ **Security** | Скрипты имеют полный доступ к `MainV2.comPort` — могут ARM/DISARM без ограничений |
| ❌ **No sandboxing** | `Script.cs` не ограничивает IO, сеть, файловую систему — full trust |

---

### AD-14: Thread.Sleep polling loops

**Файлы:** `FlightData.cs:3345-3400`, `MainV2.cs:2500-2900`

```csharp
// FlightData.mainloop() — основной UI update цикл:
while (threadrun) {
    if (giveComport) { Thread.Sleep(50); continue; }
    Thread.Sleep(50);   // fixed 50ms sleep = ~20Hz
    // ... update UI, graphs, maps
}

// MainV2.SerialReader — speech/warning loop:
while (true) {
    Thread.Sleep(50);  // fixed 50ms sleep
    // ... check battery, speed, altitude, data loss
}
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Background threads с `Thread.Sleep()` полинг вместо event-driven или async patterns |
| **Причина** | `[Assumption]` WinForms не поддерживает async/await нативно. Thread.Sleep — простейший способ создать periodic update loop |
| **Использование** | mainloop (50ms), SerialReader (50ms), giveComport wait (50/100ms) |

| Последствие | Влияние |
|-------------|---------|
| ❌ **Wasted CPU** | Thread sleeping = OS scheduler overhead для каждого пробуждения |
| ❌ **Fixed rate** | 50ms sleep ≠ 20Hz точно — зависит от длительности итерации |
| ❌ **No backpressure** | Если итерация > 50ms, цикл замедляется без оповещения |
| ❌ **Not cancellable** | `Thread.Sleep()` нельзя interrupts (кроме `Thread.Interrupt()`) |
| ✅ **Simple** | Нет сложной event infrastructure — "посмотрел, обновил, поспал" |

**Альтернативы (не использованы):**
- `System.Timers.Timer` — event-based periodic execution
- `Task.Delay` + `async/await` — modern async pattern
- `ManualResetEvent.WaitOne(timeout)` — cancellable wait

---

### AD-15: God-objects

**Размеры файлов:**

| Файл | Строк | Роли |
|------|-------|------|
| `MainV2.cs` | 4827 | App lifecycle, connect/disconnect, serial reader, speech, heartbeat, firmware check, UI navigation, joystick, MQTT, device change |
| `FlightData.cs` | 6693 | HUD, map, graphs, actions, log playback, scripts, Quick Views, ADSB overlay, servo control, preflight checklist, transponder |
| `FlightPlanner.cs` | 8557 | Mission editing, map overlays, WP upload/download, geofence, rally points, survey grids, elevation profile, POI, KML import/export |
| `MAVLinkInterface.cs` | 6899 | Packet read/write, params, WPs, commands, calibration, firmware upload, MAVFTP, subscription system, signing |

| Аспект | Описание |
|--------|----------|
| **Решение** | Ключевые модули — монолитные файлы с 5000-8000+ строк, смешивающие UI, data, logic |
| **Причина** | `[Assumption]` Органический рост codebase за 15 лет без систематического рефакторинга. WinForms Designer привязывает весь code-behind к одному partial class |

| Последствие | Влияние |
|-------------|---------|
| ❌ **Невозможно навигировать** | 8557 строк FlightPlanner — невозможно охватить mental model |
| ❌ **Merge conflicts** | Любое изменение flight planning → конфликт с любым другим |
| ❌ **No SRP** | FlightData: HUD + graphs + map + actions + scripts + log playback — 6+ concerns в одном классе |
| ❌ **Untestable** | Невозможно создать instance FlightData/FlightPlanner без полного WinForms environment |

---

### AD-16: Tlog binary logging

**Файлы:** `MainV2.cs:1619-1624`, `MAVLinkInterface.cs` (SaveToTlog)

```csharp
// Tlog creation on connect:
comPort.logfile = new BufferedStream(
    File.Open(Settings.Instance.LogDir + ... + ".tlog", 
              FileMode.CreateNew, FileAccess.ReadWrite, FileShare.Read));

// Raw log:
comPort.rawlogfile = new BufferedStream(
    File.Open(Settings.Instance.LogDir + ... + ".rlog", ...));
```

| Аспект | Описание |
|--------|----------|
| **Решение** | Все MAVLink пакеты записываются в бинарный `.tlog` файл (timestamped raw packets) |
| **Причина** | Полная запись коммуникации для replay и post-flight analysis |
| **Format** | Каждый пакет: `[8-byte timestamp][MAVLink packet bytes]` |

| Последствие | Влияние |
|-------------|---------|
| ✅ **Complete capture** | Вся коммуникация сохранена — можно replay в FlightData |
| ✅ **ArduPilot standard** | `.tlog` — де-факто стандарт в ArduPilot ecosystem |
| ❌ **Large files** | Бинарный поток без сжатия — GB per hour на высоких data rates |
| ❌ **Not queryable** | Нельзя grep/SQL — нужен специальный парсер для анализа |
| ❌ **Dual files** | `.tlog` + `.rlog` — неясное разделение (tlog = processed, rlog = raw with errors) |

---

## 3. Паттерны и Anti-patterns — сводка

### Используемые паттерны

| Паттерн | Реализация | Качество |
|---------|-----------|----------|
| **Singleton** | `Settings.Instance`, `MainV2.instance`, `FlightData.instance` | Overused — creates coupling |
| **Observer** | `SubscribeToPacketType()`, `OnPacketReceived` event | Good — enables decoupling |
| **Strategy** | `ICommsSerial` — transport abstraction | Good — transport-agnostic |
| **Template Method** | `Plugin.Init()/Loaded()/Loop()/Exit()` lifecycle | Good — clear contract |
| **Registry** | `MAVList` — vehicle registry by sysid+compid | Good — multi-vehicle ready |
| **Mediator** | `MainV2` — central controller между views | Overloaded |
| **Lazy Initialization** | `BackstageViewPage.Page` — создаётся при первом доступе | Good |

### Anti-patterns

| Anti-pattern | Пример | Impact |
|--------------|--------|--------|
| **God Object** | `MainV2.cs` (4827), `FlightData.cs` (6693), `FlightPlanner.cs` (8557) | Unmaintainable |
| **Global State** | `MainV2.comPort`, `Settings.config` — static mutable | Untestable |
| **Busy Waiting** | `while (giveComport) Thread.Sleep(100)` | CPU waste |
| **Copy-Paste** | `list1..list20` tuning channels (FlightData.cs:76-135) | DRY violation |
| **Magic Numbers** | Force ARM = `2989.0f`, Force DISARM = `21196.0f` (MAVLinkInterface.cs:2631-2632) | Unreadable |
| **Catch-Swallow** | `catch { }` / `catch (Exception) { }` throughout codebase | Hidden failures |
| **String typing** | `Settings["key"]` — all values untyped strings | Fragile |

---

## 4. Архитектурная эволюция — timeline

**`[Assumption]` Основано на технологическом стеке и code patterns:**

| Период | Технология | Признаки в коде |
|--------|-----------|----------------|
| ~2010-2013 | .NET Framework 3.5-4.0, WinForms, SerialPort | Базовая архитектура: MainV2, FlightData, FlightPlanner, serial-only |
| ~2013-2015 | TCP/UDP добавлены | `ICommsSerial` interface, `TcpSerial`, `UdpSerial` |
| ~2015-2017 | Plugin system, multi-vehicle | `Plugin.cs`, `MAVList`, `MAVState` |
| ~2017-2019 | IronPython scripting, MAVFTP | `Script.cs`, `MAVFtp.cs` |
| ~2019-2021 | .NET 4.7.2, netstandard2.0 для ExtLibs | `net472` target, dual-target projects in ExtLibs |
| ~2021-2023 | Theme engine, Display configuration | `ThemeManager.cs` (1430 строк), `DisplayView` JSON config |
| ~2023+ | Xamarin/UNO experiments | `ExtLibs/Xamarin/`, `ExtLibs/uno/` — partial implementation |

---

## 5. Ключевые выводы

### 5.1 Что работает хорошо

1. **`ICommsSerial` abstraction** — чистое разделение MAVLink от transport
2. **Subscription system** — гибкий Observer для MAVLink пакетов
3. **`MAVList+MAVState` model** — корректная модель multi-vehicle
4. **Plugin lifecycle** — чёткий контракт `Init → Loaded → Loop → Exit`
5. **Theme engine** — полноценная система тем для field operations

### 5.2 Что создаёт основные проблемы

1. **God-objects** — невозможно тестировать, рефакторить и поддерживать монолитные файлы
2. **Static globals** — `MainV2.comPort` пронизывает всю систему, делая невозможным DI
3. **`giveComport`** — хрупкий boolean mutex вместо proper synchronization primitives
4. **Thread.Sleep polling** — неэффективно и не scalable
5. **Untyped Settings** — string-based config без validation и schema

### 5.3 Миграционные возможности

| Аспект | Готовность | Оценка |
|--------|-----------|--------|
| ExtLibs → netstandard2.0 | Высокая | ~70% core проектов уже на netstandard2.0 (ArduPilot, Comms, Utilities, GMap.Core) |
| ICommsSerial → async | Не готово | Нет async API в interface |
| Settings → typed config | Не готово | Нет schema, 100s of string keys |
| MainV2 → DI container | Не готово | Static globals повсюду |
| WinForms → cross-platform UI | Эксперименты | `ExtLibs/Xamarin/`, `ExtLibs/uno/` — незавершены |

---

*Следующий шаг: 06_MODULE_MAP.md*
