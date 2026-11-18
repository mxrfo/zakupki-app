// js/config.js — Константы, ID сущностей, маппинги полей

// ID сущностей Битрикс24
let ENTITY_TYPE_ID = 1072;
let INVOICE_ENTITY_ID = 1068;
let currentCategoryId = 65;
let systemUserId = 175; // ID пользователя для уведомлений (бот)

// Базовый URL приложения
let appBaseUrl = window.location.href.split('?')[0];

// Маппинг полей по умолчанию (Закупки)
const DEFAULT_MAPPING = {
  amountProduct: 'ufCrm17_1793003295949',   // Сумма закупки
  amountDelivery: 'ufCrm17_1794583137',     // Доставка
  section: 'ufCrm17_1793345894',            // Раздел направления расхода
  direction: 'ufCrm17_1793345945',          // Направление расхода
  combinedDir: 'ufCrm17_1793365487',        // Раздел+Направление
  deadlineZakup: 'ufCrm17_1794310032566',   // Крайний срок закупки
  deadlinePay: 'ufCrm17_1793018096910',     // Крайний срок оплаты
  fileInvoice: 'ufCrm17_1793018051305',     // Копия счёта (файл)
  creator: 'ufCrm17_1793859756',            // Кто создал запрос
  comment: 'ufCrm17_COMM',                  // Комментарий
  shortDesc: 'ufCrm17_1793017330493',       // ✅ ИСПРАВЛЕНО: Что нужно закупить (Кратко)
  detailName: 'ufCrm17_1792761243',         // Наименование товара
  detailPurpose: 'ufCrm17_1792761268',      // Цель использования
  detailPrice: 'UF_CRM_17_PRICE_ED',        // Цена за 1 ед.
  detailQty: 'ufCrm17_1792998488',          // Количество
  detailLink: 'ufCrm17_1792761300',         // Ссылка на товар
  postponeDate: 'ufCrm17_1794583117',       // ✅ ИСПРАВЛЕНО: Дата отложения

  // 🆕 Ролевые и технические поля
  manager: 'ufCrm17_OTDEL_ISPOL_SOTR',      // Менеджер отдела (привязка к сотруднику)
  deptHead: 'ufCrm17_OTDEL_ISPOL_RUK',      // Руководитель отдела-исполнителя
  approver: 'ufCrm17_1793003413',           // Согласующий сумму
  taskVyborSotr: 'ufCrm17_TECH_ZAD_VYBSOTR',// ID задачи по выбору сотрудника
  taskSbor: 'ufCrm17_TECH_ZAD_SBOR',        // ID задачи по сбору данных
  taskZagruz: 'ufCrm17_TECH_ZAD_ZAGRUZ'     // ID задачи по загрузке счёта
};

// Маппинг полей Входящих счетов
const INVOICE_MAPPING = {
  invoiceTitle: 'ufCrm15_1792415120',
  invoiceSum: 'ufCrm15_1792415602934',
  invoicePayFor: 'ufCrm15_1792417801123',
  invoiceFile: 'ufCrm15_1792415233',
  invoiceDeadline: 'ufCrm15_KRAY'
};

// Ключ кэша в localStorage
const CACHE_KEY = 'purchase_app_meta_cache_1088';

// Настройки приложения (по умолчанию)
let settings = {
  categoryId: 65,
  entityTypeId: 1072,
  invoiceEntityTypeId: 1068,
  systemUserId: 175,
  clientId: '',
  clientSecret: '',
  deptHeads: {},
  deptManagers: {},
  deptShortNames: {},
  visibleDepts: [],
  econDepts: [],
  listDependencies: {},
  mapping: { ...DEFAULT_MAPPING },
  deadlineRedDays: 3,
  deadlineYellowDays: 7
};