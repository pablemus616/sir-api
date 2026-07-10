/**
 * Single source of truth for the role-based permission taxonomy.
 *
 * A permission is a string `"<module>:<action>"` (e.g. `clients:read`). Ownable
 * modules additionally get a `"<module>:read:own"` variant that grants read of
 * only the records the user owns (vs `"<module>:read"` = all). Scope therefore
 * lives entirely in the permission strings — no extra tables/columns.
 */

export const ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type PermissionAction = (typeof ACTIONS)[number];

export interface ModuleDef {
  /** Machine key; matches the frontend nav module and the REST resource. */
  key: string;
  /** Spanish label shown on the permissions board. */
  label: string;
  /** Nav group the module belongs to. */
  group: 'General' | 'Comercial' | 'Reclutamiento' | 'Catálogos' | 'Admin';
  /** Supports the `own`/`all` read scope (has an owner employee column). */
  ownable?: boolean;
  /** Actions available for this module (defaults to all four). */
  actions?: PermissionAction[];
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'General', actions: ['read'] },
  { key: 'opportunities', label: 'Oportunidades', group: 'Comercial', ownable: true },
  { key: 'clients', label: 'Clientes', group: 'Comercial' },
  { key: 'client-contacts', label: 'Contactos', group: 'Comercial' },
  { key: 'contact-requests', label: 'Solicitudes', group: 'Comercial' },
  { key: 'contact-history', label: 'Historial', group: 'Comercial', ownable: true },
  { key: 'candidates', label: 'Candidatos', group: 'Reclutamiento' },
  { key: 'applications', label: 'Aplicaciones', group: 'Reclutamiento' },
  { key: 'placements', label: 'Placements', group: 'Reclutamiento', ownable: true },
  { key: 'candidate-contacts', label: 'Interacciones', group: 'Reclutamiento', ownable: true },
  { key: 'sectors', label: 'Sectores', group: 'Catálogos' },
  { key: 'position-areas', label: 'Áreas', group: 'Catálogos' },
  { key: 'pipeline-stages', label: 'Etapas', group: 'Catálogos' },
  { key: 'contact-types', label: 'Tipos de contacto', group: 'Catálogos' },
  { key: 'employees', label: 'Empleados', group: 'Admin' },
  { key: 'users', label: 'Usuarios', group: 'Admin' },
  { key: 'roles', label: 'Roles', group: 'Admin' },
  { key: 'permissions', label: 'Permisos', group: 'Admin' },
];

export function actionsFor(m: ModuleDef): PermissionAction[] {
  return m.actions ?? [...ACTIONS];
}

/** All permission strings in the catalog (module:action + module:read:own). */
export function allPermissionNames(): string[] {
  const out: string[] = [];
  for (const m of MODULES) {
    for (const a of actionsFor(m)) out.push(`${m.key}:${a}`);
    if (m.ownable) out.push(`${m.key}:read:own`);
  }
  return out;
}

export function moduleByKey(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}
