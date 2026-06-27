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
