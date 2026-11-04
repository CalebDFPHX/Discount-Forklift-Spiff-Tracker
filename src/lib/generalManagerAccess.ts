import type { Branch, NotificationContact } from './repository.js';

export const GENERAL_MANAGER_ROLE = 'General Manager';

export function resolveGeneralManagerBranchIds(
  email: string,
  contacts: NotificationContact[],
  branches: Branch[]
): string[] {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [];

  const activeBranchIdsByName = new Map(
    branches
      .filter((branch) => branch.isActive)
      .map((branch) => [branch.name, branch.id])
  );
  const branchIds = new Set<string>();

  for (const contact of contacts) {
    if (
      !contact.isActive ||
      contact.role !== GENERAL_MANAGER_ROLE ||
      contact.email.trim().toLowerCase() !== normalizedEmail ||
      !contact.branch?.trim()
    ) {
      continue;
    }

    const branchId = activeBranchIdsByName.get(contact.branch.trim());
    if (branchId) branchIds.add(branchId);
  }

  return [...branchIds];
}

export function canGeneralManagerAccessAdminRoute(method: string, path: string): boolean {
  if (method.toUpperCase() === 'POST' && path === '/api/admin/change-password') return true;
  if (method.toUpperCase() !== 'GET') return false;

  return (
    path === '/api/admin/submissions' ||
    /^\/api\/admin\/submissions\/[^/]+$/.test(path) ||
    /^\/api\/admin\/attachments\/[^/]+\/(view|download)$/.test(path)
  );
}

export function getAdminTabsForRole(role: string): string[] {
  return role === GENERAL_MANAGER_ROLE
    ? ['ledger']
    : ['ledger', 'spiffs', 'reps', 'contacts', 'branches', 'settings'];
}
