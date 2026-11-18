// js/roles.js — Роли и права доступа

// 🆕 Отдел, за которым «симулируется» руководитель (для currentRole==='head')
let simulatedHeadDeptId = '';

function toggleTestMode(val) {
  isTestMode = val;
  localStorage.setItem('purchase_test_mode', isTestMode);
  logAction(isTestMode ? 'Включен режим тестирования' : 'Выключен режим тестирования', 'info');
  showToast(isTestMode ? 'Режим тестирования ВКЛ' : 'Режим тестирования ВЫКЛ');
  render();
}

function checkUserRoles() {
  if (!currentUser) return;

  actualRoles.isEcon = actualRoles.isAdmin;
  let userDeptIds = currentUser.UF_DEPARTMENT || [];
  if (!Array.isArray(userDeptIds)) userDeptIds = userDeptIds ? [userDeptIds] : [];
  userDeptIds.forEach(dId => {
    if (settings.econDepts.includes(String(dId))) actualRoles.isEcon = true;
  });

  if (!document.getElementById('role-viewer').value || document.getElementById('role-viewer').value === 'admin') {
    currentRole = actualRoles.isAdmin ? 'admin' : (actualRoles.isEcon ? 'econ' : 'employee');
    document.getElementById('role-viewer').value = currentRole;
  }

  let roleName = 'Сотрудник';
  if (currentRole === 'admin') roleName = 'Администратор';
  else if (currentRole === 'econ') roleName = 'Экономист';
  else if (currentRole === 'manager') roleName = 'Менеджер';
  else if (currentRole === 'head') roleName = 'Руководитель';

  let userDeptName = userDepts[currentUser.ID] || '';
  if (userDeptIds.length > 0 && !userDeptName) {
    const firstDeptId = userDeptIds[0];
    userDeptName = settings.deptShortNames[firstDeptId] || (departments.find(d => String(d.ID) === String(firstDeptId))?.NAME || '');
  }

  document.getElementById('user-display').innerHTML =
    `<b>${currentUser.NAME} ${currentUser.LAST_NAME}</b> (${roleName}${userDeptName ? ' • ' + userDeptName : ''})`;
}

// ✅ Симуляция роли: для head подставляем отдел пользователя как «ведомый»
function simulateRole(role) {
  currentRole = role;
  if (role === 'head') {
    let d = currentUser && currentUser.UF_DEPARTMENT ? (Array.isArray(currentUser.UF_DEPARTMENT) ? currentUser.UF_DEPARTMENT[0] : currentUser.UF_DEPARTMENT) : '';
    if (!d && settings.visibleDepts && settings.visibleDepts.length) d = settings.visibleDepts[0];
    simulatedHeadDeptId = d ? String(d) : '';
  } else {
    simulatedHeadDeptId = '';
  }
  checkUserRoles();
  render();
}

function isManagerRole(item) {
  if (currentRole === 'admin') return true;
  if (currentRole === 'manager') return true;

  const mgrVal = item[actualFields.manager];
  const mgrIds = Array.isArray(mgrVal) ? mgrVal : (mgrVal ? [mgrVal] : []);
  if (mgrIds.some(id => String(id) === String(currentUser.ID))) return true;

  const deptVal = item[actualFields.dept];
  if (deptVal) {
    const deptId = Array.isArray(deptVal) ? deptVal[0] : deptVal;
    if (settings.deptHeads[deptId] === String(currentUser.ID)) return true;
    if (settings.deptManagers[deptId] === String(currentUser.ID)) return true;
    const deptObj = departments.find(d => String(d.ID) === String(deptId));
    if (deptObj && String(deptObj.UF_HEAD) === String(currentUser.ID)) return true;
  }
  return false;
}