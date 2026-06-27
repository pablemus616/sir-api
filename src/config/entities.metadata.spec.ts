import { getMetadataArgsStorage } from 'typeorm';
import { Role } from '../roles/role.entity';
import { Permission } from '../roles/permission.entity';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { Session } from '../auth/session.entity';
import { Client } from '../clients/client.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Sector } from '../sectors/sector.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';

describe('Entities metadata', () => {
  const storage = getMetadataArgsStorage();
  const entities: Function[] = [
    Role,
    Permission,
    Employee,
    User,
    Session,
    Client,
    ClientContact,
    ContactType,
    ContactHistory,
    ContactRequest,
    Sector,
    PositionArea,
    PipelineStage,
    Opportunity,
    Candidate,
    Application,
    Placement,
  ];

  it('registers a table for every entity', () => {
    for (const entity of entities) {
      const table = storage.tables.find((t) => t.target === entity);
      expect(table).toBeDefined();
    }
  });

  it('maps session id as uuid primary column', () => {
    const pk = storage.columns.find(
      (c) => c.target === Session && c.propertyName === 'id',
    );
    expect(pk?.options.primary).toBe(true);
    expect(pk?.options.type).toBe('uuid');
  });

  it('binds contact history type to the contact_type join column', () => {
    const join = storage.joinColumns.find(
      (j) => j.target === ContactHistory && j.name === 'contact_type',
    );
    expect(join).toBeDefined();
  });

  it('declares the unique candidate and opportunity constraint on application', () => {
    const unique = storage.uniques.find((u) => u.target === Application);
    expect(unique?.columns).toEqual(['candidateId', 'opportunityId']);
  });

  it('uses join tables for role_permissions and user_roles', () => {
    const joinTableNames = storage.joinTables.map((j) => j.name);
    expect(joinTableNames).toContain('role_permissions');
    expect(joinTableNames).toContain('user_roles');
  });
});
