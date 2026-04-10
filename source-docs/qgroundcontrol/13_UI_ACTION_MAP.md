# Карта UI-действий пользователя (UI Action Map)

Reverse-engineering связей: UI-элемент → вызов → backend-логика.
Построено на анализе `.qml`, `.cc`, `.h`, `.json` файлов в `src/`.

---

## Навигация верхнего уровня

| # | Элемент | Файл | Что делает | Логика | Доступность | Комментарий |
|---|---|---|---|---|---|---|
| 0.1 | **QGC Logo** (верхний левый) | `SelectViewDropdown.qml` | Открывает меню выбора View (Fly/Plan/Setup/Analyze/Settings) | `mainWindow.showToolSelectDialog()` | Всегда | Главная точка навигации |
| 0.2 | **View Selector → Fly** | `MainRootWindow.qml` | Переключение на Fly View | `_root.showFlyView()` | Всегда | |
| 0.3 | **View Selector → Plan** | `MainRootWindow.qml` | Переключение на Plan View | `_root.showPlanView()` | Всегда | |
| 0.4 | **View Selector → Setup** | `MainRootWindow.qml` | Переключение на Vehicle Config | `_root.showSetupView()` | При подключённом vehicle | |
| 0.5 | **View Selector → Analyze** | `MainRootWindow.qml` | Переключение на Analyze Tools | `_root.showAnalyzeView()` | Всегда | |
| 0.6 | **View Selector → Settings** | `MainRootWindow.qml` | Переключение на Application Settings | `_root.showSettingsView()` | Всегда | |

---

## 1. Fly View — Toolbar

*Источник: `FlyViewToolBar.qml`, `FlyViewToolBarIndicators.qml`, `MainStatusIndicator.qml`*

### 1.1 Main Status Indicator (левая часть toolbar)

| # | Элемент | Файл | Что делает | Логика | Доступность | Boat? |
|---|---|---|---|---|---|---|
| 1.1.1 | **Status Label** ("Ready"/"Armed"/"Flying"/"Not Ready"/"Comms Lost") | `MainStatusIndicator.qml:45-108` | Показывает состояние + открывает Drawer при нажатии | `mainWindow.showIndicatorDrawer(overallStatusIndicatorPage)` | Всегда | ✅ "Flying" показывается для armed+active Rover |
| 1.1.2 | **Arm/Disarm** (в drawer) | `MainStatusIndicator.qml:191-207` | QGCDelayButton для ARM/DISARM аппарата | `_activeVehicle.armed = true/false` или `_activeVehicle.forceArm()` | При подключённом vehicle | ✅ |
| 1.1.3 | **Force Arm checkbox** (в expanded drawer) | `MainStatusIndicator.qml:394-399` | Включает режим Force Arm (обход pre-arm checks) | `_allowForceArm = true` → `_activeVehicle.forceArm()` | Когда disarmed | ⚠️ Опасно |
| 1.1.4 | **Vehicle Messages** (иконка) | `MainStatusIndicator.qml:110-133` | Индикатор сообщений от vehicle (оранжевый = warning, красный = error) | `_activeVehicle.messageCount > 0` | При наличии сообщений | ✅ |
| 1.1.5 | **Sensor Status** (в drawer) | `MainStatusIndicator.qml:257-278` | Показывает состояние датчиков из SYS_STATUS | `_activeVehicle.sysStatusSensorInfo` | Когда нет HealthAndArmingChecks | ✅ |
| 1.1.6 | **HealthAndArmingCheck** (в drawer) | `MainStatusIndicator.qml:280-290` | Список проблем для текущего режима | `_activeVehicle.healthAndArmingCheckReport.problemsForCurrentMode` | На новых прошивках | ✅ |
| 1.1.7 | **Primary Link selector** | `MainStatusIndicator.qml:210-239` | Выбор основного канала связи | `_activeVehicle.vehicleLinkManager.primaryLinkName = ...` | Когда > 1 link | ⚠️ Multi-link |
| 1.1.8 | **Vehicle Parameters** (в expanded) | `MainStatusIndicator.qml:412-418` | Быстрый переход в Parameters | `mainWindow.showVehicleConfigParametersPage()` | Advanced UI | ✅ |
| 1.1.9 | **Vehicle Configuration** (в expanded) | `MainStatusIndicator.qml:421-428` | Быстрый переход в Setup | `mainWindow.showVehicleConfig()` | Advanced UI | ✅ |

### 1.2 Flight Mode Indicator (центр toolbar)

