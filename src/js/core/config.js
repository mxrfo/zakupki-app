// js/config.js — Константы, ID сущностей, маппинги полей

// ✅ Идентификатор сборки. В исходниках — заглушка 'AUTO'.
// build.js при каждой сборке подставляет сюда timestamp, равный имени архива,
// чтобы приложение детектировало новый архив и само пересоздавало бота.
let APP_BUILD_ID = 'AUTO';

// ID сущностей Битрикс24
let ENTITY_TYPE_ID = 1072;
let INVOICE_ENTITY_ID = 1068;
let currentCategoryId = 65;
let systemUserId = 175;

let appBaseUrl = window.location.href.split('?')[0];

const DEFAULT_MAPPING = {
  amountProduct: 'ufCrm17_1793003295949',
  amountDelivery: 'ufCrm17_1794583137',
  section: 'ufCrm17_1793345894',
  direction: 'ufCrm17_1793345945',
  combinedDir: 'ufCrm17_1793365487',
  deadlineZakup: 'ufCrm17_1794310032566',
  deadlinePay: 'ufCrm17_1793018096910',
  fileInvoice: 'ufCrm17_1793018051305',
  creator: 'ufCrm17_1793859756',
  comment: 'ufCrm17_COMM',
  shortDesc: 'ufCrm17_1793017330493',
  detailName: 'ufCrm17_1792761243',
  detailPurpose: 'ufCrm17_1792761268',
  detailPrice: 'UF_CRM_17_PRICE_ED',
  detailQty: 'ufCrm17_1792998488',
  detailLink: 'ufCrm17_1792761300',
  postponeDate: 'ufCrm17_1794583117',
  manager: 'ufCrm17_OTDEL_ISPOL_SOTR',
  deptHead: 'ufCrm17_OTDEL_ISPOL_RUK',
  approver: 'ufCrm17_1793003413',
  taskVyborSotr: 'ufCrm17_TECH_ZAD_VYBSOTR',
  taskSbor: 'ufCrm17_TECH_ZAD_SBOR',
  taskZagruz: 'ufCrm17_TECH_ZAD_ZAGRUZ',
  delegateHistory: 'ufCrm17_TECH_DELEG'
};

const INVOICE_MAPPING = {
  invoiceTitle: 'ufCrm15_1792415120',
  invoiceSum: 'ufCrm15_1792415602934',
  invoicePayFor: 'ufCrm15_1792417801123',
  invoiceFile: 'ufCrm15_1792415233',
  invoiceDeadline: 'ufCrm15_KRAY'
};

const CACHE_KEY = 'purchase_app_meta_cache_1088';

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
  deadlineYellowDays: 7,
  unavailableUsers: [],
  lastBuildId: '',
  lastHandlerUrl: ''
};