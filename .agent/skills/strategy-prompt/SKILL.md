---
name: strategy-prompt
description: Generate SMM strategies and AI prompts for brands in Airtable. Use this skill whenever the user asks to create, update, or generate SMM strategies, tone of voice prompts, content type guidelines, or brand communication rules for social media accounts. Also triggers when the user asks to fill the "Raw Strategy" or "Prompt" columns, onboard a new brand, or prepare AI instructions for content generation across Instagram, Facebook, LinkedIn, Medium, or other platforms.
version: 1.0
priority: HIGH
---

# Strategy & Prompt Generator for SMM Brands

Generate professional SMM strategies and AI-ready prompts for brands stored in Airtable. This skill produces two distinct outputs per brand:

1. **Raw Strategy** — A structured SMM strategy covering goals, target audience, platforms, content types, and posting frequency
2. **Prompt** — An AI system prompt (Tone of Voice) that will be used by n8n + ChatGPT to generate social media posts for this brand

These outputs feed directly into the `Brands` table in Airtable (`SMM Workspace` base).

---

## When to Use This Skill

- User says "generate strategy for X brand"
- User says "fill prompts for brands without prompts"  
- User says "onboard new brand" or "add brand to Airtable"
- User says "write tone of voice for X"
- User says "update strategy" or "rewrite prompt"
- User needs to batch-generate strategies/prompts for multiple brands

---

## Architecture Context

### Airtable Structure (Base: SMM Workspace)

**Table: Brands**
| Field | Type | Purpose |
|-------|------|---------|
| Name | Single line text | Brand name |
| Website URL | URL | Company website |
| Instagram URL | URL | Instagram profile |
| Facebook URL | URL | Facebook page |
| LinkedIn URL | URL | LinkedIn company page |
| Medium URL | URL | Medium publication |
| X URL | URL | X (Twitter) account |
| Telegram URL | URL | Telegram channel |
| YouTube URL | URL | YouTube channel |
| Raw Strategy | Long text (rich) | Full SMM strategy document |
| Prompt | Long text (rich) | AI system prompt / Tone of Voice |
| Target Audience | Long text | Target audience description |

**Table: Content Hub**
| Field | Type | Purpose |
|-------|------|---------|
| Brand | Link to Brands | Which brand this post belongs to |
| Platform | Multi-select | Instagram, Facebook, LinkedIn, Medium, Telegram |
| Format | Single select | Article, Post, Reels, Video |
| Generated Text | Long text | AI-generated post content |
| Status | Single select | 💡 Idea → ⚙️ In progress → ⏳ Waiting for approve → ✅ Ready → 🚀 Published |

### How Strategy & Prompt Flow Through the System

```
Raw Strategy (this skill generates)
    ↓
Prompt (this skill generates)
    ↓
n8n Workflow reads Prompt + Format + Platform
    ↓
ChatGPT generates post text
    ↓
Content Hub record updated with Generated Text
```

---

## Generating a Raw Strategy

### Input Requirements

To generate a quality strategy, gather the following about the brand:

| Required | Source | Fallback |
|----------|--------|----------|
| Brand name | Airtable `Name` field | Ask user |
| Website URL | Airtable `Website URL` | Ask user |
| Industry/niche | Parse from website or ask | Infer from name |
| Active platforms | Airtable URL fields (non-empty = active) | Ask user |
| Geography | Parse from website or strategy files | Default: global |

When a website URL is available, visit it to understand the brand's niche, products/services, unique selling points, and visual identity.

### Strategy Template

Always follow this structure exactly. Fill in all brackets `[...]` and adapt the examples to the specific brand. Each section should be concrete and specific to the brand's niche — avoid generic advice. Put "Немає даних під час базового аудиту" if specific metrics are unknown.

