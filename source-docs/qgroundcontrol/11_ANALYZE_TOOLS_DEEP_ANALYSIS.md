# Глубокий анализ Analyze Tools / Инструменты диагностики и анализа

Документ построен на reverse-engineering анализе QML/C++ кода раздела Analyze View (~30 файлов). Каждый вывод привязан к конкретному файлу-источнику.

---

## 1. Архитектура Analyze View

### Общая структура

*Источник: `AnalyzeView.qml`, `QGCCorePlugin.cc:63-93`*

```
┌──────────────────────────────────────────────────────────────┐
│                      ANALYZE VIEW                            │
├────────────────┬─────────────────────────────────────────────┤
│                │                                              │
│  LEFT PANEL    │  RIGHT PANEL (panelLoader)                   │
│  ┌──────────┐  │                                              │
│  │●Onboard  │  │  ┌──────────────────────────────────────┐   │
│  │  Logs    │  │  │                                      │   │
│  │○GeoTag   │  │  │   LOADED ANALYZE PAGE                │   │
│  │  Images  │  │  │                                      │   │
│  │●MAVLink  │  │  │   (AnalyzePage-based component)      │   │
│  │  Console │  │  │                                      │   │
│  │●MAVLink  │  │  │   Content + optional header          │   │
│  │  Inspect.│  │  │   + optional Popout button           │   │
│  │●Vibration│  │  │                                      │   │
│  └──────────┘  │  └──────────────────────────────────────┘   │
│                │                                              │
│  ● = Requires  │  "Requires a connected vehicle"             │
│    vehicle     │  (показывается если нет подключения)         │
└────────────────┴─────────────────────────────────────────────┘
```

### Механизм навигации

1. **AnalyzeView** — корневой Rectangle с двумя панелями.
2. **Left Panel** — вертикальная колонка `SubMenuButton`, заполняемая из `QGroundControl.corePlugin.analyzePages` (QVariantList).
3. **Right Panel** — `Loader`, загружающий QML из `modelData.url` выбранной страницы.
4. **Popout** — некоторые страницы (`allowPopout: true`) могут открываться в отдельном плавающем окне через `mainWindow.createWindowedAnalyzePage()`.

### Список страниц (жёстко закодирован)

*Источник: `QGCCorePlugin.cc:63-93`*

| # | Название | QML Source | Требует vehicle | Popout |
|---|---|---|---|---|
| 1 | **Onboard Logs** | `OnboardLogPage.qml` | ✅ Да | ❌ |
| 2 | **GeoTag Images** | `GeoTagPage.qml` | ❌ Нет | ❌ |
| 3 | **MAVLink Console** | `MAVLinkConsolePage.qml` | ✅ Да | ✅ |
| 4 | **MAVLink Inspector** | `MAVLinkInspectorPage.qml` | ✅ Да | ✅ |
| 5 | **Vibration** | `VibrationPage.qml` | ✅ Да | ✅ |

### Base-class: AnalyzePage

*Источник: `AnalyzePage.qml`*

Все страницы наследуют от `AnalyzePage`, который предоставляет:
- `pageComponent` — основное содержимое (Loader)
- `pageDescription` — текстовое описание вверху
- `headerComponent` — опциональный custom header
- `allowPopout` — кнопка "Float" для открытия в отдельном окне
- `availableWidth` / `availableHeight` — доступная область

---

## 2. Onboard Logs — скачивание бортовых логов

*Источник: `OnboardLogPage.qml`, `OnboardLogController.h`, `OnboardLogEntry.h`*

### Назначение
Скачивание **бинарных бортовых логов** (DataFlash `.bin` / ULog `.ulg`) с борта аппарата на компьютер. Логи записываются на SD-карту контроллера полёта во время работы.

### Требования
- ✅ **Требует подключённый аппарат** (`requiresVehicle: true`)
- Аппарат должен быть реальным (не Offline Editing Vehicle)

### UI элементы

#### Таблица логов

| Id | Date | Size | Status | ☐ |
|---|---|---|---|---|
| 1 | 2024-01-15 14:30:00 | 2.3 MB | Pending | ☐ |
| 2 | 2024-01-15 15:00:00 | 5.1 MB | Pending | ☐ |
| 3 | Date Unknown | 1.7 MB | Pending | ☐ |

**Колонки:**
- **Checkbox** — выбор логов для скачивания
- **Id** — порядковый номер лога (`object.id`)
- **Date** — дата/время лога (`object.time`). Если `time.getUTCFullYear() < 2010` → "Date Unknown"
- **Size** — размер файла (`object.sizeStr`)
- **Status** — текущий статус: Pending / Downloading / Downloaded / Error

#### Кнопки управления

| Кнопка | Действие | Условие видимости |
|---|---|---|
| **Refresh** | `OnboardLogController.refresh()` — запрос списка логов | Не в процессе |
| **Download** | Скачать выбранные логи → выбор директории | Выбран хотя бы 1 лог |
| **Erase All** | Удалить ВСЕ логи с борта | `model.count > 0` |
| **Cancel** | Отменить скачивание | В процессе |

### Backend

