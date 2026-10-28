import { Test } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { type AuthUser } from '../config/current-user.decorator';

const user = (roles: string[]): AuthUser => ({
  userId: 1,
  employeeId: 7,
  roles,
  permissions: [],
  sessionId: 's',
});

describe('MetricsController', () => {
  let controller: MetricsController;
  let metrics: { placements: jest.Mock; commercial: jest.Mock };

  beforeEach(async () => {
    metrics = { placements: jest.fn(), commercial: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metrics }],
    }).compile();
    controller = module.get(MetricsController);
  });

  it('scopes placements of a non-admin by recruiter only, not by opportunity owner', async () => {
    await controller.placements({ from: '2026-10-01' }, user(['recruiter']));
    expect(metrics.placements).toHaveBeenCalledWith({ from: '2026-10-01', recruiterId: 7 });
  });

  it('passes the admin filters through untouched', async () => {
    await controller.placements({ responsibleEmployeeId: 3 }, user(['admin']));
    expect(metrics.placements).toHaveBeenCalledWith({ responsibleEmployeeId: 3 });
  });

  it('keeps forcing the opportunity owner on commercial metrics for non-admins', async () => {
    await controller.commercial({ responsibleEmployeeId: 3 }, user(['agent']));
    expect(metrics.commercial).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleEmployeeId: 7 }),
    );
  });
});