```markdown
## SMM-СТРАТЕГІЯ: {Brand Name}
**Період реалізації:** 3-6 місяців

### БЛОК 1. БАЗОВІ ВВІДНІ ТА АУДИТ
**Продукт/Послуга:** {Що продаємо? Цикл угоди (швидка покупка чи довге прийняття рішення)}.
**УТП:** {1-2 факти, які відрізняють від конкурентів}
**Поточні показники:**
* Підписники: {Базове значення або "потребує аудиту"}
* Охоплення (місяць): {Базове значення}
* Середній ER %: {Базове значення}
* Кількість лідів/продажів із соцмереж: {Базове значення}
* Вартість 1 ліда (CPL) зараз: {Базове значення}

### БЛОК 1.1. Вибір платформ
* **Основна мережа ({Платформа}):** Роль: Вітрина, продажі через Direct, побудова лояльності через Stories.
* **Додаткова мережа ({Платформа}):** Роль: Холодне охоплення, віральність, перегін трафіку в основну мережу.
* **Канал комунікації ({Платформа}):** Роль: Лонгріди, експертна спільнота, дотискання до покупки.

### БЛОК 2. SMART
**Фіксація результату**
* **Бізнес-ціль:** {Дія + Дедлайн+ Інструменти + Бюджет}
  *Приклад: Збільшити кількість продажів з Instagram на 15% до {Дата} за рахунок таргетованої реклами.*
* **Комунікаційна ціль:** {Чого ми хочемо від сприйняття бренду?}
  *Приклад: Сформувати імідж головного експерта в {Ніша} за {X} освітніх Reels на місяць.*

### БЛОК 3. АНАЛІЗ ЦА (JTBD)
*Чому і в яких ситуаціях люди насправді хочуть або наймають продукт*

**Сегмент 1: {Назва сегмента}**
* **Context (Контекст):** Коли я... {опис обставин}.
* **Motivation (Мотивація):** Я хочу... {чітке бажання}.
* **Outcome (Результат):** Щоб... {емоційна або раціональна вигода}.
* **Pains (Болі):** Що заважає купити? {страхи, сумніви}.
* **Контентне рішення:** Як ми закриваємо це в постах/Stories?

### БЛОК 4. АНАЛІЗ КОНКУРЕНТІВ (ТОП-3)
* **Конкурент 1:** {Назва або посилання}
  * Сильні/Слабкі сторони: {Аналіз}
  * Де втрачають аудиторію: {Слабке місце конкурента}
  * **Наш інсайт:** Що ми зробимо краще/інакше?
*(продублювати для конкурентів 2 і 3, якщо можливо)*

### БЛОК 5. ПОЗИЦІОНУВАННЯ ТА ПАКУВАННЯ
* **Чітке формулювання:** {Коротка суть для впізнаваності}
* **Tone of Voice:** {Опис тону спілкування}
* **Правила спілкування:** {Як ми звертаємось до клієнта? Чи використовуємо гумор?}
* **Візуальна концепція:** Кольори, шрифти, пресети для фото, стиль монтажу відео (мудборд).
* **Оптимізація профілів:** Біо + УТП + ключові слова для SEO, структура закріплених сторіз (Highlights).

### БЛОК 6. Контент-стратегія (See-Think-Do-Care)
*Шлях клієнта від перегляду до повторної покупки.*
* **SEE (Охоплення):**
  * Мета: Потрапити в рекомендації.
  * Формати: Reels, тренди, короткі поради, віральний контент.
* **THINK (Прогрів):**
  * Мета: Сформувати довіру.
  * Формати: Експертні каруселі, розбори кейсів, Q&A.
* **DO (Продаж):**
  * Мета: Конверсія в заявку.
  * Формати: Контент з чітким CTA, відгуки, промоакції, UGC.
* **CARE (Лояльність):**
  * Мета: Повторні замовлення / Перехід на сайт / Утримання клієнта.
  * Формати: Ексклюзив для підписників, опитування, бекстейдж.

**6.1. Контент-план (Шаблон реалізації):** {Короткий концепт на тиждень}
**6.2. Рубрикатор для контенту:** {Перелік рубрик}

### БЛОК 7. ТРАФІК
*Як про наш контент дізнається світ.*
* **Платні канали:**
  * Таргет: {Стратегія, аудиторії, орієнтовний бюджет}.
  * Інфлюенсери: {Критерії вибору, типи інтеграцій}.
* **Органічні канали:** Reels-воронки, SEO-тексти.

### БЛОК 8. РЕСУРСИ ТА БЮДЖЕТ (МІСЯЦЬ)
*Скільки коштує реалізація.*
* РАЗОМ: {Базовий розрахунок для ніші бренду}

### БЛОК 9. ЗВІТНІСТЬ ТА АНАЛІТИКА
*Контроль виконання плану.*
* **Щотижня:** Коригування таргету, аналіз охоплень.
* **Щомісяця:** Фактичні KPI та КП. Висновки: Що масштабуємо, а що видаляємо зі стратегії.

### БЛОК 10. РИЗИКИ 
* **Ризик 1:** Хейт у коментарях.
  * **Рішення:** Заготовлені скрипти відповідей (Crisis Management).
* **Ризик 2:** {Специфічний ризик бренду}.
  * **Рішення:** {Як запобігти}.

### БЛОК 11. ГІПОТЕЗИ НА ТЕСТ 
* **Гіпотеза 1:** Якщо ми {зробимо А}, то {отримаємо результат Б на Х%}.
* **Гіпотеза 2:** {Ще один специфічний тест для бренду}.
```

### Quality Criteria for Strategy

- Metrics must be **realistic** (not the same for every brand — a startup gets +15%, an established brand gets +40%)
- Target audience must be **specific** to the niche (not just "18-45 years old")
- Content ideas must be **concrete** ("5 tips for choosing running shoes" not "educational content about products")
- Platform choice must **match the audience** (B2B → LinkedIn first, Gen Z → Instagram/TikTok, educators → Facebook)

---

