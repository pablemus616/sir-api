import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const makeContext = (headers: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

  const guard = new ApiKeyGuard();

  beforeEach(() => {
    process.env.INBOUND_API_KEY = 'secret-key';
  });

  afterEach(() => {
    delete process.env.INBOUND_API_KEY;
  });

  it('passes when x-api-key matches INBOUND_API_KEY', () => {
    expect(guard.canActivate(makeContext({ 'x-api-key': 'secret-key' }))).toBe(
      true,
    );
  });

  it('rejects when x-api-key does not match', () => {
    expect(guard.canActivate(makeContext({ 'x-api-key': 'wrong' }))).toBe(
      false,
    );
  });

  it('rejects when x-api-key is missing', () => {
    expect(guard.canActivate(makeContext({}))).toBe(false);
  });

  it('rejects when INBOUND_API_KEY is unset and the header is missing', () => {
    delete process.env.INBOUND_API_KEY;
    expect(guard.canActivate(makeContext({}))).toBe(false);
  });
});