| # | Элемент | Файл | Что делает | Логика | Доступность | Boat? |
|---|---|---|---|---|---|---|
| 1.2.1 | **Flight Mode Label** ("Manual", "Auto", etc.) | `FlightModeIndicator.qml:42-47` | Показывает текущий режим | `activeVehicle.flightMode` | Всегда | ✅ |
| 1.2.2 | **Mode Drawer → Mode Buttons** | `FlightModeIndicator.qml:148-190` | QGCDelayButton для переключения режима | `activeVehicle.flightMode = modelData` → `Vehicle::setFlightMode()` → `MAV_CMD_DO_SET_MODE` | При подключённом vehicle | ✅ 13 режимов |
| 1.2.3 | **Mode Drawer → VTOL Transition** | `FlightModeIndicator.qml:137-146` | Переход Multi-Rotor ↔ Fixed Wing | `_activeVehicle.vtolInFwdFlight = !_vtolInFWDFlight` | Только VTOL в воздухе | ❌ Не для boat |
| 1.2.4 | **Edit Displayed Modes** (expanded) | `FlightModeIndicator.qml:241-244` | Включение edit mode для скрытия ненужных режимов | `control.editMode = checked` | В expanded drawer | ✅ Полезно |
| 1.2.5 | **Mode Change Confirmation** (expanded) | `FlightModeIndicator.qml:227-231` | Toggle: нужно ли удерживать кнопку | `flightModeSettings.requireModeChangeConfirmation` | В expanded drawer | ✅ |
| 1.2.6 | **Configure Flight Modes** (expanded) | `FlightModeIndicator.qml:247-258` | Переход в Setup → Flight Modes | `mainWindow.showKnownVehicleComponentConfigPage(FlightModes)` | Advanced UI + vehicle | ✅ |

### 1.3 Toolbar Indicators (правая часть)

*Источник: `FirmwarePlugin.cc:194-218`, `APMFirmwarePlugin.cc:650-661`*

Индикаторы загружаются динамически из `FirmwarePlugin::toolIndicators()`.

| # | Индикатор | Файл | Что показывает | Нажатие | Boat? |
|---|---|---|---|---|---|
| 1.3.1 | **GPS** | `VehicleGPSIndicator.qml` | Спутники, fix type, HDOP | Drawer: детали GPS, настройки | ✅ Критичен |
| 1.3.2 | **GPS Resilience** | `GPSResilienceIndicator.qml` | Резервирование GPS | Drawer: статус | ⚠️ |
| 1.3.3 | **Telemetry RSSI** | `TelemetryRSSIIndicator.qml` | Уровень сигнала радио | Drawer: RSSI, noise, errors | ✅ Важен на воде |
| 1.3.4 | **RC RSSI** | `RCRSSIIndicator.qml` | Уровень RC-сигнала пульта | Drawer: RSSI значение | ⚠️ Если используется RC |
| 1.3.5 | **Battery** | `BatteryIndicator.qml` | Напряжение, % заряда, ток | Drawer: ячейки, mAh, пороги | ✅ Критичен |
| 1.3.6 | **Remote ID** | `RemoteIDIndicator.qml` | Статус Remote ID модуля | Drawer: ID info | ❌ Не для boat |
| 1.3.7 | **Gimbal** | `GimbalIndicator.qml` | Управление gimbal | Drawer: pitch/yaw управление | ⚠️ Если камера |
| 1.3.8 | **ESC** | `EscIndicator.qml` | Статус ESC/моторов | Drawer: RPM, температура, ток | ✅ Важен |
| 1.3.9 | **Joystick** | `JoystickIndicator.qml` | Статус подключения джойстика | Drawer: калибровка | ⚠️ |
| 1.3.10 | **Signing** | `SigningIndicator.qml` | MAVLink signing status | Drawer: key management | ⚠️ Security |
| 1.3.11 | **Multi-Vehicle** | `MultiVehicleSelector.qml` | Выбор активного vehicle (если > 1) | Селектор vehicle | ⚠️ Если флот |
| 1.3.12 | **RTK GPS** (app-level) | `RTKGPSIndicator.qml` | Статус RTK base station | Drawer | ⚠️ Если RTK |
| 1.3.13 | **APM Forwarding** (APM only) | `APMSupportForwardingIndicator.qml` | Forwarding MAVLink support | Drawer | ✅ APM-specific |

---

## 2. Fly View — Guided Actions & Map

*Источник: `GuidedActionsController.qml`, `FlyView.qml`*

### 2.1 Guided Action Bar

