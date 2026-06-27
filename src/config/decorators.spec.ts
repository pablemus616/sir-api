import { Reflector } from '@nestjs/core';
import { Public, IS_PUBLIC_KEY } from './public.decorator';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('auth decorators', () => {
  const reflector = new Reflector();

  it('Public sets isPublic metadata to true', () => {
    class Target {
      @Public()
      handler() {}
    }
    expect(reflector.get(IS_PUBLIC_KEY, Target.prototype.handler)).toBe(true);
  });

  it('Roles sets the roles metadata array', () => {
    class Target {
      @Roles('admin', 'agent')
      handler() {}
    }
    expect(reflector.get(ROLES_KEY, Target.prototype.handler)).toEqual([
      'admin',
      'agent',
    ]);
  });
});
