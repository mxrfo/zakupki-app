// js/state.js — Глобальное состояние приложения

// Данные из CRM
let actualFields = {};
let fieldDefs = {};
let items = [];
let spStages = {};
let spStagesSorted = [];
let departments = [];
let allUsers = [];
let currentUser = null;

// UI-состояние
let activeTab = 'my_requests';
let searchQuery = '';
let currentView = 'grid';
let currentSort = 'default';

// Текущий сценарий тестирования
let currentScenario = localStorage.getItem('purchase_scenario') || 'none';

// Роли и пользователи
let actualRoles = { isAdmin: false, isEcon: false, isManager: false };
let currentRole = 'admin';
let userNames = {};
let userDepts = {};

// Режимы и локальные данные
let isTestMode = false;
let customOrder = JSON.parse(localStorage.getItem('purchase_custom_order_1088')) || [];
let approvedAmounts = JSON.parse(localStorage.getItem('approved_amounts_1088')) || {};
let approvedInvoices = JSON.parse(localStorage.getItem('approved_invoices_1088')) || {};

// Флаг, что сценарий уже запущен для этой закупки (чтобы не дублировать)
let scenarioRunning = {};

// 🆕 Защита от дублирования задач "В работу"
let sendToWorkInProgress = {};

// 🆕 Защита от параллельной синхронизации менеджеров
let syncManagersInProgress = {};

// 🆕 Защита от параллельного loadAllData
let loadAllDataInProgress = false;