| # | Кнопка | Файл:строки | Что делает | Логика (код) | Когда видна | Boat? |
|---|---|---|---|---|---|---|
| 2.1.1 | **Arm** | `GAC.qml:334,565` | ARM двигатели | `_activeVehicle.armed = true` → `MAV_CMD_COMPONENT_ARM_DISARM` | Disarmed + canArm | ✅ |
| 2.1.2 | **Force Arm** | `GAC.qml:336,568` | Принудительный ARM | `_activeVehicle.forceArm()` → magic number 2989 | Disarmed | ⚠️ |
| 2.1.3 | **Disarm** | `GAC.qml:338,572` | Выключить двигатели | `_activeVehicle.armed = false` | Armed + не в движении | ✅ |
| 2.1.4 | **EMERGENCY STOP** | `GAC.qml:340,575` | Немедленная остановка моторов **⚠️ ОПАСНО** | `_activeVehicle.emergencyStop()` → magic 21196 | Armed + flying | ✅ Критичен |
| 2.1.5 | **Takeoff** | `GAC.qml:342` | Взлёт | `_activeVehicle.startTakeoff()` | Для MR/VTOL | ❌ Rover: "Vehicle does not support guided takeoff" |
| 2.1.6 | **Start Mission** | `GAC.qml:348,576` | Начать выполнение миссии | `_activeVehicle.startMission()` → `FirmwarePlugin::startMission()` | Mission loaded + disarmed/armed | ✅ |
| 2.1.7 | **Continue Mission** | `GAC.qml:350,579` | Продолжить миссию после паузы | `_activeVehicle.startMission()` → resume | Armed + flying + mission | ✅ |
| 2.1.8 | **Pause** | `GAC.qml:352,582` | Пауза → Hold mode | `_activeVehicle.pauseVehicle()` → `pauseFlightMode()` → "Hold" | Armed + flying + not paused | ✅ |
| 2.1.9 | **Change Altitude** | `GAC.qml:354` | Slider для изменения высоты | `_activeVehicle.guidedModeChangeAltitude()` | Flying + guided | ❌ Rover: "not supported" |
| 2.1.10 | **Land** | `GAC.qml:344` | Посадка | `_activeVehicle.guidedModeLand()` | MR + Armed | ❌ Нет Land mode для Rover |
| 2.1.11 | **RTL** | `GAC.qml:356,557` | Return To Launch | `_activeVehicle.guidedModeRTL(smartRTL)` | Armed + flying | ✅ Критичен |
| 2.1.12 | **Change Speed** | `GAC.qml:362` | Slider для скорости | `_activeVehicle.guidedModeChangeGroundSpeedMetersSecond()` → `MAV_CMD_DO_CHANGE_SPEED` | Flying + guided | ✅ |
| 2.1.13 | **Change Heading** | `GAC.qml:366` | Тап на карте → новый курс | `_activeVehicle.guidedModeChangeHeading(coord)` → `MAV_CMD_CONDITION_YAW` | Flying | ✅ |

### 2.2 Map Actions (Fly View)

| # | Элемент | Файл | Что делает | Логика | Когда доступно | Boat? |
|---|---|---|---|---|---|---|
| 2.2.1 | **Тап на карте → GoTo** | `GuidedActionsController` | Навигация к точке | `_activeVehicle.guidedModeGotoLocation()` → `MAV_CMD_DO_REPOSITION` | Armed + flying | ✅ |
| 2.2.2 | **Тап на карте → Set Home** | `GuidedActionsController` | Установить Home позицию | `_activeVehicle.sendMavCommand(MAV_CMD_DO_SET_HOME)` | При подключении | ✅ |
| 2.2.3 | **Тап на карте → GoTo + Orbit** | `GuidedActionsController` | Кружение вокруг точки | `_activeVehicle.guidedModeOrbit()` → `MAV_CMD_DO_ORBIT` | Flying + orbit supported | ⚠️ |
| 2.2.4 | **Тап на карте → ROI** | `GuidedActionsController` | Установить Region of Interest | `_activeVehicle.guidedModeROI()` → `MAV_CMD_DO_SET_ROI_LOCATION` | Flying + ROI supported | ⚠️ |
| 2.2.5 | **Тап на WP (в миссии)** | `GuidedActionsController` | Переключиться на указанный WP | `_activeVehicle.setCurrentMissionSequence(seq)` | В Auto mode | ✅ |

---

## 3. Plan View

*Источник: `PlanView.qml:440-526`, `PlanToolBarIndicators.qml:1-205`*

### 3.1 Plan Toolbar

