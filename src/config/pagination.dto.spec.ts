import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto, getSkipTake } from './pagination.dto';

describe('PaginationDto', () => {
  it('aplica defaults page=1 limit=20', () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('transforma strings de query a number', async () => {
    const dto = plainToInstance(PaginationDto, { page: '3', limit: '50' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza page menor a 1', async () => {
    const dto = plainToInstance(PaginationDto, { page: '0' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('getSkipTake calcula skip=(page-1)*limit y take=limit', () => {
    expect(getSkipTake(plainToInstance(PaginationDto, { page: '3', limit: '20' }))).toEqual({
      skip: 40,
      take: 20,
    });
  });
});
