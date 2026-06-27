import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { ContactRequestsModule } from '../src/contact-requests/contact-requests.module';
import { ContactRequest } from '../src/contact-requests/contact-request.entity';
import { GlobalResponseInterceptor } from '../src/config/global-response.interceptor';

describe('ContactRequests public endpoint (e2e)', () => {
  let app: NestFastifyApplication;
  const repo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 1, wasHandled: false, createdAt: new Date(), ...value })),
  };

  beforeAll(async () => {
    process.env.INBOUND_API_KEY = 'test-inbound-key';
    const moduleRef = await Test.createTestingModule({
      imports: [ContactRequestsModule],
    })
      .overrideProvider(getRepositoryToken(ContactRequest))
      .useValue(repo)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new GlobalResponseInterceptor());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    delete process.env.INBOUND_API_KEY;
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects POST without x-api-key', () => {
    return request(app.getHttpServer())
      .post('/api/contact-requests')
      .send({ contactName: 'Lead', email: 'lead@acme.com' })
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  it('creates the request with a valid x-api-key', () => {
    return request(app.getHttpServer())
      .post('/api/contact-requests')
      .set('x-api-key', 'test-inbound-key')
      .send({ contactName: 'Lead', email: 'lead@acme.com' })
      .expect(201)
      .expect((res) => {
        expect(res.body.data.id).toBe(1);
        expect(repo.save).toHaveBeenCalled();
      });
  });
});