| # | Кнопка | Файл:строки | Что делает | Логика | Когда доступна | Boat? |
|---|---|---|---|---|---|---|
| 3.1.1 | **Open** | `PlanToolBarIndicators.qml:118-123` | Загрузить план из файла | `_planMasterController.loadFromSelectedFile()` | Всегда (не синхр.) | ✅ |
| 3.1.2 | **Save** | `PlanToolBarIndicators.qml:125-131` | Сохранить план на диск (.plan) | `_planMasterController.saveToCurrent()` / `saveWithCurrentName()` | Когда есть items | ✅ |
| 3.1.3 | **Upload** | `PlanToolBarIndicators.qml:133-141` | Загрузить план в vehicle | `_planMasterController.upload()` | Когда есть items + vehicle | ✅ |
| 3.1.4 | **Clear** | `PlanToolBarIndicators.qml:143-148` | Удалить все items из плана | `_planMasterController.removeAll()` или `removeAllFromVehicle()` | Всегда | ✅ |
| 3.1.5 | **☰ (Hamburger) → Save as KML** | `PlanToolBarIndicators.qml:178-186` | Экспорт в KML формат | `_planMasterController.saveKmlToSelectedFile()` | Когда есть items | ✅ |
| 3.1.6 | **☰ → Download** | `PlanToolBarIndicators.qml:189-199` | Загрузить план С vehicle | `_planMasterController.loadFromVehicle()` | При подключённом vehicle | ✅ |

### 3.2 Plan Toolstrip (левый вертикальный)

| # | Кнопка | Файл:строки | Что делает | Логика | Когда видна | Boat? |
|---|---|---|---|---|---|---|
| 3.2.1 | **Takeoff** | `PlanView.qml:466-473` | Добавить Takeoff item в миссию | `insertTakeoffItemAfterCurrent()` | Mission layer + `!rover` | ❌ **Скрыта для Rover!** |
| 3.2.2 | **Pattern** | `PlanView.qml:475-485` | Добавить Survey/Structure Scan | `insertComplexItemAfterCurrent(name)` dropPanel | Mission layer | ✅ Survey для обследований |
| 3.2.3 | **Waypoint** (toggle) | `PlanView.qml:487-493` | Включить/выключить режим "тап = WP" | `_addWaypointOnClick = !_addWaypointOnClick` | Mission layer | ✅ Основной |
| 3.2.4 | **ROI** (toggle) | `PlanView.qml:495-501` | Включить/выключить режим "тап = ROI" | `_addROIOnClick = !_addROIOnClick` | Mission layer + ROI supported | ⚠️ |
| 3.2.5 | **Return / Land** | `PlanView.qml:503-514` | Добавить RTL/Land item в миссию | `insertLandItemAfterCurrent()` | Mission layer | ✅ RTL для Rover |
| 3.2.6 | **Stats** | `PlanView.qml:516-521` | Показать статистику миссии | `missionStatus.showMissionStatus()` | Когда stats скрыты | ✅ |

### 3.3 Plan Map Actions

| # | Действие | Файл | Что делает | Логика | Boat? |
|---|---|---|---|---|---|
| 3.3.1 | **Тап на карте** (Waypoint mode ON) | `PlanView.qml` | Добавляет новый Waypoint | `_missionController.insertSimpleMissionItem()` | ✅ |
| 3.3.2 | **Тап на карте** (ROI mode ON) | `PlanView.qml` | Добавляет ROI point | `_missionController.insertROIMissionItem()` | ⚠️ |
| 3.3.3 | **Drag WP marker** | Map interaction | Перемещение waypoint | mission item coordinate update | ✅ |
| 3.3.4 | **Тап на WP → правая панель** | `PlanViewRightPanel` | Редактирование параметров WP (altitude, speed, hold time) | Direct Fact editing | ✅ |

### 3.4 Plan Right Panel

| # | Элемент | Что редактирует | Boat? |
|---|---|---|---|
| 3.4.1 | **Mission Settings** | Planned home, rally points, vehicle info | ✅ |
| 3.4.2 | **WP altitude** | Высота точки (для boat: нерелевантна, но поле есть) | ⚠️ Поле видно но малозначимо |
| 3.4.3 | **WP speed** | DO_CHANGE_SPEED перед WP | ✅ Важно |
| 3.4.4 | **WP hold time** | Время удержания в точке | ✅ Для survey |
| 3.4.5 | **Layer selector** (Mission/Fence/Rally) | Переключение между слоями | ✅ Fence критичен |

---

## 4. Vehicle Setup

*Источник: `VehicleConfigView.qml`, `APMAutoPilotPlugin.cc`*