## Generating a Prompt (Tone of Voice)

The Prompt is the system instruction for ChatGPT when generating posts for this brand. It must be self-contained — the AI should be able to write a perfect post using ONLY this prompt + format + platform + topic.

### Prompt Template

```
Ты — профессиональный SMM-менеджер и копирайтер компании {Brand Name} ({краткое описание бизнеса}).

ЦЕЛЕВАЯ АУДИТОРИЯ:
{Кто они, возраст, гео, интересы — 2-3 строки}

TONE OF VOICE:
{Прилагательные, описывающие стиль: экспертный/дружелюбный/провокационный...}
{Как бренд общается: на "ты" или на "вы", с юмором или серьёзно}
{Что категорически нельзя: спорные темы, конкуренты, негатив}

ТИПЫ КОНТЕНТА (используй как руководство):
• Образовательный: {конкретные примеры тем}
• Развлекательный: {конкретные примеры тем}
• Кейсы: {что показываем}
• Промо: {как подаём акции}
• Интерактив: {какие вопросы задаём аудитории}

ПРАВИЛА:
1. Пиши структурированно (абзацы, маркированные списки).
2. Используй эмоджи умеренно ({конкретные эмоджи для бренда}).
3. {Платформо-специфичные правила: LinkedIn = аналитика, Twitter = до 280 символов}
4. Всегда добавляй CTA в конце.
5. Когда получаешь тему и формат, адаптируй текст:
   - Post = короткий, эмоджи, CTA
   - Article = длинный, структурированный (Medium/LinkedIn)
   - Reels = сценарий с хуками (первые 3 секунды = крючок)
   - Video = скрипт для YouTube
```

### Quality Criteria for Prompt

- The prompt must **name the brand and describe the business** in the first line
- Tone of Voice must use **specific adjectives**, not generic "professional and friendly"
- Emoji list must be **brand-relevant** (fintech: 💳🌐⚡🔒, gaming: 🎮⚔️🔥💎, beauty: ✨💄🌿💫)
- Rules section must include **platform-specific** instructions
- The prompt must explain how to **adapt to different formats** (Post vs Article vs Reels vs Video)

---

## Workflow: Batch Generation

When generating strategies/prompts for multiple brands at once:

### Step 1: Identify Brands Without Strategy/Prompt

```
Query Airtable:
- Filter: {Prompt} = BLANK() or {Raw Strategy} = BLANK()
- Get: Name, Website URL, all social URL fields
```

### Step 2: Research Each Brand

For each brand:
1. Check which social URL fields are non-empty → these are active platforms
2. If Website URL exists → visit and analyze the business
3. If no Website URL → infer from brand name or ask user

### Step 3: Generate and Write

For each brand:
1. Generate Raw Strategy using the template above
2. Generate Prompt using the template above
3. Update Airtable record via `mcp_airtable_update_record`

### Step 4: Verify

Query updated records and present a summary table:

```markdown
| Brand | Strategy | Prompt | Platforms |
|-------|----------|--------|-----------|
| X     | ✅       | ✅     | IG, FB, LI |
| Y     | ✅       | ✅     | FB, Medium |
```

---

## Tone of Voice Reference by Industry

Use these as starting points — always customize based on the specific brand.

| Industry | Tone | Emoji Set | Primary Platform |
|----------|------|-----------|-----------------|
| Fintech/Crypto | Expert, analytical, trustworthy | 💳🌐⚡🔒📊 | LinkedIn |
| E-commerce (Fashion) | Trendy, aspirational, vibrant | ✨👗🔥💫🛍️ | Instagram |
| E-commerce (Health) | Caring, informative, natural | 🌿💚🍃✨🌱 | Instagram + FB |
| Gaming | Dynamic, gamer-slang, energetic | 🎮⚔️🔥💎🏆 | Instagram + X |
| Education | Supportive, inspiring, practical | 📚🎓💡🌟📖 | Facebook |
| B2B/Tech | Professional, innovative, data-driven | 🚀📊💡🛡️⚙️ | LinkedIn |
| Beauty | Aesthetic, empowering, sensory | ✨💄🌿💫🧴 | Instagram |

---

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Copy-paste the same strategy for all brands | Customize goals, audience, and content specifically |
| Use vague content ideas ("educational posts") | Give concrete examples ("5 exercises for runners") |
| Set unrealistic metrics (+100% for a new brand) | Scale metrics based on brand maturity |
| Write a prompt without naming the brand | Always start with brand name and business description |
| Ignore which platforms the brand actually uses | Check social URL fields and adapt accordingly |
| Write in English when the brand operates in CIS | Default to Russian/Ukrainian unless explicitly requested |

---

## Language Rules

- **Strategy and Prompt text**: Write in the same language as the user's request (typically Russian or Ukrainian)
- **Code, field names, and Airtable values**: Always in English
- **Platform names**: Always in English (Instagram, not Инстаграм)
