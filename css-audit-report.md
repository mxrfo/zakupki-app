# CSS Audit v2 — backup → src/css + dist/index.html + src/js

Дата: 2026-11-27T09:36:18.865Z

## Сводка

| Метрика | Значение |
|---|---|
| Селекторов в монолите | 462 |
| Селекторов в модулях | 616 |
| ❌ Потерянных | 0 |
| ↻ Переименованных | 6 |
| 🗑 Удалённых намеренно | 18 |
| ➕ Новых | 178 |
| ⚠ Дублей внутри файла | 14 |
| ℹ Дублей между файлами | 28 |
| 🔴 var() без определения | 0 |
| ⬜ Определений вне tokens.css | 0 |
| 🔵 Неиспользуемых токенов | 24 |
| 🚫 Запрещённых паттернов | 1 |
| 🎬 keyframes: нет определения | 0 |
| 📐 Breakpoints вне списка | 0 |
| 🧱 z-index вне шкалы | 0 |
| 📦 Не импортировано | 0 |
| 🟡 HTML/JS-классов без CSS | 34 |
| 🔴 Дубликатов ID | 0 |
| ⚠ Inline display:none | 5 |

## ❌ Потерянные селекторы

_нет_

## ↻ Переименованные

- `.search-bar svg` → `.search-icon` (был в styles.css:85)
- `.user-info` → `.user-display` (был в styles.css:87)
- `.role-viewer` → `.control-select` (был в styles.css:90)
- `.test-mode-wrapper input` → `.test-mode-wrapper input[type="checkbox"]` (был в styles.css:100)
- `.note-card[data-stage-color]::before` → `.note-card::before` (был в styles.css:203)
- `.data-table tr:hover` → `.data-table tbody tr:hover` (был в styles.css:240)

## 🗑 Удалённые намеренно

- `.user-info b` — .user-display рендерится без <b>
- `.btn-icon` — не используется (заменён .action-icon-btn)
- `.btn-approval-submit` — не используется (заменён .btn-primary)
- `.btn-approval-submit:hover` — не используется
- `.action-icon-btn.primary` — не используется
- `.action-icon-btn.dark` — не используется
- `.note-badge.postponed` — P24/решения 54,58 — но JS пока рендерит → добавлен в cards.css
- `.data-table .btn` — P2
- `.form-group input[type="date"]::after` — нативный picker-индикатор
- `.log-panel.open` — P22 — логи теперь static-вкладка
- `.btn-logs:hover` — decision 51
- `.cs-step:focus` — P9 — outline-хаки не нужны
- `.cs-step:focus-visible` — P9
- `.cs-step:active` — P9
- `.pos-head:focus` — P9
- `.pos-head:focus-visible` — P9
- `.pos-main .det-link[style*="display:none"]` — decision 19
- `.pos-main .det-link[style*="display: none"]` — decision 19

## ➕ Новые селекторы