**OnboardLogController (Singleton):**
- Связь: MAVLink `LOG_ENTRY` / `LOG_DATA` / `LOG_REQUEST_LIST` / `LOG_REQUEST_DATA` / `LOG_ERASE` messages.
- `refresh()` → `_requestLogList(0, 0xFFFF)` → получает список записей.
- `download(path)` → итерирует по выбранным записям → `_requestLogData(id, offset, count)` → бинарный download чанками.
- **Chunk-based download:** `kChunkSize = 2048 * MAVLINK_MSG_LOG_DATA_FIELD_DATA_LEN` (~180KB чанки). Использует `QBitArray` для трекинга полученных пакетов.
- **Rate tracking:** `_updateDataRate()` → отображение скорости download.
- **Compression:** `compressLogFile()` — сжатие скачанных логов.

**OnboardLogEntry:**
- Properties: `id`, `time` (QDateTime), `size` (uint), `sizeStr`, `received` (bool), `selected` (bool), `status` (QString: "Pending").

### Для boat
- ✅ **Важен.** Бортовые логи — основной источник post-mortem анализа. Содержат:
  - GPS-трек
  - Данные навигации (EKF)
  - Значения параметров
  - Ошибки и предупреждения
  - Данные батареи
  - PWM-выходы и RC-входы

### Доступность в SITL
- ⚠️ **Частично.** SITL генерирует DataFlash логи на диске (не на SD-карте). MAVLink `LOG_*` протокол реализован, логи доступны для скачивания, но пользу от них ограничена — sensor данные симулированы.

### Классификация
- 🔧 **Инженерный инструмент.** Требует внешних средств для анализа скачанных файлов (MAVExplorer, UAV Log Viewer, Plot.ardupilot.org).

---

## 3. GeoTag Images — гео-привязка фотографий

*Источник: `GeoTagPage.qml`, `GeoTagController.h`, `ULogParser.h`, `DataFlashParser.h`, `ExifParser.h`*

### Назначение
Привязка **GPS-координат** к аэрофотоснимкам, сделанным во время съёмочной миссии. Использует бортовой лог + метки времени из EXIF фотографий.

### Требования
- ❌ **НЕ требует подключённый аппарат** — работает офлайн с файлами.

### UI — Wizard из 3 шагов + Advanced Options

#### Step 1: Select Flight Log
- **Browse...** → выбор файла `.ulg` (PX4 ULog) или `.bin` (ArduPilot DataFlash)
- Индикатор: зелёный круг с ✓ если файл выбран

#### Step 2: Select Image Folder
- **Browse...** → выбор папки с фотографиями
- Индикатор: зелёный круг с ✓ если папка выбрана

#### Step 3: Output Folder (Optional)
- По умолчанию: `{imageDirectory}/TAGGED`
- Опциональный override

#### Advanced Options:
- **Time Offset (seconds)** — коррекция рассинхронизации часов камеры и бортового лога (-3600...+3600 сек с шагом 0.1)
- **Preview Mode** — режим предпросмотра без записи файлов (для проверки time offset)

#### Action Button:
- **Start Tagging** / **Preview** / **Cancel**
- Enabled только когда выбраны lог и папка

#### Image List:
- Таблица всех изображений с цветовыми статусами:
  - ⬜ Pending (серый, полупрозрачный)
  - 🔵 Processing (синий, мигающий)
  - 🟢 Tagged (зелёный + координаты lat/lon)
  - 🟠 Skipped (оранжевый)
  - 🔴 Failed (красный + error message)
- Итого: "Successfully tagged N images (M skipped, K failed)"

### Backend

**GeoTagController (Singleton):**
- **Async State Machine** с 6 стадиями:
  1. `LoadingImages` — сканирование папки на файлы
  2. `ParsingExif` — параллельное чтение EXIF timestamps (QFutureWatcher)
  3. `ParsingLogs` — парсинг бортового лога
  4. `Calibrating` — match image timestamps → trigger timestamps
  5. `TaggingImages` — параллельная запись координат в EXIF (QFutureWatcher)
  6. `Finished`

**Парсеры:**
- `ULogParser::getTagsFromLog()` — парсит PX4 ULog, ищет `camera_capture` сообщения. Использует `ulog_cpp` библиотеку.
- `DataFlashParser::getTagsFromLog()` — парсит ArduPilot .bin, ищет `CAM` messages с GPS координатами.
- `ExifParser` — чтение/запись EXIF метаданных (timestamp, GPS coords).

**GeoTagData struct:**
```cpp
struct GeoTagData {
    qint64 timestamp;           // Seconds since epoch
    qint64 timestampUTC;        // Seconds since epoch (UTC)
    uint32_t imageSequence;
    QGeoCoordinate coordinate;  // lat/lon/alt
    float groundDistance;
    QQuaternion attitude;       // roll/pitch/yaw
    CaptureResult captureResult; // NoFeedback / Failure / Success
};
```

**Calibration алгоритм:**
- `GeoTagCalibrator::calibrate()` — tolerance-based matching: для каждого timestamp фото ищет ближайший trigger из лога в пределах `toleranceSecs` (по умолчанию 2 сек).

