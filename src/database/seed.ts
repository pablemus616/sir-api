import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MainModule } from '../main.module';
import { Role } from '../roles/role.entity';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { Sector } from '../sectors/sector.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { Permission } from '../roles/permission.entity';
import { allPermissionNames } from '../config/permissions.catalog';

async function ensureNamed<T extends { name: string }>(
  ds: DataSource,
  entity: { new (): T },
  names: string[],
): Promise<void> {
  const repo = ds.getRepository(entity);
  for (const name of names) {
    const found = await repo.findOne({ where: { name } as any });
    if (!found) await repo.save(repo.create({ name } as any));
  }
}

async function seedRoles(ds: DataSource): Promise<void> {
  await ensureNamed(ds, Role, ['admin', 'recruiter', 'agent']);
}

async function seedPermissions(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(Permission);
  for (const name of allPermissionNames()) {
    const found = await repo.findOne({ where: { name } });
    if (!found) await repo.save(repo.create({ name }));
  }
}

/** Sensible default grants per non-admin role (admin gets everything). */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  recruiter: [
    'dashboard:read',
    'clients:read',
    'opportunities:read:own',
    'candidates:read', 'candidates:create', 'candidates:update',
    'applications:read', 'applications:create', 'applications:update',
    'placements:read:own', 'placements:create', 'placements:update',
    'candidate-contacts:read:own', 'candidate-contacts:create', 'candidate-contacts:update',
    'sectors:read', 'position-areas:read', 'pipeline-stages:read', 'contact-types:read',
  ],
  agent: [
    'dashboard:read',
    'opportunities:read:own', 'opportunities:create', 'opportunities:update',
    'clients:read', 'clients:create', 'clients:update',
    'client-contacts:read', 'client-contacts:create', 'client-contacts:update',
    'contact-requests:read', 'contact-requests:update',
    'contact-history:read:own', 'contact-history:create',
    'sectors:read', 'position-areas:read', 'pipeline-stages:read', 'contact-types:read',
  ],
};

async function seedRolePermissions(ds: DataSource): Promise<void> {
  const roleRepo = ds.getRepository(Role);
  const permRepo = ds.getRepository(Permission);
  const allPerms = await permRepo.find();
  const byName = new Map(allPerms.map((p) => [p.name, p]));

  // admin always holds every permission (kept in sync as the catalog grows).
  const admin = await roleRepo.findOne({ where: { name: 'admin' }, relations: { permissions: true } });
  if (admin) {
    admin.permissions = allPerms;
    await roleRepo.save(admin);
  }

  // non-admin roles: add missing defaults without clobbering manual board edits.
  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await roleRepo.findOne({ where: { name: roleName }, relations: { permissions: true } });
    if (!role) continue;
    const existing = new Set((role.permissions ?? []).map((p) => p.name));
    const toAdd = permNames
      .map((n) => byName.get(n))
      .filter((p): p is Permission => !!p && !existing.has(p.name));
    if (toAdd.length) {
      role.permissions = [...(role.permissions ?? []), ...toAdd];
      await roleRepo.save(role);
    }
  }
}

async function seedContactTypes(ds: DataSource): Promise<void> {
  await ensureNamed(ds, ContactType, ['call', 'email', 'meeting', 'whatsapp']);
}

async function seedSectors(ds: DataSource): Promise<void> {
  await ensureNamed(ds, Sector, ['call center', 'BPO', 'retail', 'tecnología', 'manufactura']);
}

async function seedPositionAreas(ds: DataSource): Promise<void> {
  await ensureNamed(ds, PositionArea, ['IT', 'Ventas', 'Logística', 'RRHH', 'Finanzas', 'Operaciones']);
}

async function seedPipelineStages(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(PipelineStage);
  const stages = [
    { name: 'Contacto inicial', sortOrder: 1, probability: 10, isWon: false, isLost: false },
    { name: 'Calificado', sortOrder: 2, probability: 25, isWon: false, isLost: false },
    { name: 'Entrevista 1', sortOrder: 3, probability: 40, isWon: false, isLost: false },
    { name: 'Entrevista 2', sortOrder: 4, probability: 60, isWon: false, isLost: false },
    { name: 'Propuesta enviada', sortOrder: 5, probability: 75, isWon: false, isLost: false },
    { name: 'Negociación', sortOrder: 6, probability: 90, isWon: false, isLost: false },
    { name: 'Ganada', sortOrder: 7, probability: 100, isWon: true, isLost: false },
    { name: 'Perdida', sortOrder: 8, probability: 0, isWon: false, isLost: true },
  ];
  for (const stage of stages) {
    const found = await repo.findOne({ where: { name: stage.name } });
    if (!found) await repo.save(repo.create(stage));
  }
}

async function seedAdmin(ds: DataSource): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME ?? '';
  const rawPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!username || !rawPassword) return;

  const userRepo = ds.getRepository(User);
  const existing = await userRepo.findOne({ where: { username } });
  if (existing) return;

  const employeeRepo = ds.getRepository(Employee);
  const employee = await employeeRepo.save(employeeRepo.create({ firstName: 'Admin', lastName: 'SIR' }));

  const roleRepo = ds.getRepository(Role);
  const adminRole = await roleRepo.findOne({ where: { name: 'admin' } });

  const password = await bcrypt.hash(rawPassword, 10);
  const user = userRepo.create({ username, password, employeeId: employee.id, roles: adminRole ? [adminRole] : [] });
  await userRepo.save(user);
}

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MainModule);
  const ds = app.get(DataSource);
  await seedRoles(ds);
  await seedPermissions(ds);
  await seedRolePermissions(ds);
  await seedContactTypes(ds);
  await seedSectors(ds);
  await seedPositionAreas(ds);
  await seedPipelineStages(ds);
  await seedAdmin(ds);
  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
