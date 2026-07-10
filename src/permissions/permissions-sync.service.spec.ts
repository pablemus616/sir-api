import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Permission } from '../roles/permission.entity';
import { PermissionsSyncService } from './permissions-sync.service';
import { allPermissionNames } from '../config/permissions.catalog';

describe('PermissionsSyncService', () => {
  let service: PermissionsSyncService;
  let repo: { find: jest.Mock; insert: jest.Mock };

  beforeEach(async () => {
    repo = { find: jest.fn(), insert: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsSyncService,
        { provide: getRepositoryToken(Permission), useValue: repo },
      ],
    }).compile();
    service = module.get(PermissionsSyncService);
  });

  it('inserts every catalog permission when the table is empty', async () => {
    repo.find.mockResolvedValue([]);
    await service.onApplicationBootstrap();
    expect(repo.insert).toHaveBeenCalledTimes(1);
    const inserted = repo.insert.mock.calls[0][0];
    expect(inserted).toHaveLength(allPermissionNames().length);
    expect(inserted[0]).toEqual({ name: allPermissionNames()[0] });
  });

  it('is idempotent: inserts nothing when all permissions already exist', async () => {
    repo.find.mockResolvedValue(allPermissionNames().map((name) => ({ name })));
    await service.onApplicationBootstrap();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('inserts only the missing permissions', async () => {
    const all = allPermissionNames();
    repo.find.mockResolvedValue(all.slice(1).map((name) => ({ name })));
    await service.onApplicationBootstrap();
    expect(repo.insert).toHaveBeenCalledWith([{ name: all[0] }]);
  });
});