| # | Компонент | Файл | Что делает | Логика | Boat? |
|---|---|---|---|---|---|
| 4.1 | **Summary** | VehicleConfigView | Обзор всех компонентов + статус калибровки | `autopilotPlugin.vehicleComponents` → summary QML | ✅ |
| 4.2 | **Airframe Setup** | APM Airframe component | Выбор типа рамы (Frame Class/Type) | `FRAME_CLASS`, `FRAME_TYPE` params | ✅ |
| 4.3 | **Sensors** | APM Sensors | Калибровка Compass, Accel, Gyro | `MAV_CMD_PREFLIGHT_CALIBRATION` | ✅ Compass критичен |
| 4.4 | **Radio Calibration** | APM Radio component | Калибровка RC-каналов (мин/макс/trim) | `RC1_MIN..RC16_MAX` params | ⚠️ Если RC |
| 4.5 | **Flight Modes** | APM FlightModes | Привязка RC-каналов к режимам (MODE1-MODE6) | `MODE1..MODE6`, `MODE_CH` params | ✅ |
| 4.6 | **Failsafes** | APMFailsafesComponent | Настройка failsafe: Battery, GCS, Throttle, EKF, Crash | JSON-driven UI → `FS_*` params | ✅ Критичен |
| 4.7 | **Servo Output** | ServoOutput component | Мониторинг PWM на сервоканалах | `ServoOutputMonitorController` → realtime PWM bars | ✅ Steering/Throttle |
| 4.8 | **Safety** | APMSafetyComponent | Arming checks, geofence, RTL altitude | `ARMING_*`, `FENCE_*`, `RTL_*` params | ✅ |
| 4.9 | **Power** | APM Power component | Калибровка батарей, voltage/current sensors | `BATT_*` params | ✅ |
| 4.10 | **Parameters** | ParameterEditor | Полный список параметров с поиском и категориями | `ParameterManager` → all Facts | ✅ Эксперт |

---

## 5. Application Settings

*Источник: `SettingsManager`, `AppSettings`, `*Settings.SettingsGroup.json`*

| # | Секция | Ключевые настройки | Что влияет | Boat? |
|---|---|---|---|---|
| 5.1 | **General** | language, color scheme, map provider, save path, font sizes | Весь UI | ✅ |
| 5.2 | **Fly View** | guidedMinAltitude/MaxAltitude, virtualJoystick, useChecklist, enforceChecklist, showObstacleDistanceOverlay | Отображение FlyView | ✅ virtualJoystick, checklist |
| 5.3 | **Plan View** | defaultMissionItemAltitude, displayPresetsTabFirst, aboveTerrainWarning, takeoffItemNotRequired | Создание mission | ✅ `takeoffItemNotRequired` для boat! |
| 5.4 | **Video** | videoSource, rtspUrl, udpPort, aspectRatio, gridLines, lowLatencyMode | Видео стрим | ⚠️ Если камера |
| 5.5 | **Telemetry** | telemetrySave, telemetrySaveNotArmed, saveCsvTelemetry, forwardMavlink | Запись данных | ✅ Все важно |
| 5.6 | **MAVLink** | apmStartMavlinkStreams, streamRates (RawSensors, Position, RC, etc.) | Частота обновления телеметрии | ✅ streamRatePosition важен |
| 5.7 | **Maps** | mapboxToken, esriToken, offlineMaps, cacheSize, cacheMemSize | Оффлайн карты | ✅ Критично на воде |
| 5.8 | **Comm Links** | Link management: Serial, UDP, TCP, Log Replay | Настройка соединений | ✅ |
| 5.9 | **Flight Mode** | requireModeChangeConfirmation, hiddenFlightModes per vehicle class | Поведение mode selector | ✅ |

---

## 6. Analyze Tools

*Источник: `QGCCorePlugin.cc:analyzePagesModel`, `AnalyzeView/*.qml`*

| # | Инструмент | Файл | Что делает | Действие пользователя | Boat? |
|---|---|---|---|---|---|
| 6.1 | **Onboard Log Download** | `LogDownloadPage.qml` | Скачивание бортовых логов | Кнопки: Refresh → список → Download | ✅ Для пост-анализа |
| 6.2 | **GeoTag Images** | `GeoTagPage.qml` | Привязка GPS к фото из логов | Выбрать лог + папку с фото → Process | ⚠️ Если камера |
| 6.3 | **MAVLink Console** | `MAVLinkConsolePage.qml` | Терминал к бортовому NSH shell | Ввести команду (status, param show X) → вывод | ✅ Критичен для debug |
| 6.4 | **MAVLink Inspector** | `MAVLinkInspectorPage.qml` | Просмотр всех MAVLink сообщений в реальном времени | Выбрать message → поля, частота, значения | ✅ Критичен для debug |
| 6.5 | **Vibration** | `VibrationPage.qml` | Графики вибрации (IMU) | Просмотр x/y/z вибраций | ⚠️ На воде иной характер |