- `.dep-chip.selected`
- `.dep-chip.selected::after`
- `.settings-table tr:last-child td`
- `.logs-toolbar`
- `.logs-container`
- `.ai-radio.disabled`
- `.notes-grid>.note-card`
- `.table-view tbody tr`
- `.view-toggle .view-btn`
- `.modal.sheet`
- `.tab-btn::after`
- `.tab-btn.active::after`
- `.btn-icon-ghost.spinning svg`
- `.skeleton`
- `*`
- `*::before`
- `*::after`
- `.badge`
- `.badge-neutral`
- `.badge-info`
- `.badge-success`
- `.badge-warning`
- `.badge-danger`
- `.badge-brand`
- `.badge-violet`
- `.badge-gray`
- `.stage-badge`
- `.chip.selected`
- `.chip.selected svg`
- `.code-chip`
- `.postpone-indicator`
- `.postpone-indicator:hover`
- `.postpone-indicator svg`
- `.amount-changed-indicator`
- `.amount-changed-indicator svg`
- `.unavailable-indicator`
- `.unavailable-indicator svg`
- `.info-note svg`
- `.comment-block`
- `.comment-block svg`
- `.comment-block strong`
- `.btn:disabled`
- `.btn-primary:active`
- `.btn-secondary`
- `.btn-ghost`
- `.btn-ghost:hover`
- `.btn-danger:hover`
- `.btn-success:hover`
- `.btn-warning`
- `.btn-warning:hover`
- `.btn-ai`
- `.btn-ai:hover`
- `.btn-lg`
- `.btn-disabled-state:hover`
- `.action-icon-btn:focus-visible`
- `.action-icon-btn svg`
- `.action-icon-btn.approve:hover`
- `.action-icon-btn.reject:hover`
- `.action-icon-btn.rework`
- `.action-icon-btn.rework:hover`
- `.btn-close svg`
- `.fab-btn:focus-visible`
- `.btn-icon-right`
- `.note-sub`
- `.form-group input:hover`
- `.form-group select:hover`
- `.form-group textarea:hover`
- `.pos-del svg`
- `.detail-table td.cell-note`
- `.brand`
- `.brand-logo`
- `.brand-wordmark`
- `.tab-btn:focus-visible`
- `.tab-icon`
- `.tab-label`
- `.topbar-left`
- `.topbar-right`
- `.search-icon`
- `.search-bar input::placeholder`
- `.admin-controls`
- `.test-mode-wrapper input[type="checkbox"]`
- `.test-mode-wrapper label`
- `.control-label`
- `.control-select`
- `.control-select:focus`
- `.user-display`
- `.btn-icon-ghost`
- `.btn-icon-ghost:hover`
- `.btn-icon-ghost:focus-visible`
- `.btn-icon-ghost svg`
- `.icon-sun`
- `.icon-moon`
- `[data-theme="dark"] .icon-sun`
- `[data-theme="dark"] .icon-moon`
- `.hidden`
- `.toolbar-group`
- `.toolbar-label`
- `.view-btn:focus-visible`
- `.mobile-nav`
- `.mobile-nav-btn`
- `.mobile-nav-btn svg`
- `.mobile-nav-btn:hover`
- `.mobile-nav-btn.active`
- `.mobile-nav-btn:focus-visible`
- `.data-table .col-sec`
- `.data-table .td-secondary`
- `body`
- `.data-table thead`
- `.data-table tbody`
- `.data-table tr`
- `.modal-overlay.z-nested`
- `.modal-overlay.z-top`
- `.file-attachment svg`
- `html`
- `body::before`
- `a`
- `a:hover`
- `a:focus-visible`
- `img`
- `button`
- `button:focus-visible`
- `button:disabled`
- `input`
- `textarea`
- `select`
- `table`
- `ul`
- `ol`
- `::-webkit-scrollbar`
- `::-webkit-scrollbar-track`
- `::-webkit-scrollbar-thumb`
- `::-webkit-scrollbar-thumb:hover`
- `::selection`
- `:focus-visible`
- `[hidden]`
- `.data-table tbody tr:hover`
- `.data-table tbody tr:last-child td`
- `.td-secondary`
- `.link-ghost`
- `.link-ghost:hover`
- `.toast svg`
- `:root`
- `[data-theme="dark"]`
- `h1`
- `h2`
- `h3`
- `h4`
- `h5`
- `h6`
- `p`
- `.text-xs`
- `.text-sm`
- `.text-base`
- `.text-lg`
- `.text-xl`
- `.font-normal`
- `.font-medium`
- `.font-semibold`
- `.font-bold`
- `.font-extrabold`
- `.text-main`
- `.text-muted`
- `.text-disabled`
- `.text-brand`
- `.text-danger`
- `.text-success`
- `.text-warning`
- `.text-left`
- `.text-right`
- `.text-wrap`
- `.text-truncate`
- `.font-mono`
- `.text-uppercase`
- `.leading-tight`
- `.leading-normal`
- `.leading-relaxed`
- `.mt-4`
- `.clickable-title:hover`

## ⚠ Дубли внутри файла

- .form-group select (base) → forms.css:6, forms.css:21
- .pg-actions .btn-icon-link (base) → forms.css:132, forms.css:138
- .pg-actions .btn-icon-ai (base) → forms.css:132, forms.css:141
- .detail-table th (base) → forms.css:155, forms.css:157
- .detail-table td (base) → forms.css:155, forms.css:158
- .data-table td (@media (max-width: 767px)) → mobile.css:26, mobile.css:30
- .data-table th (base) → table.css:13, table.css:14
- .data-table td (base) → table.css:13, table.css:19
- h1 (base) → typography.css:6, typography.css:13
- h2 (base) → typography.css:6, typography.css:18
- h3 (base) → typography.css:6, typography.css:22
- h4 (base) → typography.css:6, typography.css:26
- h5 (base) → typography.css:6, typography.css:30
- h6 (base) → typography.css:6, typography.css:34