### Для boat
- ⚠️ **Ограниченно применимо.** GeoTag предназначен для аэрофотосъёмки (Survey миссии с камерой). Для лодки:
  - Актуально, если установлена камера и записываются фото по маршруту.
  - Не актуально для чистой навигационной миссии без камеры.

### Доступность в SITL
- ⚠️ **Офлайн-инструмент.** Работает без подключения. Но в SITL нет реальных фотографий и camera_capture events. Можно протестировать UI с тестовыми файлами.

### Классификация
- 🔧 **Инженерный инструмент.** Специфичен для фотограмметрии / aerial survey.

---

## 4. MAVLink Console — системная консоль

*Источник: `MAVLinkConsolePage.qml`, `MAVLinkConsoleController.h`*

### Назначение
Прямой терминальный доступ к **NuttX Shell (nsh>)** контроллера полёта. Позволяет выполнять системные команды на борту.

### Требования
- ✅ **Требует подключённый аппарат** (`requiresVehicle: true`)

### UI

```
┌──────────────────────────────────────────────────────────────┐
│  Provides a connection to the vehicle's system shell.  [🔲]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  nsh> help                                                   │
│  Available commands:                                         │
│    param show  - Show parameters                             │
│    status      - System status                               │
│    top         - CPU usage                                   │
│    dmesg       - Kernel messages                             │
│    ...                                                       │
│                                                              │
│  nsh> status                                                 │
│  Board: fmuk66v3                                             │
│  FW ver: v1.14.0                                             │
│  ...                                                         │
│                                                              │
│  > _                                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
  [Mobile: Enter Commands here...          ] [Send]
```

**Элементы:**
- **TextArea** (richText) — вывод консоли с цветовым форматированием ANSI.
  - Моноширинный шрифт (`fixedFontFamily`).
  - Read-only до позиции `_consoleOutputLen` (нельзя редактировать историю вывода).
  - Ввод команд — после `_consoleOutputLen` (на текущей строке).
- **Command History** — навигация по истории команд: ↑/↓ (до 100 записей).
- **Clipboard Paste** — поддержка вставки multi-line (каждая строка кроме последней отправляется как команда).
- **Mobile Input** — отдельное поле `QGCTextField` + кнопка "Send" (для мобильных платформ).
- **Float/Popout** — кнопка открытия в отдельном окне.

### Backend

**MAVLinkConsoleController (QStringListModel):**
- Протокол: MAVLink `SERIAL_CONTROL` сообщения.
  - `_sendSerialData(data)` → `SERIAL_CONTROL` с `SERIAL_CONTROL_DEV_SHELL` device.
  - `_receiveData(device, flags, timeout, baudrate, data)` → приём ответов.
- **ANSI processing:** `_processANSItext()` — парсит escape-последовательности для цветов, позиционирования курсора.
- **History:** `CommandHistory` класс с `up()/down()` навигацией.
- **Buffer:** `kMaxNumLines = 500` — максимум строк в буфере (ограничение CPU load).

### Полезные команды для boat (ArduPilot/PX4)

| Команда | Что делает | Применимость |
|---|---|---|
| `status` | Общий статус системы | ✅ Диагностика |
| `param show CRUISE_*` | Показать навигационные параметры | ✅ Проверка настроек |
| `param set CRUISE_SPEED 2.5` | Установить крейсерскую скорость | ✅ Быстрая настройка |
| `top` | Загрузка CPU по задачам | 🔧 Отладка производительности |
| `dmesg` | Системные сообщения ядра | 🔧 Диагностика ошибок |
| `listener sensor_combined` | Данные датчиков в реальном времени | 🔧 Проверка сенсоров |
| `perf` | Performance counters | 🔧 Профилирование |
| `mavlink status` | Статус MAVLink подключений | ✅ Проверка связи |
| `gps status` | Статус GPS | ✅ Навигация |
| `reboot` | Перезагрузка контроллера | ⚠️ Осторожно |

### Для boat
- ✅ **Полезен для диагностики и отладки.** Позволяет:
  - Проверить состояние системы без разборки лодки.
  - Быстро изменить параметры без UI.
  - Прочитать hardware ID, firmware version.
  - Диагностировать проблемы связи / GPS / датчиков.

### Доступность в SITL
- ✅ **Полностью работает.** SITL предоставляет NuttX shell через SERIAL_CONTROL. Все команды доступны (хотя sensor данные симулированы).

### Классификация
- 🔧 **Инженерный инструмент.** Требует знания команд NuttX/ArduPilot. Не для операторов.

---

## 5. MAVLink Inspector — инспектор MAVLink сообщений

*Источник: `MAVLinkInspectorPage.qml`, `MAVLinkInspectorController.h`, `MAVLinkMessage.h`, `MAVLinkMessageField.h`, `MAVLinkSystem.h`, `MAVLinkChart.qml`, `MAVLinkChartController.h`*

### Назначение
**Real-time визуализация** всех MAVLink сообщений, поступающих от аппарата. Позволяет просматривать содержимое каждого сообщения, его частоту, и строить графики полей.

### Требования
- ✅ **Требует подключённый аппарат** (`requiresVehicle: true`)

