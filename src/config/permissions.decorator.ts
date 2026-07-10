import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from './permissions.catalog';
import type { AuthUser } from './current-user.decorator';

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  module: string;
  action: PermissionAction;
}

/**
 * Marks a route as requiring `<module>:<action>`. Enforced by PermissionsGuard.
 * Users with the `admin` role bypass the check.
 */
export const RequirePermission = (module: string, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { module, action } as RequiredPermission);

/**
 * Effective read scope for an ownable module: `all` if the role can read every
 * record, `own` if it may only read the ones it owns. Admin always reads all.
 * Defaults to `all` (the guard has already verified some read access).
 */
export function dataScopeFor(user: AuthUser, moduleKey: string): 'own' | 'all' {
  if (user.roles?.includes('admin')) return 'all';
  if (user.permissions?.includes(`${moduleKey}:read`)) return 'all';
  if (user.permissions?.includes(`${moduleKey}:read:own`)) return 'own';
  return 'all';
}
