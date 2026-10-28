import { type ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { GlobalExceptionFilter } from './global-exception.filter';

function makeHost() {
  const rep = { code: jest.fn().mockReturnThis(), send: jest.fn() };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ url: '/api/clients/1' }), getResponse: () => rep }),
  } as unknown as ArgumentsHost;
  return { host, rep };
}

const pgError = (message: string, code: string) =>
  new QueryFailedError('SQL', [], Object.assign(new Error(message), { code }));

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('answers 409 when deleting a row that other rows still reference', () => {
    const { host, rep } = makeHost();
    filter.catch(
      pgError('update or delete on table "clients" violates foreign key constraint "FK_x" on table "opportunities"', '23503'),
      host,
    );
    expect(rep.code).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(rep.send).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, message: 'Cannot delete: it has related records' }),
    );
  });

  it('answers 400 when inserting a reference to a row that does not exist', () => {
    const { host, rep } = makeHost();
    filter.catch(
      pgError('insert or update on table "opportunities" violates foreign key constraint "FK_x"', '23503'),
      host,
    );
    expect(rep.code).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(rep.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Related record not found' }));
  });

  it('answers 409 on a unique violation', () => {
    const { host, rep } = makeHost();
    filter.catch(pgError('duplicate key value violates unique constraint "UQ_x"', '23505'), host);
    expect(rep.code).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(rep.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Record already exists' }));
  });

  it('keeps other query errors as a generic 500', () => {
    const { host, rep } = makeHost();
    filter.catch(pgError('syntax error at or near "x"', '42601'), host);
    expect(rep.code).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(rep.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });

  it('still passes HttpExceptions through', () => {
    const { host, rep } = makeHost();
    filter.catch(new NotFoundException('Client not found'), host);
    expect(rep.code).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(rep.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Client not found' }));
  });
});