### UI структура

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Inspect real time MAVLink messages.          [System ▾] [CompID ▾]    │
├───────────────┬─────────────────────────────────────────────────────────┤
│               │                                                         │
│ HEARTBEAT  1Hz│ Message: ATTITUDE (30)                                  │
│ SYS_STATUS 1Hz│ Component: 1                                            │
│ ATTITUDE  25Hz│ Count: 12847                                            │
│ GPS_RAW   5Hz │ Actual Rate: 25.0 Hz                                    │
│ GLOBAL_POS 5Hz│ Set Rate: [Default ▾]                                   │
│ *RC_CHANNELS*3│                                                         │
│ SERVO_OUT  4Hz│ Name          Value       Type     Plot1  Plot2         │
│ BATTERY    1Hz│ ─────────────────────────────────────────────            │
│ VFR_HUD    4Hz│ time_boot_ms  123456789   uint32_t  ☐      ☐           │
│ NAV_CTRL   1Hz│ roll          0.0523      float     ☑      ☐           │
│ MISSION_CUR1Hz│ pitch         -0.0012     float     ☑      ☐           │
│ STATUSTEXT ..│ yaw           1.5740      float     ☐      ☑           │
│ ...           │ rollspeed     0.001       float     ☐      ☐           │
│               │ pitchspeed    -0.002      float     ☐      ☐           │
│               │ yawspeed      0.000       float     ☐      ☑           │
│               │                                                         │
│               │ ┌── Chart 1 ──── Scale: [5 sec ▾] Range: [Auto ▾] ──┐  │
│               │ │  roll ──── pitch ────                               │  │
│               │ │  ╱╲    ╱╲    ╱╲    ╱╲                              │  │
│               │ │ ╱  ╲  ╱  ╲  ╱  ╲  ╱  ╲                            │  │
│               │ │╱    ╲╱    ╲╱    ╲╱    ╲                             │  │
│               │ └────────────────────────────── mm:ss.zzz ───────────┘  │
│               │ ┌── Chart 2 ──── Scale: [5 sec ▾] Range: [Auto ▾] ──┐  │
│               │ │  yaw ──── yawspeed ────                             │  │
│               │ │  ╱╲    ╱╲    ╱╲    ╱╲                              │  │
│               │ └────────────────────────────── mm:ss.zzz ───────────┘  │
└───────────────┴─────────────────────────────────────────────────────────┘
```

### UI элементы

#### Left Panel — Message List
- **Repeater** по `curSystem.messages` — кнопки с именем сообщения, частотой (Hz), и индикатором `*` если у сообщения выбрано поле для графика.
- **Filter:** по Component ID (`cidCombo`: "All" + конкретные compID).
- **Multi-system:** если несколько систем (GCS + Vehicle + Gimbal), показывается `systemCombo`.

#### Right Panel — Message Details
- **Header info:** Message name (ID), Component ID, Count, Actual Rate (Hz).
- **Set Rate:** ComboBox для изменения частоты стриминга (Disabled / Default / 1-100Hz) → `controller.setMessageInterval(rate)`.
- **Field Table:** 5 колонок: Name, Value (real-time), Type (uint8/int16/float/etc.), Plot 1 (checkbox), Plot 2 (checkbox).
- **Charts:** 2 одновременных графика (`MAVLinkChart`), каждый поддерживает до 6 серий.

#### MAVLinkChart
*Источник: `MAVLinkChart.qml`, `MAVLinkChartController.h`*

- Построен на `QtCharts.ChartView` с `DateTimeAxis` (X) и `ValueAxis` (Y).
- **Scale:** настраиваемый time range (5 сек, 10 сек, 30 сек, 1 мин, 5 мин, 10 мин).
- **Range:** Auto Range (автоматический Y-масштаб) или фиксированные значения.
- **Цвета серий:** `["#00E04B", "#DE8500", "#F32836", "#BFBFBF", "#536DFF", "#EECC44"]`.
- **Обновление:** 15 Hz (`kUpdateFrequency = 1000/15`).
- **OpenGL:** использует `serie.useOpenGL` если доступен GStreamer (оптимизация).

### Backend

**MAVLinkInspectorController:**
- `_receiveMessage(link, message)` — перехватывает **все** MAVLink сообщения через `MAVLinkProtocol`.
- Организует данные по системам (`QGCMAVLinkSystem`) → сообщениям (`QGCMAVLinkMessage`) → полям (`QGCMAVLinkMessageField`).
- `_refreshFrequency()` — таймерный пересчёт actualRateHz для каждого сообщения.
- `setMessageInterval(rate)` → `MAV_CMD_SET_MESSAGE_INTERVAL` — управление частотой стриминга конкретного сообщения.

**QGCMAVLinkMessage:**
- Хранит последнее значение `mavlink_message_t`.
- `update(message)` → декодирует все поля через `mavlink_message_type_info` → обновляет `QGCMAVLinkMessageField`.
- `updateFreq()` → вычисляет actualRateHz из `count / elapsed_time`.

**QGCMAVLinkMessageField:**
- `updateValue(newValue, v)` → обновляет строковое значение и числовое для графика.
- `addSeries(chartController, series)` → привязывает к ChartView series для построения графика.
- `values()` → `QList<QPointF>` — точки данных для графика.
- `rangeMin/rangeMax` — автоматически обновляемый диапазон Y.

### Ключевые MAVLink сообщения для boat

| Сообщение | Поля | Частота | Значение для boat |
|---|---|---|---|
| **HEARTBEAT** | base_mode, custom_mode, system_status | 1 Hz | ✅ Статус и режим |
| **SYS_STATUS** | voltage, current, battery_remaining | 1 Hz | ✅ Батарея |
| **GPS_RAW_INT** | lat, lon, alt, fix_type, satellites_visible | 5 Hz | ✅ GPS качество |
| **GLOBAL_POSITION_INT** | lat, lon, alt, relative_alt, vx, vy, vz, hdg | 5 Hz | ✅ Позиция и скорость |
| **ATTITUDE** | roll, pitch, yaw, rollspeed, pitchspeed, yawspeed | 25 Hz | ✅ Ориентация (крен, дифферент, курс) |
| **VFR_HUD** | airspeed, groundspeed, heading, throttle, alt, climb | 4 Hz | ✅ Основная навигация |
| **NAV_CONTROLLER_OUTPUT** | nav_roll, nav_pitch, nav_bearing, target_bearing, wp_dist | 1 Hz | ✅ Навигационный контроллер |
| **SERVO_OUTPUT_RAW** | servo1-16 raw PWM | 4 Hz | ✅ Выходы моторов/рулей |
| **RC_CHANNELS** | chan1-18 PWM | 3 Hz | ⚠️ RC входы (если пульт) |
| **BATTERY_STATUS** | voltages[], current, remaining, temperature | 1 Hz | ✅ Детализация батареи |
| **MISSION_CURRENT** | seq | 1 Hz | ✅ Текущий waypoint |
| **STATUSTEXT** | severity, text | event | ✅ Системные сообщения |
| **FENCE_STATUS** | breach_status, breach_count, breach_type | event | ✅ Нарушение геозоны |

### Для boat
- ✅ **Критичен для отладки и мониторинга.** MAVLink Inspector — единственный инструмент для:
  - Просмотра **всех** данных, передаваемых аппаратом.
  - Графиков навигационных параметров в реальном времени (roll, yaw, ground speed).
  - Диагностики проблем связи (частота сообщений, пропущенные пакеты).
  - Управления стримингом (увеличить частоту GPS до 10Hz для точной навигации).

### Доступность в SITL
- ✅ **Полностью работает.** SITL генерирует все стандартные MAVLink сообщения. Графики обновляются в реальном времени.

### Классификация
- 🔧/👷 **Гибридный инструмент.** Инженерный для глубокой диагностики, но операторский для мониторинга ключевых параметров (GPS, батарея, heading).

---

## 6. Vibration — анализ вибраций

*Источник: `VibrationPage.qml`*

### Назначение
Визуализация уровня **вибраций** акселерометра по 3 осям (X, Y, Z) и счётчиков клиппинга.

### Требования
- ✅ **Требует подключённый аппарат** (`requiresVehicle: true`)
- Данные доступны только если `!isNaN(_activeVehicle.vibration.xAxis.rawValue)`

### UI элементы

```
┌────────────────────────────────────────────────────┐
│  Analyze vibration associated with your vehicle.   │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌────┐  ┌────┐  ┌────┐    Clip count             │
│  │    │  │    │  │    │                             │
│  │    │  │    │  │    │    Accel 1: 0               │
│  │ ── │  │ ── │  │ ── │    Accel 2: 0               │
│  │    │  │    │  │    │    Accel 3: 0               │
│  │ ── │  │ ── │  │ ── │                             │
│  │████│  │██  │  │███ │                             │
│  │████│  │██  │  │███ │                             │
│  └────┘  └────┘  └────┘                            │
│  X (12)   Y (8)  Z (15)                            │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Элементы:**
- **3 вертикальных бара** — уровень вибрации по осям X, Y, Z.
  - Шкала: 0..90.
  - Линия `30` — предупреждение (mid vibe).
  - Линия `60` — критично (bad vibe), красная.
  - Заливка пропорциональна значению.
