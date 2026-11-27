import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

// Глобалы проекта (vanilla JS, всё в window)
const projectGlobals = {
  // config.js (writable — init.js перезаписывает при старте)
  ENTITY_TYPE_ID: "writable",
  currentCategoryId: "writable",
  systemUserId: "writable",
  APP_BUILD_ID: "readonly",
  DEFAULT_MAPPING: "writable",
  CACHE_KEY: "readonly",
  BOT_NAME: "readonly",
  GROUP_CHAT_TITLE: "readonly",

  // state.js
  items: "writable",
  currentUser: "writable",
  currentRole: "writable",
  settings: "writable",
  departments: "writable",
  allUsers: "writable",
  userNames: "writable",
  userDepts: "writable",
  spStages: "writable",
  spStagesSorted: "writable",
  actualFields: "writable",
  fieldDefs: "writable",
  activeTab: "writable",
  currentSort: "writable",
  currentView: "writable",
  searchQuery: "writable",
  customOrder: "writable",
  isTestMode: "writable",
  currentScenario: "writable",
  simulatedHeadDeptId: "writable",
  adminActiveTab: "writable",
  approvedAmounts: "writable",
  approvedInvoices: "writable",
  lastBotStatus: "writable",
  _topPurposes: "writable",
  _topSuppliers: "writable",
  actualRoles: "writable",

  // utils.js
  parseAmount: "readonly",
  formatMoney: "readonly",
  cleanText: "readonly",
  getShortDesc: "readonly",
  getDisplayValue: "readonly",
  getDeadlineDisplay: "readonly",
  getFileInfo: "readonly",
  resolveCombinedDir: "readonly",
  calculateTotalAmount: "readonly",
  calculateRowTotal: "readonly",
  escapeHtml: "readonly",
  getApiErrorMessage: "readonly",
  getStageIdByName: "readonly",
  getCreatorInfo: "readonly",
  isUserUnavailable: "readonly",
  resolveDeptHeadId: "readonly",
  updateHeaderSum: "readonly",
  buildItemSuggestions: "readonly",
  renderEmptyState: "readonly",
  calculateAllTotals: "readonly",
  maybeAutoFillShortDesc: "readonly",
  createStep: "readonly",
  renderCreateSummary: "readonly",
  addDetailRow: "readonly",
  onDetNameInput: "readonly",
  ICON_AI: "readonly",

  // api/bot.js + notifications
  notifyUserViaBot: "readonly",
  notifyGroupStatus: "readonly",
  notifySelectExecutor: "readonly",
  notifyReworkNeeded: "readonly",
  notifyAfterDecision: "readonly",
  notifyInvoiceEvent: "readonly",
  notifyInvoiceUploaded: "readonly",
  notifyDataChangedOnApproval: "readonly",
  notifyApprovalNeeded: "readonly",
  notifyCollectData: "readonly",
  groupStatusNotify: "readonly",
  buildAppLink: "readonly",
  getBotHandlerUrl: "readonly",
  resetAutoChat: "readonly",
  sendBotNotification: "readonly",
  buildTitle: "readonly",
  greetUser: "readonly",
  buildBody: "readonly",
  getPortalDomain: "readonly",
  clearBotCache: "readonly",

  // api/core.js
  BX24: "readonly",

  // api/cache.js
  invalidateSuggestions: "readonly",

  // api/sync.js
  b24Ready: "writable",
  loadAllDataInProgress: "writable",
  syncManagersInProgress: "writable",
  deleteInProgress: "writable",

  // api/scenarios.js
  scenarioRunning: "writable",
  runScenarioAfterCreate: "readonly",

  // api/url-handler.js
  handleUrlParams: "readonly",
  lastHandledItemId: "writable",
  urlParamsProcessed: "writable",

  // api/delegate.js
  delegateHistory: "writable",

  // api/group-status.js
  formatDeadline: "readonly",
  getMgrInfo: "readonly",

  // api/absence.js + bot.js
  saveSettingsToBoth: "readonly",

  // logic/roles.js
  toggleTestMode: "readonly",
  simulateRole: "readonly",
  isManagerRole: "readonly",
  render: "readonly",
  checkUserRoles: "readonly",
  refreshUnavailableUsers: "readonly",

  // logic/actions.js
  sendToWorkInProgress: "readonly",
  rollbackItem: "readonly",

  // logic/settings/*
  saveSettings: "readonly",
  switchAdminTab: "readonly",
  renderSettingsTable: "readonly",
  renderListDependencies: "readonly",
  renderMappingSettings: "readonly",
  renderFieldsStatus: "readonly",
  renderUnavailableUsers: "readonly",
  renderBotStatus: "readonly",
  refreshUnavailableUsersForce: "readonly",
  autoMapFields: "readonly",
  createField: "readonly",
  runManualAbsenceCheck: "readonly",
  forceCreateBot: "readonly",
  testBotSend: "readonly",
  resetBotChat: "readonly",

  // ui/dragdrop.js
  handleDragStart: "readonly",
  handleDragOver: "readonly",
  handleDrop: "readonly",
  handleDragEnd: "readonly",

  // ui/render.js
  renderGrid: "readonly",
  renderTable: "readonly",
  switchTab: "readonly",
  onSearchChange: "readonly",
  changeSort: "readonly",
  switchView: "readonly",

  // ui/modals/*
  closeModal: "readonly",
  deleteItem: "readonly",
  deletePurchaseWithCleanup: "readonly",
  openViewModal: "readonly",
  openActionModal: "readonly",
  openDelegateModal: "readonly",
  openExecutorModal: "readonly",
  openDataModal: "readonly",
  openUploadModal: "readonly",
  openEditAmountModal: "readonly",
  openPastItemsModal: "readonly",
  addSelectedPastItems: "readonly",
  renderPastItems: "readonly",
  delegatePurchase: "readonly",
  initResizableTable: "readonly",

  // ui/forms/*
  submitCreateRequest: "readonly",
  validateCreateStep: "readonly",
  goCreateStep: "readonly",
  nextCreateStep: "readonly",
  prevCreateStep: "readonly",
  tryGoCreateStep: "readonly",

  // core/init.js
  loadAllData: "readonly",
  showToast: "readonly",
  logAction: "readonly",
  toggleTheme: "readonly",
};

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...projectGlobals,
      },
    },
    rules: {
      // В vanilla JS функции часто экспортируются через window.func = func
      // ESLint не видит такого использования — отключаем
      "no-unused-vars": "off",
      // Пустые catch-блоки — частый паттерн в REST-обёртках
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
]);