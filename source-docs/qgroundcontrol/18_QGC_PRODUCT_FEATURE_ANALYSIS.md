# QGroundControl — Product Feature Analysis

> **System:** QGroundControl (QGC) v5.0+
> **Analysis Date:** April 10, 2026
> **Analysis Type:** Strategic product analysis (synthesized)
> **Based on:** 16_QGC_SYSTEM_CAPABILITIES.md, 17_QGC_USER_WORKFLOWS.md

---

## TL;DR (Quick Scan)

**QGroundControl** — open-source наземная станция управления, покрывающая полный lifecycle беспилотного аппарата в одном приложении.

**5 ключевых capabilities:**

1. Визуальное планирование миссий коммерческого уровня (Survey, Corridor, Structure Scan)
2. Управление полётом в реальном времени (20+ команд, экстренные процедуры)
3. Полная конфигурация аппарата (прошивка → PID, один GUI)
4. Dual-firmware support (PX4 + ArduPilot = ~95% рынка)
5. Regulatory compliance из коробки (Remote ID, GeoFence, ADSB)

**Сильные стороны:**

- Заменяет коммерческие GCS стоимостью $5–15K
- 7+ типов ЛА и 5 платформ — один codebase
- Plugin API → branded GCS без форка
- 7 защищённых workflows покрывают 100% операционного цикла

**Главный вывод:** QGC — не просто инструмент, а **платформа с готовой бизнес-логикой**, пригодная как основа для создания собственной GCS.

---

## 1. EXECUTIVE SUMMARY

| | |
|---|---|
| **Что это** | Open-source наземная станция управления беспилотными аппаратами (GCS) |
| **Роль** | Единая точка управления: подключение, настройка, планирование миссий, полёт, анализ |
| **Ключевые возможности** | 8 функциональных доменов, 15 core capabilities, 7 пользовательских сценариев |
| **Ценность** | Замена 3–5 specialized tools одним приложением. $0 лицензии, enterprise-уровень функций |
| **Где используется** | Агросъёмка, инспекция инфраструктуры, SAR, морские операции, обучение, R&D |
| **Уникальность** | Единственная GCS с одинаково глубокой поддержкой PX4 и ArduPilot |

---

## 2. PRODUCT POSITIONING

| | |
|---|---|
| **Продукт** | Кросс-платформенная GCS для управления полным lifecycle беспилотных аппаратов |
| **Целевая аудитория** | Коммерческие операторы, R&D-команды, OEM-интеграторы, учебные организации |
| **Задачи** | Подключение → Настройка → Планирование миссий → Управление полётом → Анализ данных |
| **Сегмент** | Open-source GCS с enterprise-функциональностью. Между любительскими приложениями и закрытыми коммерческими решениями ($5–15K) |
| **Competitive edge** | Dual-firmware + visual mission planning + regulatory compliance — при $0 стоимости |

---

## 3. CORE PRODUCT CAPABILITIES

| # | Capability | Why it matters | P |
|---|-----------|----------------|---|
| 1 | **Visual Mission Planning** | Сложная миссия за минуты. Survey + Corridor + Structure Scan | 🔴 |
| 2 | **Real-time Flight Control** | 20+ команд. Полный контроль оператора = допуск к BVLOS | 🔴 |
| 3 | **Full Vehicle Configuration** | Прошивка → PID в одном GUI. Заменяет 3–5 инструментов | 🔴 |
| 4 | **Dual Firmware Support** | PX4 + ArduPilot = ~95% open-source дронов | 🔴 |
| 5 | **Safety & Compliance** | Remote ID + GeoFence + ADSB = легальные полёты | 🔴 |
| 6 | **Multi-Vehicle & Multi-Type** | Флот из 7+ типов ЛА в одном интерфейсе | 🔴 |
| 7 | **Live Telemetry** | 25+ групп данных. Основа для решений в полёте | 🔴 |
| 8 | **Offline Operations** | Карты + миссии без интернета. 80% полевых операций | 🔴 |
| 9 | **Video & Camera** | Видео + гимбал + термал = рабочая станция оператора | 🟡 |
| 10 | **Plugin API** | OEM создают branded GCS за недели. Без полного форка | 🟡 |