- **Подписи:** "X (12)" — ось и текущее значение.
- **Clip Count:** счётчики клиппинга для 3 акселерометров. Клиппинг = сигнал вышел за диапазон датчика.
- **"Not Available"** overlay — показывается если данные вибрации недоступны (NaN).

### Backend
- Данные из `_activeVehicle.vibration` FactGroup:
  - `vibration.xAxis.rawValue` — вибрация по X (float).
  - `vibration.yAxis.rawValue` — вибрация по Y.
  - `vibration.zAxis.rawValue` — вибрация по Z.
  - `vibration.clipCount1/2/3.rawValue` — клиппинг акселерометров.
- Данные поступают из MAVLink `VIBRATION` (#241) сообщения.

### Для boat
- ⚠️ **Умеренно полезен.** Для лодки:
  - Вибрации могут указывать на дисбаланс двигателя, кавитацию винта, незакреплённые элементы.
  - Значения >30 = стоит проверить крепление.
  - Значения >60 = проблема, может влиять на GPS/компас.
  - Clip count >0 = серьёзная проблема крепления.

### Доступность в SITL
- ⚠️ **Ограниченно.** SITL обычно генерирует нулевые (или очень низкие) значения вибрации. Полезно только для проверки работоспособности UI.

### Классификация
- 🔧 **Инженерный инструмент.** Для диагностики проблем крепления и балансировки.

---

## 7. Log Replay — воспроизведение телеметрии

*Источник: `LogReplayLink.h`, `LogReplayLinkController.h`*

### Назначение
Воспроизведение ранее записанных **MAVLink telemetry log (.tlog)** файлов. Не входит в Analyze View, но является критическим инструментом анализа.

### Механизм

**Telemetry Logging (.tlog):**
- Автоматически записывается при подключении к аппарату (если `MavlinkSettings.telemetrySave = true`).
- Условия записи:
  - `telemetrySave` включён
  - Аппарат хотя бы раз был armed (`_vehicleWasArmed`) **ИЛИ** `telemetrySaveNotArmed = true`
- Путь сохранения: `AppSettings.telemetrySavePath` (обычно `~/Documents/QGroundControl/Telemetry`)
- Формат: binary MAVLink frames с timestamps (quint64 timestamp + raw mavlink bytes).

**LogReplayLink:**
- Создаётся через Comm Links → Add → Log Replay.
- `LogReplayConfiguration` хранит путь к `.tlog` файлу.
- `LogReplayWorker` воспроизводит файл в отдельном потоке:
  - `_readNextLogEntry()` → парсит timestamp + MAVLink frame → emit `dataReceived()`.
  - Поддержка `play()`, `pause()`, `setPlaybackSpeed(speed)`, `movePlayhead(percent)`.
  - Все сообщения из лога инжектируются в систему как если бы пришли от реального аппарата.

**LogReplayLinkController (QML):**
- `isPlaying` — статус воспроизведения.
- `percentComplete` — прогресс (0..100).
- `totalTime` — общая длительность лога (MM:SS).
- `playheadTime` — текущая позиция (MM:SS).
- `playbackSpeed` — скорость (0.1x...10x).

### Для boat
- ✅ **Очень полезен.** Позволяет:
  - Воспроизвести миссию лодки без подключения к реальному аппарату.
  - Анализировать навигационный трек, ошибки, failsafe events.
  - Проверить поведение GCS UI при различных сценариях.
  - Обучать операторов на записанных данных.

### Доступность в SITL
- ✅ **Полностью.** SITL сессии записываются в .tlog и могут быть воспроизведены.

### Классификация
- 👷/🔧 **Операторский + Инженерный.** Операторы могут использовать для review миссий. Инженеры — для глубокого анализа.

---

## 8. Сводная таблица Analyze Tools

| Инструмент | Тип | Требует Vehicle | Popout | Real-time | Post-mission | SITL | Boat |
|---|---|---|---|---|---|---|---|
| **Onboard Logs** | 🔧 Инженерный | ✅ | ❌ | ❌ | ✅ | ⚠️ | ✅ Важен |
| **GeoTag Images** | 🔧 Инженерный | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ С камерой |
| **MAVLink Console** | 🔧 Инженерный | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ Полезен |
| **MAVLink Inspector** | 🔧👷 Гибрид | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ Критичен |
| **Vibration** | 🔧 Инженерный | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ Полезен |
| **Log Replay** | 👷🔧 Гибрид | ❌* | N/A | ✅** | ✅ | ✅ | ✅ Очень полезен |

`*` Log Replay создаёт виртуальное подключение  
`**` Log Replay воспроизводит данные как real-time

---

## 9. Классификация: Инженерные vs Операторские

### Инженерные (Engineering / Developer)

| Инструмент | Что делает инженер | Примеры задач |
|---|---|---|
| **MAVLink Console** | Отладка на уровне shell | `param show`, `top`, `dmesg`, `gps status` |
| **Onboard Logs** | Скачивание DataFlash для внешнего анализа | Post-crash analysis, PID tuning, EKF review |
| **GeoTag Images** | Привязка координат к фото для фотограмметрии | Ортофотопланы, 3D-модели |
| **Vibration** | Диагностика механических проблем | Балансировка двигателя, крепление flight controller |

### Операторские (Operator / Mission)

| Инструмент | Что делает оператор | Примеры задач |
|---|---|---|
| **MAVLink Inspector** | Мониторинг ключевых параметров | Скорость, GPS fix, батарея, heading |
| **Log Replay** | Просмотр записей миссий | Review маршрута, анализ инцидентов |

### Гибридные

| Инструмент | Кто и когда |
|---|---|
| **MAVLink Inspector** | Оператор → мониторинг. Инженер → глубокий анализ протокола. |
| **Log Replay** | Оператор → review. Инженер → отладка поведения. |

---

## 10. Сценарии использования для boat

### Сценарий 1: Предполётная диагностика (Pre-Mission)

**Инструменты:** MAVLink Inspector, MAVLink Console

| Шаг | Действие | Инструмент |
|---|---|---|
| 1 | Подключить лодку | Comm Links |
| 2 | Проверить GPS fix | MAVLink Inspector → `GPS_RAW_INT.fix_type` (≥3 = 3D Fix) |
| 3 | Проверить количество спутников | MAVLink Inspector → `GPS_RAW_INT.satellites_visible` (≥8) |
| 4 | Проверить напряжение батареи | MAVLink Inspector → `SYS_STATUS.voltage_battery` |
| 5 | Проверить режим | MAVLink Inspector → `HEARTBEAT.custom_mode` |
| 6 | Проверить EKF | MAVLink Console → `ekf status` |
| 7 | Проверить Motor outputs | MAVLink Inspector → `SERVO_OUTPUT_RAW.servo1..4` |

### Сценарий 2: Мониторинг во время миссии (In-Mission)

**Инструменты:** MAVLink Inspector (Popout!)

| Шаг | Действие | Что мониторить |
|---|---|---|
| 1 | Открыть Inspector в Popout-окне | `GLOBAL_POSITION_INT` — позиция |
| 2 | Построить график heading | `VFR_HUD.heading` → Plot 1 |
| 3 | Построить график скорости | `VFR_HUD.groundspeed` → Plot 2 |
| 4 | Следить за батареей | `SYS_STATUS.battery_remaining` |
| 5 | Следить за дистанцией до WP | `NAV_CONTROLLER_OUTPUT.wp_dist` |
| 6 | Отслеживать STATUSTEXT | Сообщения об ошибках и предупреждениях |
| 7 | Контролировать PWM выходов | `SERVO_OUTPUT_RAW` — проверить работу моторов |

### Сценарий 3: Post-mission анализ

**Инструменты:** Onboard Logs, Log Replay

| Шаг | Действие | Инструмент |
|---|---|---|
| 1 | Скачать бортовой лог | Onboard Logs → Select → Download |
| 2 | Воспроизвести .tlog | Comm Links → Log Replay → выбрать файл |
| 3 | Анализировать маршрут на карте | FlyView при Log Replay |
| 4 | Проверить отклонения от маршрута | MAVLink Inspector → `NAV_CONTROLLER_OUTPUT.xtrack_error` |
| 5 | Проверить PID-ответы | Внешний анализатор (MAVExplorer) + DataFlash лог |
| 6 | Анализировать расход батареи | MAVLink Inspector → `BATTERY_STATUS` график за всю миссию |

### Сценарий 4: Отладка проблемы (Troubleshooting)

**Инструменты:** MAVLink Console, MAVLink Inspector, Vibration

| Проблема | Что проверить | Инструмент |
|---|---|---|
| "Лодка не держит курс" | Yaw PID, compass health | Inspector → `ATTITUDE.yaw`, Console → `compass status` |
| "Лодка дёргается" | Вибрации, PWM output | Vibration → X/Y/Z bars, Inspector → `SERVO_OUTPUT_RAW` |
| "Медленно движется" | Throttle output, CRUISE_SPEED | Inspector → `VFR_HUD.throttle`, Console → `param show CRUISE_*` |
| "Потеря GPS" | GPS fix type, sat count | Inspector → `GPS_RAW_INT`, Console → `gps status` |
| "Failsafe triggered" | System status, STATUSTEXT | Inspector → `HEARTBEAT.system_status`, STATUSTEXT messages |
| "Батарея быстро садится" | Current draw, motor load | Inspector → `BATTERY_STATUS.current_battery`, graph |

### Сценарий 5: GeoTag для лодки с камерой

**Инструменты:** GeoTag Images

| Шаг | Действие |
|---|---|
| 1 | Выполнить survey-миссию с camera trigger |
| 2 | Скачать DataFlash лог (`.bin`) с борта |
| 3 | Скопировать фотографии с SD-карты камеры |
| 4 | Analyze → GeoTag Images |
| 5 | Step 1: Browse → выбрать `.bin` лог |
| 6 | Step 2: Browse → выбрать папку с фото |
| 7 | Preview → проверить time offset |
| 8 | Start Tagging → получить фото с координатами |

---

## 11. Что стоит тестировать в SITL

### Тест 1: MAVLink Inspector — базовый

- [ ] Подключить SITL Rover/Boat
- [ ] Открыть Analyze → MAVLink Inspector
- [ ] Убедиться, что левая панель содержит сообщения (HEARTBEAT, ATTITUDE, GPS_RAW_INT, etc.)
- [ ] Кликнуть HEARTBEAT → в правой панели видны поля: type, autopilot, base_mode, custom_mode...
- [ ] Проверить Actual Rate ≈ 1Hz
- [ ] Кликнуть ATTITUDE → Actual Rate ≈ 25Hz
- [ ] Отметить `roll` в Plot 1 → появляется Chart 1 с графиком
- [ ] Отметить `pitch` в Plot 1 → добавляется вторая серия
- [ ] Отметить `yaw` в Plot 2 → появляется Chart 2
- [ ] Изменить Scale на "30 sec" → масштаб временной оси расширяется
- [ ] Изменить Set Rate для ATTITUDE на "5Hz" → Actual Rate падает до ≈5Hz

### Тест 2: MAVLink Inspector — multi-system

- [ ] Убедиться, что System ComboBox показывает ID 1 (Vehicle) и ID 255 (GCS)
- [ ] Переключить на GCS → видны GCS HEARTBEAT и другие сообщения
- [ ] Вернуть на Vehicle

### Тест 3: MAVLink Console

- [ ] Открыть Analyze → MAVLink Console
- [ ] Ввести `help` → увидеть список доступных команд
- [ ] Ввести `status` → увидеть статус системы
- [ ] Ввести `param show CRUISE_SPEED` → увидеть значение параметра
- [ ] Ввести `param set CRUISE_SPEED 3` → проверить изменение в Parameters
- [ ] Проверить history: нажать ↑ → вернуться к предыдущей команде
- [ ] Проверить Popout: кликнуть Float → консоль открывается в отдельном окне

### Тест 4: Onboard Logs

- [ ] Открыть Analyze → Onboard Logs
- [ ] Нажать Refresh → список логов загружается
- [ ] Если логи есть — отметить один → Download → выбрать директорию → скачать
- [ ] Проверить Cancel → скачивание прерывается
- [ ] Проверить Erase All → подтверждение → логи удалены → Refresh → пустой список

### Тест 5: Vibration

- [ ] Открыть Analyze → Vibration
- [ ] **SITL:** убедиться что бары практически на нуле (нет реальных вибраций)
- [ ] Clip Count = 0 для всех акселерометров
- [ ] Если данные недоступны → видна надпись "Not Available"

### Тест 6: GeoTag (офлайн)

- [ ] Отключить аппарат
- [ ] Открыть Analyze → GeoTag Images (не требует подключения)
- [ ] Step 1: Browse → выбрать тестовый .bin файл → зелёный индикатор
- [ ] Step 2: Browse → выбрать папку с тестовыми фото → зелёный индикатор
- [ ] Preview mode → Preview → проверить результат без записи

### Тест 7: Log Replay

- [ ] Запустить SITL миссию → выполнить → отключить
- [ ] Найти записанный .tlog файл в `~/Documents/QGroundControl/Telemetry/`
- [ ] Comm Links → Add → Log Replay → выбрать файл → Connect
- [ ] Убедиться: FlyView показывает позицию аппарата, карта обновляется
- [ ] Проверить Play/Pause → воспроизведение останавливается/продолжается
- [ ] Проверить Playback Speed → изменить на 2x → ускорение
- [ ] Проверить перемотку → перетащить Playhead → позиция меняется
- [ ] Открыть MAVLink Inspector → данные обновляются из replay

### Тест 8: Telemetry Save Settings

- [ ] Settings → MAVLink → Telemetry Save = ON
- [ ] Подключить SITL → выполнить Arm/Disarm
- [ ] Проверить: .tlog файл создан в `telemetrySavePath`
- [ ] Settings → MAVLink → Telemetry Save Not Armed = ON
- [ ] Подключить SITL без Arm → .tlog всё равно записывается

---

## 12. Архитектурные наблюдения для новой системы

### Что перенести (Keep)

| Компонент | Почему | Адаптация |
|---|---|---|
| **MAVLink Inspector** | Уникальный инструмент low-level диагностики | → WebSocket-based message stream + Chart.js/D3.js |
| **Log Replay** | Критичен для post-mortem | → Cloud-based: загрузить .tlog в cloud → replay через API |
| **Onboard Logs** | Единственный способ получить DataFlash | → Edge Gateway: автоматический upload логов при подключении к WiFi |
| **Console** | Незаменим для shell-доступа | → Web Terminal (xterm.js) через WebSocket proxy |

### Что адаптировать (Adapt)

| Компонент | Текущее | Предложение |
|---|---|---|
| **Vibration** | 3 бара + clip count | → Dashboard widget с history chart + threshold alerts |
| **GeoTag** | Desktop-only, manual workflow | → Автоматический pipeline: upload log + photos → cloud processing → delivery |
| **Charts** | QtCharts, до 6 серий, 15Hz | → Grafana-style dashboards с persistent queries |
| **Message Rate Control** | Per-message `SET_MESSAGE_INTERVAL` | → Edge Gateway: конфигурируемые stream profiles (Navigation / Debug / Minimal) |

### Что добавить (New)

| Инструмент | Назначение | Приоритет |
|---|---|---|
| **Mission Review** | Сравнение запланированного и фактического маршрута | ✅ Высокий |
| **Battery Analytics** | Графики расхода, прогноз оставшегося заряда/времени | ✅ Высокий |
| **Communication Quality** | Link budget, packet loss, latency history | ✅ Высокий |
| **Event Log** | Searchable log: ARM/DISARM/MODE/FAILSAFE/FENCE events | ✅ Высокий |
| **Parameter Diff** | Сравнение текущих параметров с базовыми/предыдущими | ⚠️ Средний |
| **Automated Reports** | PDF/HTML отчёт по миссии: маршрут, батарея, ошибки | ⚠️ Средний |
| **Environmental Data** | Температура воды, глубина, течения (через custom sensors) | ⚠️ Boat-specific |