## ℹ Дубли между файлами

- .admin-tab — допущен: admin ↔ animations
- .dep-chip — допущен: admin ↔ animations
- .notes-grid — допущен: cards ↔ animations
- .table-view — допущен: table ↔ animations
- .modal-overlay — допущен: modals ↔ animations
- .modal — допущен: modals ↔ animations
- .tab-btn — допущен: layout ↔ animations: ::after индикатор
- .view-btn — допущен: layout ↔ animations
- .btn — допущен: buttons ↔ animations: transform
- .action-icon-btn — допущен: buttons ↔ animations
- .chip → animations.css:104, badges.css:83
- .btn:active — допущен: buttons ↔ animations: transform
- .btn:hover — допущен: buttons ↔ animations: transform
- .action-icon-btn:hover — допущен: buttons ↔ animations
- .fab-btn — допущен: buttons ↔ animations
- .toast — допущен: toasts ↔ animations
- * → animations.css:1, layout.css:1, reset.css:1
- *::before → animations.css:1, layout.css:1, reset.css:1
- *::after → animations.css:1, layout.css:1, reset.css:1
- .toast — допущен: toasts ↔ animations
- .fab-btn — допущен: buttons ↔ animations
- .btn — допущен: buttons ↔ animations: transform
- .action-icon-btn — допущен: buttons ↔ animations
- .app-layout — допущен: layout ↔ mobile
- .sidebar — допущен: layout ↔ mobile
- .topbar — допущен: layout ↔ mobile
- .search-bar — допущен: layout ↔ mobile
- .main-content — допущен: layout ↔ mobile

## 🔴 var() без определения

_нет_

## ⬜ Определения вне tokens.css

_нет_

## 🔵 Неиспользуемые токены

- `--gray-light`
- `--bg-elevated`
- `--shadow-xs`
- `--glass-border`
- `--radius-modal`
- `--st-neutral-bg`
- `--st-neutral-text`
- `--st-info-bg`
- `--st-brand-bg`
- `--st-brand-text`
- `--st-violet-bg`
- `--st-violet-text`
- `--space-8`
- `--space-12`
- `--z-base`
- `--ease-in`
- `--ease-out`
- `--breakpoint-mobile`
- `--breakpoint-tablet`
- `--breakpoint-narrow`
- `--breakpoint-compact`
- `--breakpoint-desktop`
- `--bx24-narrow`
- `--bx24-wide`

## 🚫 Запрещённые паттерны

- `table.css:32` — !important — `!important-перебивок */
 .data-table .action-icon-btn { back`

## 🎬 keyframes: нет определения

_нет_

## 📐 Breakpoints вне списка

_нет_

## 🧱 z-index вне шкалы

_нет_

## 📦 Не импортировано

_нет_

## 📦 Порядок @import

_нет_

## 🟡 HTML/JS-классы без CSS-покрытия

- .dark — JS
- .light — JS
- .unavail-check — JS
- .data-tab — JS
- .data-panel — JS
- .map-select — JS
- .dir-dep-check — JS
- .visible-check — JS
- .head-select — JS
- .mgr-select — JS
- .econ-check — JS
- .det-name — JS
- .det-purpose — JS
- .det-price — JS
- .det-qty — JS
- .bl-txt — JS
- .det-link — JS
- .det-supplier — JS
- .det-article — JS
- .det-note — JS
- .data-det-name — JS
- .data-det-purpose — JS
- .data-det-price — JS
- .data-det-qty — JS
- .data-det-total — JS
- .data-det-supplier — JS
- .data-det-link — JS
- .filled — JS
- .forward — JS
- .btn-approval-submit — JS
- .past-check — JS
- .postponed — JS
- .grid — JS
- .table — JS

## 🔴 Дубликаты ID

_нет_

## ⚠ Inline display:none

- строка 139: `display:none;`
- строка 219: `display:none;`
- строка 792: `display:none`
- строка 807: `display:none`
- строка 1221: `display:none;`

## Итог

❌ **Есть находки**
