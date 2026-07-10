import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../roles/permission.entity';
import { allPermissionNames } from '../config/permissions.catalog';

/**
 * Garantiza que la tabla `permissions` contenga TODAS las definiciones del
 * catálogo (código) al arrancar la app. Es idempotente e inserta solo lo que
 * falta; NUNCA toca `role_permissions`, así que las asignaciones por rol (las
 * que se editan en el board) quedan intactas.
 *
 * Antes esto dependía de correr el seed a mano: si no se corría, la tabla
 * quedaba vacía y el board no podía mapear nombre→id, por lo que los toggles no
 * hacían nada. Sincronizar en el arranque elimina esa dependencia.
 */
@Injectable()
export class PermissionsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly repo: Repository<Permission>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const names = allPermissionNames();
    const existing = await this.repo.find({
      where: { name: In(names) },
      select: { name: true },
    });
    const have = new Set(existing.map((p) => p.name));
    const missing = names.filter((n) => !have.has(n));
    if (missing.length === 0) return;
    await this.repo.insert(missing.map((name) => ({ name })));
    this.logger.log(
      `Catálogo de permisos sincronizado: ${missing.length} permiso(s) creado(s)`,
    );
  }
}
