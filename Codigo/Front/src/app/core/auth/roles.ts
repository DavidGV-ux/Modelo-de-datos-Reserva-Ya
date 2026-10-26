export const USER_ROLES = {
  ADMIN: 'ry_admin',
  OWNER: 'ry_owner',
  PROFESSIONAL: 'ry_professional',
  CLIENT: 'ry_client',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// Roles de negocio que la API devuelve en TenantMembership.role / .roles.
// NO usan el prefijo "ry_" (a diferencia de los realm roles de Keycloak).
export const BUSINESS_ROLES = {
  OWNER: 'owner',
  PROFESSIONAL: 'professional',
  CLIENT: 'client',
} as const;

export type BusinessRole = (typeof BUSINESS_ROLES)[keyof typeof BUSINESS_ROLES];

export function parseRole(value: string | undefined | null): UserRole | undefined {
  if (!value) return undefined;
  return Object.values(USER_ROLES).find((r) => r === value);
}

const LABEL_ORDER: BusinessRole[] = [
  BUSINESS_ROLES.OWNER,
  BUSINESS_ROLES.PROFESSIONAL,
  BUSINESS_ROLES.CLIENT,
];

export function bestBusinessRole(roles: string[] | undefined): BusinessRole {
  const set = new Set(roles ?? []);
  for (const role of LABEL_ORDER) {
    if (set.has(role)) return role;
  }
  return BUSINESS_ROLES.CLIENT;
}