---

## 7. Сводная матрица: Top-50 критических действий

| # | Экран | Элемент | Действие | Backend Call | Boat Priority |
|---|---|---|---|---|---|
| 1 | Fly | Status → **Arm** | Включить моторы | `Vehicle::setArmed(true)` → `MAV_CMD_COMPONENT_ARM_DISARM` | 🔴 P0 |
| 2 | Fly | Status → **Disarm** | Выключить моторы | `Vehicle::setArmed(false)` | 🔴 P0 |
| 3 | Fly | Guided → **EMERGENCY STOP** | Аварийная остановка | `Vehicle::emergencyStop()` → magic 21196 | 🔴 P0 |
| 4 | Fly | Guided → **Pause** | Остановиться (Hold) | `Vehicle::pauseVehicle()` → `"Hold"` mode | 🔴 P0 |
| 5 | Fly | Guided → **RTL** | Возврат на базу | `Vehicle::guidedModeRTL(smartRTL)` | 🔴 P0 |
| 6 | Fly | Guided → **Start Mission** | Начать миссию | `Vehicle::startMission()` → ARM + Auto | 🔴 P0 |
| 7 | Fly | Map → **GoTo Location** | Навигация к точке | `Vehicle::guidedModeGotoLocation()` → `MAV_CMD_DO_REPOSITION` | 🔴 P0 |
| 8 | Fly | Toolbar → **Flight Mode** | Переключить режим | `Vehicle::setFlightMode()` → `MAV_CMD_DO_SET_MODE` | 🔴 P0 |
| 9 | Fly | Toolbar → **GPS indicator** | Проверить GPS | Read-only: sat count, fix type | 🔴 P0 |
| 10 | Fly | Toolbar → **Battery indicator** | Проверить заряд | Read-only: voltage, percent | 🔴 P0 |
| 11 | Fly | Toolbar → **Telemetry RSSI** | Проверить связь | Read-only: RSSI, noise | 🟡 P1 |
| 12 | Fly | Guided → **Continue Mission** | Продолжить миссию | `Vehicle::startMission()` resume | 🟡 P1 |
| 13 | Fly | Guided → **Change Speed** | Изменить скорость | `guidedModeChangeGroundSpeedMetersSecond()` → `MAV_CMD_DO_CHANGE_SPEED` | 🟡 P1 |
| 14 | Fly | Guided → **Change Heading** | Изменить курс | `guidedModeChangeHeading()` → `MAV_CMD_CONDITION_YAW` | 🟡 P1 |
| 15 | Fly | Map → **Set Home** | Задать точку Home | `MAV_CMD_DO_SET_HOME` | 🟡 P1 |
| 16 | Fly | Status → **Force Arm** | Обход pre-arm checks | `Vehicle::forceArm()` → 2989 | 🟡 P1 |
| 17 | Plan | Toolbar → **Upload** | Загрузить миссию в vehicle | `PlanMasterController::upload()` → `MissionManager::writeMissionItems()` | 🔴 P0 |
| 18 | Plan | Toolbar → **Save** | Сохранить на диск | `PlanMasterController::saveToCurrent()` | 🟡 P1 |
| 19 | Plan | Toolbar → **Open** | Загрузить с диска | `PlanMasterController::loadFromSelectedFile()` | 🟡 P1 |
| 20 | Plan | Toolbar → **Clear** | Удалить всю миссию | `PlanMasterController::removeAll()` | 🟡 P1 |
| 21 | Plan | Toolbar → **Download** | Скачать план с vehicle | `PlanMasterController::loadFromVehicle()` | 🟡 P1 |
| 22 | Plan | Map → **Add Waypoint** | Добавить WP тапом | `_missionController.insertSimpleMissionItem()` | 🔴 P0 |
| 23 | Plan | Toolstrip → **Pattern** | Добавить Survey area | `insertComplexItemAfterCurrent()` | 🟡 P1 |
| 24 | Plan | Toolstrip → **RTL/Land** | Добавить Return item | `insertLandItemAfterCurrent()` | 🟡 P1 |
| 25 | Plan | Right Panel → **WP Speed** | Указать скорость на WP | `DO_CHANGE_SPEED` mission item | 🟡 P1 |
| 26 | Plan | Layer → **Fence** | Переключить на Geofence | `_editingLayer = _layerGeoFence` | 🟡 P1 |
| 27 | Plan | Layer → **Rally** | Переключить на Rally Points | `_editingLayer = _layerRallyPoints` | 🟢 P2 |
| 28 | Plan | Toolbar → **Save as KML** | Экспорт в KML | `saveKmlToSelectedFile()` | 🟢 P2 |
| 29 | Setup | **Failsafes** | Настройка GCS/THR/EKF/Battery failsafe | JSON-driven → `FS_*` params | 🔴 P0 |
| 30 | Setup | **Sensors** | Калибровка Compass | `MAV_CMD_PREFLIGHT_CALIBRATION` | 🔴 P0 |
| 31 | Setup | **Flight Modes** | Привязка RC → режимы | `MODE1..MODE6` params | 🟡 P1 |
| 32 | Setup | **Parameters** (поиск) | Найти и изменить параметр | `ParameterManager::setParameter()` | 🟡 P1 |
| 33 | Setup | **Airframe** | Выбрать Frame Class/Type | `FRAME_CLASS`, `FRAME_TYPE` | 🟡 P1 (при начальной настройке) |
| 34 | Setup | **Servo Output** | Мониторинг PWM | `ServoOutputMonitorController` real-time | 🟡 P1 |
| 35 | Setup | **Power** | Калибровка Battery Monitor | `BATT_MONITOR`, `BATT_VOLT_MULT` | 🟡 P1 |
| 36 | Setup | **Safety** (arming) | Arming checks, GeoFence | `ARMING_*`, `FENCE_*` | 🟡 P1 |
| 37 | Settings | **Comm Links → Add** | Создать новое соединение | `LinkManager` creating UDP/Serial/TCP link | 🟡 P1 |
| 38 | Settings | **Telemetry → Save .tlog** | Включить запись телеметрии | `telemetrySave = true` | 🟡 P1 |
| 39 | Settings | **Telemetry → Forward MAVLink** | Ретрансляция MAVLink на другой GCS | `forwardMavlink = true` | 🟢 P2 |
| 40 | Settings | **Fly View → Enable Checklist** | Включить Pre-Flight Checklist | `useChecklist = true` | 🟡 P1 |
| 41 | Settings | **Fly View → Virtual Joystick** | Включить экранный джойстик | `virtualTabletJoystick = true` | 🟢 P2 (если без RC) |
| 42 | Settings | **Plan → Takeoff Not Required** | Убрать требование takeoff в плане | `takeoffItemNotRequired = true` | 🔴 P0 Boat: ОБЯЗАТЕЛЬНО |
| 43 | Settings | **Maps → Download Offline** | Скачать карты для оффлайн | OfflineMap downloader | 🔴 P0 На воде нет Wi-Fi |
| 44 | Settings | **Video → RTSP URL** | Указать источник видео | `rtspUrl` setting | 🟢 P2 |
| 45 | Analyze | **MAVLink Console** | Терминал на борту | `MAVLinkConsoleController` → NSH shell | 🟡 P1 Debug |
| 46 | Analyze | **MAVLink Inspector** | Просмотр MAVLink трафика | `MAVLinkInspectorController` → message table | 🟡 P1 Debug |
| 47 | Analyze | **Log Download** | Скачать бортовой лог | `LogDownloadController` → download files | 🟡 P1 |
| 48 | Fly | Guided → **Set Waypoint** | Переключить текущий WP (в Auto) | `Vehicle::setCurrentMissionSequence()` | 🟡 P1 |
| 49 | Fly | Map/Guided → **Orbit** | Кружение вокруг точки | `Vehicle::guidedModeOrbit()` → `MAV_CMD_DO_ORBIT` | 🟢 P2 |
| 50 | Fly | Map/Guided → **ROI** | Направить камеру на точку | `Vehicle::guidedModeROI()` → `MAV_CMD_DO_SET_ROI_LOCATION` | 🟢 P2 |

