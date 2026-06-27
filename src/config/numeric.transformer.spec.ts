import { ColumnNumericTransformer } from './numeric.transformer';

describe('ColumnNumericTransformer', () => {
  const transformer = new ColumnNumericTransformer();

  it('from parsea el string de Postgres a number', () => {
    expect(transformer.from('1500.50')).toBe(1500.5);
  });

  it('from devuelve null cuando el valor es null o undefined', () => {
    expect(transformer.from(null)).toBeNull();
    expect(transformer.from(undefined)).toBeNull();
  });

  it('to deja pasar el number hacia la columna', () => {
    expect(transformer.to(2000)).toBe(2000);
  });

  it('to devuelve null cuando el valor es null o undefined', () => {
    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeNull();
  });
});
