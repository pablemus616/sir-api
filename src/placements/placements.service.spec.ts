import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PlacementsService } from './placements.service';
import { Placement } from './placement.entity';
import { Application } from '../applications/application.entity';
import { Opportunity } from '../opportunities/opportunity.entity';

describe('PlacementsService', () => {
  let service: PlacementsService;
  let placements: jest.Mocked<Repository<Placement>>;
  let applications: jest.Mocked<Repository<Application>>;
  let opportunities: jest.Mocked<Repository<Opportunity>>;

  const user = { userId: 1, employeeId: 7, roles: ['recruiter'], sessionId: 's' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacementsService,
        {
          provide: getRepositoryToken(Placement),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve({ id: 10, ...entity })),
            count: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Application),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
        {
          provide: getRepositoryToken(Opportunity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
          },
        },
      ],
    }).compile();

    service = module.get(PlacementsService);
    placements = module.get(getRepositoryToken(Placement));
    applications = module.get(getRepositoryToken(Application));
    opportunities = module.get(getRepositoryToken(Opportunity));
  });

  it('throws NotFoundException when application does not exist', async () => {
    applications.findOne.mockResolvedValue(null);
    await expect(
      service.create({ applicationId: 1, placementDate: '2026-06-26' } as any, user as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when a placement already exists for the application', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'hired',
    } as Application);
    // La verdad es la fila de placement, no la etapa.
    placements.findOne.mockResolvedValue({ id: 99, applicationId: 1 } as Placement);
    await expect(
      service.create(
        { applicationId: 1, placementDate: '2026-06-26' } as any,
        user as any,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('registers the placement for an application already hired without one, without re-saving the stage', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'hired',
    } as Application);
    placements.findOne.mockResolvedValue(null);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 2, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    // Ya estaba 'hired': no se reintenta el movimiento de etapa...
    expect(applications.save).not.toHaveBeenCalled();
    // ...pero sí se registra el placement que faltaba.
    expect(placements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 3,
        opportunityId: 4,
        placedByEmployeeId: 7,
      }),
    );
  });

  it('sets application stage to hired and seals placedByEmployeeId from current user', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'offer',
    } as Application);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 2, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    expect(applications.save).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'hired' }),
    );
    expect(placements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 3,
        opportunityId: 4,
        placedByEmployeeId: 7,
      }),
    );
  });

  it('closes opportunity as won when active placements reach headcount', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'offer',
    } as Application);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 1, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    expect(opportunities.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'won', wonAt: expect.any(Date) }),
    );
  });

  it('keeps opportunity open when active placements are below headcount', async () => {
    applications.findOne.mockResolvedValue({
      id: 1,
      candidateId: 3,
      opportunityId: 4,
      stage: 'offer',
    } as Application);
    opportunities.findOne.mockResolvedValue({ id: 4, headcount: 3, status: 'open' } as Opportunity);
    placements.count.mockResolvedValue(1);

    await service.create(
      { applicationId: 1, placementDate: '2026-06-26' } as any,
      user as any,
    );

    expect(opportunities.save).not.toHaveBeenCalled();
  });
});
