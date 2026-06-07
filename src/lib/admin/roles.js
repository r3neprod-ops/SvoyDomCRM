export const ROLE_LABELS = {
  owner: 'Владелец',
  admin: 'Админ',
  manager: 'Руководитель',
  marketer: 'Маркетолог',
  agent: 'Агент',
  tech: 'Техспециалист',
  employee: 'Сотрудник',
};

export const ROLE_OPTIONS = [
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'manager', label: ROLE_LABELS.manager },
  { value: 'agent', label: ROLE_LABELS.agent },
  { value: 'marketer', label: ROLE_LABELS.marketer },
  { value: 'tech', label: ROLE_LABELS.tech },
  { value: 'employee', label: ROLE_LABELS.employee },
];

export const VALID_ROLES = new Set(Object.keys(ROLE_LABELS));
export const TEAM_MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
export const LEAD_MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
export const REPORT_VIEWER_ROLES = new Set(['owner', 'admin', 'manager', 'marketer']);
export const ALL_LEADS_VIEWER_ROLES = new Set(['owner', 'admin', 'manager', 'marketer']);

export function normalizeRole(value, fallback = 'agent') {
  const role = String(value || '').trim().toLowerCase();
  return VALID_ROLES.has(role) ? role : fallback;
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || ROLE_LABELS.employee;
}

export function canManageTeam(user) {
  return TEAM_MANAGER_ROLES.has(user?.role);
}

export function canManageLeads(user) {
  return LEAD_MANAGER_ROLES.has(user?.role);
}

export function canViewReports(user) {
  return REPORT_VIEWER_ROLES.has(user?.role);
}

export function canViewAllLeads(user) {
  return ALL_LEADS_VIEWER_ROLES.has(user?.role);
}

export function isOwner(user) {
  return user?.role === 'owner';
}