---

## 8. Граф жизненного цикла действий

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW ОПЕРАТОРА                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Settings                                                   │
│  ├─ Comm Links → Add UDP:14550                [#37]         │
│  ├─ Maps → Offline maps                       [#43]         │
│  ├─ Plan → Takeoff Not Required = true        [#42]         │
│  └─ Telemetry → Save .tlog = true             [#38]         │
│       │                                                     │
│       ▼                                                     │
│  ПОДКЛЮЧЕНИЕ (auto-connect UDP:14550)                       │
│  ├─ Toolbar: GPS [#9] → check ≥9 sat                       │
│  ├─ Toolbar: Battery [#10] → check ≥40%                    │
│  └─ Toolbar: Status = "Ready" [#1.1.1]                     │
│       │                                                     │
│       ▼                                                     │
│  Setup (одноразово)                                         │
│  ├─ Sensors → Compass calibration             [#30]         │
│  ├─ Failsafes → GCS/THR/EKF/Battery           [#29]         │
│  └─ Parameters → CRUISE_SPEED, FENCE, etc.    [#32]         │
│       │                                                     │
│       ▼                                                     │
│  Plan View                                                  │
│  ├─ Add Waypoints (тап)                        [#22]         │
│  ├─ Configure WP speed                         [#25]         │
│  ├─ Add RTL at end                             [#24]         │
│  ├─ Save to file                               [#18]         │
│  └─ Upload to vehicle                          [#17]         │
│       │                                                     │
│       ▼                                                     │
│  Fly View                                                   │
│  ├─ ARM                                        [#1]          │
│  ├─ Start Mission                              [#6]          │
│  │   │                                                      │
│  │   ├─ Monitor: speed, heading, WP progress               │
│  │   ├─ Pause (Hold) if needed                 [#4]          │
│  │   ├─ Continue Mission                       [#12]         │
│  │   ├─ GoTo Location (redirect)               [#7]          │
│  │   ├─ Change Speed                           [#13]         │
│  │   ├─ RTL if needed                          [#5]          │
│  │   └─ EMERGENCY STOP ⚠️                      [#3]          │
│  │                                                          │
│  └─ DISARM on completion                       [#2]          │
│       │                                                     │
│       ▼                                                     │
│  Analyze                                                    │
│  ├─ Download onboard log                       [#47]         │
│  ├─ MAVLink Inspector → review packets         [#46]         │
│  └─ MAVLink Console → param verify             [#45]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Элементы, нерелевантные для boat

| Элемент | Экран | Почему не нужен | Источник |
|---|---|---|---|
| Takeoff button | Fly Guided | `_guidedModeTakeoff()` → "Vehicle does not support guided takeoff" для non-MR/VTOL | `APMFirmwarePlugin.cc:1031` |
| Takeoff toolstrip | Plan Toolstrip | `visible: !_planMasterController.controllerVehicle.rover` → **скрыт** | `PlanView.qml:470` |
| Land button | Fly Guided | Нет Land mode для Rover | — |
| Change Altitude slider | Fly Guided | `guidedModeChangeAltitude()` → отклоняется | `ArduRoverFirmwarePlugin.cc:73-76` |
| VTOL Transition | Toolbar | `_isVTOL = false` для Rover | `FlightModeIndicator.qml:57` |
| Loiter Radius change (FW) | Fly Guided | `_vehicleInFwdFlight = false` | — |
| Land Abort | Fly Guided | `_fixedWingOnApproach = false` | — |
| Airspeed indicator | HUD | Rover нет airspeed | — |
| Altitude tape | HUD | Surface vessel — высота ~0 | — |

---

## 10. Подтверждённые выводы vs Гипотезы

| Вывод | Статус | Обоснование |
|---|---|---|
| Takeoff item скрыт в Plan Toolstrip для Rover | ✅ Подтверждено | `PlanView.qml:470`: `visible: !rover` |
| Takeoff action недоступен для Rover в Guided Bar | ✅ Подтверждено | `APMFirmwarePlugin.cc:1031`: explicit check |
| 13 toolbar indicators загружаются для APM | ✅ Подтверждено | `FirmwarePlugin.cc:197-214` + `APMFirmwarePlugin.cc:657` |
| GoTo использует `MAV_CMD_DO_REPOSITION` (newer) или guided WP (legacy) | ✅ Подтверждено | `APMFirmwarePlugin.cc:796-859` |
| Change Speed для Rover через `MAV_CMD_DO_CHANGE_SPEED` (groundspeed=1) | ✅ Подтверждено | `APMFirmwarePlugin.cc:939-951` |
| Change Heading через `MAV_CMD_CONDITION_YAW` | ✅ Подтверждено | `APMFirmwarePlugin.cc:958-993` |
| Emergency Stop = `MAV_CMD_COMPONENT_ARM_DISARM` с magic 21196 | ✅ Подтверждено | `Vehicle.cc:2351-2358` |
| `maxGoToLocationDistance` limit применяется ко всем GoTo | ✅ Подтверждено | `Vehicle.cc:2111-2113` |
| Status label "Flying" показывается для armed+active Rover | ⚠️ Гипотеза | APM определяет flying из `MAV_STATE_ACTIVE` heartbeat, но для Rover "flying"="driving". Нужна SITL проверка |
| Virtual Joystick работает для Rover | ⚠️ Гипотеза | `Vehicle::virtualTabletJoystickValue()` отправляет RC override → предположительно работает через `MAV_CMD_RC_CHANNELS_OVERRIDE` |