> 🔴 критично  🟡 важно

---

## 4. PRODUCT STRENGTHS

### 1. Два автопилота — один интерфейс

Единственная GCS с полноценной поддержкой PX4 и ArduPilot через изолированные плагины. Для организаций с гетерогенным парком — безальтернативный выбор.

### 2. Коммерческое планирование — $0

Survey, Corridor Scan, Structure Scan, Terrain Following, Camera Calc — функционал, который у конкурентов стоит $5–15K. Нулевой порог входа для сложных автономных миссий.

### 3. Полный lifecycle в одном приложении

Connect → Configure → Plan → Fly → Analyze — 7 сценариев, 4 экрана, ни одного переключения между инструментами. Каждое действие защищено подтверждением.

### 4. Regulatory-ready

Remote ID, GeoFence, ADSB, MAVLink Signing, адаптивные Pre-flight Checklists — всё встроено. Легальные коммерческие полёты без доработок.

### 5. Платформа для OEM

Plugin API (`QGCCorePlugin` + `QGCOptions`) позволяет строить branded GCS поверх QGC: свой UI, карты, MAVLink-фильтрация. Пример: Auterion Mission Control.

### 6. Защита от ошибок на уровне архитектуры

Каждое critical action → `confirmDialog`. Upload → 4 pre-check'а. Закрытие → 3 уровня проверки. Pre-flight checklist адаптируется по типу ЛА. Невозможно случайно arm'ить или загрузить битый план.

---

## 5. LIMITATIONS & RISKS

| # | Limitation | Impact | Risk |
|---|-----------|--------|------|
| 1 | **Монолитная desktop-архитектура** | Нет cloud/web-версии. Нет возможности разделить frontend и backend | Невозможна интеграция в облачные платформы управления флотом без рефакторинга |
| 2 | **Vehicle «God Object» (~189KB)** | Один класс = состояние + MAVLink + телеметрия + команды + 20+ FactGroups | Высокая связанность. Изменение в одной части может сломать другую. Масштабирование затруднено |
| 3 | **Нет нативного API** | Вся бизнес-логика доступна только через Qt/QML bindings | Интеграция с внешними системами (ERP, fleet management) требует значительных доработок |
| 4 | **Qt/QML зависимость** | UI полностью построен на Qt Quick | Кастомизация требует знания специфичного фреймворка. Веб-технологии не применимы |
| 5 | **Отсутствие multi-user** | Один оператор = одна инсталляция | Нет ролевой модели, нет совместной работы, нет аудит-лога действий |
| 6 | **Ограниченная аналитика** | Базовые инструменты (vibration, logs, geotag) | Нет dashboard, нет агрегации данных по флоту, нет trend analysis |

---

## 6. MODERNIZATION OPPORTUNITIES

| # | Current State | Improvement | Effect |
|---|--------------|-------------|--------|
| 1 | Монолит (UI + логика + MAVLink в одном процессе) | Выделить backend API (REST/gRPC/WebSocket) | Cloud-ready архитектура. Web/mobile frontend. Интеграция с внешними системами |
| 2 | Vehicle God Object | Декомпозировать на отдельные сервисы: Telemetry, Commands, Parameters, State | Независимое масштабирование. Тестируемость. Параллельная разработка |
| 3 | Qt/QML frontend | Заменить на web-stack (React/Vue + WebSocket) | Доступ через браузер. Снижение порога входа для разработчиков UI |
| 4 | Однопользовательский режим | Добавить auth + роли + audit log | Многопользовательское управление флотом. Compliance для enterprise |
| 5 | Оффлайн-only аналитика | Cloud dashboard с агрегацией данных по флоту | Trend analysis, предиктивное обслуживание, отчёты для руководства |
| 6 | `Q_PROPERTY` / `Q_INVOKABLE` как internal API | Формализовать в OpenAPI/gRPC schema | Документированный, версионированный API. Экосистема интеграций |

