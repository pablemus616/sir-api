import { SnakeNamingStrategy } from './snake-naming.strategy';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('convierte el nombre de clase a snake_case cuando no hay customName', () => {
    expect(strategy.tableName('Opportunity', undefined as unknown as string)).toBe('opportunity');
  });

  it('respeta el customName de tabla', () => {
    expect(strategy.tableName('Opportunity', 'opportunities')).toBe('opportunities');
  });

  it('convierte propiedades camelCase a columnas snake_case', () => {
    expect(strategy.columnName('firstName', undefined as unknown as string, [])).toBe('first_name');
    expect(strategy.columnName('employeeId', undefined as unknown as string, [])).toBe('employee_id');
  });

  it('respeta el customName de columna (JoinColumn name)', () => {
    expect(strategy.columnName('contactType', 'contact_type', [])).toBe('contact_type');
  });

  it('genera FKs e índices de join en snake_case', () => {
    expect(strategy.joinColumnName('employee', 'id')).toBe('employee_id');
    expect(strategy.joinTableColumnName('role', 'id')).toBe('role_id');
  });
});