> **Ключевой insight:** Бизнес-логика уже организована через `Q_PROPERTY` (данные) и `Q_INVOKABLE` (команды). Это де-факто API-контракт. Модернизация — это рефакторинг существующих интерфейсов, а не переписывание с нуля.

---

## 7. POSITION IN MARKET

| Аспект | Оценка |
|--------|--------|
| **Где лидер** | Dual-firmware support — никто не покрывает PX4 + ArduPilot на одном уровне. Visual mission planning — коммерческий функционал за $0. Regulatory compliance — из коробки |
| **Где конкурентоспособна** | 5 платформ (один codebase), Plugin API для OEM, oффлайн-операции, 7+ типов ЛА |
| **Где ограничена** | Нет cloud/web. Нет API для интеграций. Нет multi-user. Нет fleet analytics. Desktop-only архитектура |
| **Макс. ценность** | Организации с гетерогенным парком (PX4 + ArduPilot). Полевые операции без интернета. Операторы, которым нужен regulatory-ready инструмент за $0 |

---

## 8. STRATEGIC VALUE

### Почему QGC важна как база для разработки собственной GCS

#### Что можно переиспользовать

| Компонент | Ценность | Стоимость повторной реализации |
|-----------|---------|-------------------------------|
| **Fact System** | Универсальная абстракция для 1000+ параметров PX4/ArduPilot. Типизация, валидация, unit conversion, UI-binding | 6–12 месяцев |
| **FirmwarePlugin** | Изоляция firmware-specific логики. Новый автопилот = новый плагин | 3–6 месяцев |
| **Mission Planning** | Survey, Corridor Scan, Structure Scan, Camera Calc, Terrain Following | 8–12 месяцев |
| **GuidedActionsController** | 30 action codes с confirm/execute pipeline и state management | 2–4 месяца |
| **MAVLink Protocol Layer** | Полная реализация MAVLink 2 с signing, multi-vehicle, heartbeat management | 3–6 месяцев |
| **Pre-flight Checklists** | Адаптивные по типу ЛА с enforce-режимом | 1–2 месяца |

#### Ценные архитектурные паттерны

| Паттерн | Что он даёт |
|---------|-------------|
| **Fact + FactGroup + FactMetaData** | Единый способ работы с параметрами. Скрывает разницу между PX4 и ArduPilot |
| **FirmwarePlugin (Strategy)** | Core не знает, какая прошивка. Масштабируемость без правок в ядре |
| **GuidedActions (Command)** | confirmAction() → executeAction(). Паттерн для любых critical commands |
| **PlanMasterController** | Координация Mission + GeoFence + Rally в едином pipeline |
| **PreFlightCheckList (Template)** | Тип ЛА → соответствующий чеклист. Расширяемо |

#### Рекомендация

> **Начинать не с нуля, а с извлечения.** Fact System, FirmwarePlugin и MAVLink-слой — это 12–24 месяца разработки, которые уже написаны и протестированы сообществом. Их можно обернуть в API и переиспользовать в новой архитектуре.

---

## 9. FINAL TAKEAWAY

**QGroundControl — это:**

- 🏗️ **Платформа**, а не приложение — Plugin API, Fact System, FirmwarePlugin позволяют строить поверх, а не рядом

- 💰 **$0 замена решений за $5–15K** — с enterprise-уровнем планирования миссий и regulatory compliance

- 🔐 **Safety-first архитектура** — каждое критическое действие защищено. 7 workflows, каждый с confirm/pre-check pipeline

- 🧬 **Готовая бизнес-логика для новой GCS** — Fact System + FirmwarePlugin + MAVLink layer = 12–24 месяца разработки, которые не нужно повторять

> **Стратегический вывод:** QGC — самая зрелая open-source GCS, чья бизнес-логика (Fact System, FirmwarePlugin, Mission Planning) может быть извлечена и переиспользована в API-first архитектуре. Это не код для копирования — это **проверенные паттерны и абстракции**, на которых строится собственная система.

---

> **Источник:** Синтез документов 16_QGC_SYSTEM_CAPABILITIES.md и 17_QGC_USER_WORKFLOWS.md. Все утверждения основаны на анализе кодовой базы QGroundControl (src/, QML views, C++ backend).
