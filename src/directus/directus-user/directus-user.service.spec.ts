import {
  describe,
  it,
  expect,
  jest,
} from '@jest/globals';
import { DirectusUserService } from './directus-user.service.js';

function build() {
  const redact = { addRedaction: jest.fn() };
  const service = new DirectusUserService(redact as never);
  return { service, redact };
}

function makeExecutor(replies: string[] = []) {
  const calls: string[] = [];
  let i = 0;
  const fn = jest.fn(async (sql: string) => {
    calls.push(sql);
    const out = replies[i] ?? '';
    i += 1;
    return out;
  }) as unknown as jest.Mock<(sql: string) => Promise<string>>;
  return { fn, calls };
}

describe('DirectusUserService constructor', () => {
  it('redacts the password and the token', () => {
    const { redact } = build();
    expect(redact.addRedaction).toHaveBeenCalledTimes(2);
  });
});

describe('DirectusUserService.setupUser', () => {
  it('emits 4 statements with quoted/escaped values only', async () => {
    const { service } = build();
    const { fn, calls } = makeExecutor();

    await service.setupUser(fn as never);

    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatch(
      /^INSERT INTO directus_roles \(id, name\) VALUES \('[^']+', '[^']+'\)$/,
    );
    expect(calls[1]).toMatch(
      /^INSERT INTO directus_policies \(id, name, admin_access\) VALUES \('[^']+', '[^']+', 1\)$/,
    );
    expect(calls[2]).toMatch(
      /^INSERT INTO directus_access \(id, role, policy\) VALUES \('[^']+', '[^']+', '[^']+'\)$/,
    );
    expect(calls[3]).toContain("VALUES ('");
    expect(calls[3]).toContain("'Migrateus'");
    expect(calls[3]).toContain("'User'");
  }, 20000);
});

describe('DirectusUserService.removeUser', () => {
  it('emits 5 DELETE/UPDATE with the userId quoted', async () => {
    const { service } = build();
    const { fn, calls } = makeExecutor();

    await service.removeUser(fn as never);

    expect(calls).toHaveLength(5);
    expect(calls[0]).toMatch(
      /^UPDATE directus_files SET modified_by = null WHERE modified_by = '[^']+'$/,
    );
    expect(calls[1]).toMatch(
      /^DELETE FROM directus_users WHERE id = '[^']+' LIMIT 1$/,
    );
    expect(calls[2]).toMatch(
      /^DELETE FROM directus_roles WHERE id = '[^']+' LIMIT 1$/,
    );
    expect(calls[3]).toMatch(
      /^DELETE FROM directus_policies WHERE id = '[^']+' LIMIT 1$/,
    );
    expect(calls[4]).toMatch(
      /^DELETE FROM directus_access WHERE id = '[^']+' LIMIT 1$/,
    );
  });
});

describe('DirectusUserService.setCredentials', () => {
  it('does nothing for empty list', async () => {
    const { service } = build();
    const { fn } = makeExecutor();
    await service.setCredentials([], fn as never);
    expect(fn).not.toHaveBeenCalled();
  });

  it('updates only token when only token provided', async () => {
    const { service } = build();
    const { fn, calls } = makeExecutor();

    await service.setCredentials(
      [{ email: 'a@b.c', token: 'tok' } as never],
      fn as never,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(
      "UPDATE directus_users SET token = 'tok' WHERE email = 'a@b.c'",
    );
  });

  it('updates only password when only password provided', async () => {
    const { service } = build();
    const { fn, calls } = makeExecutor();

    await service.setCredentials(
      [{ email: 'a@b.c', password: 'pw' } as never],
      fn as never,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(
      /^UPDATE directus_users SET password = '\$argon2id\$[^']+' WHERE email = 'a@b\.c'$/,
    );
  }, 20000);

  it('updates both when both provided', async () => {
    const { service } = build();
    const { fn, calls } = makeExecutor();

    await service.setCredentials(
      [{ email: 'a@b.c', token: 'tok', password: 'pw' } as never],
      fn as never,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('SET token =');
    expect(calls[1]).toContain('SET password =');
  }, 20000);
});

describe('DirectusUserService.cleanUp', () => {
  it('updates files and runs deletes when user-ids are valid UUIDs', async () => {
    const { service } = build();
    const u1 = '550e8400-e29b-41d4-a716-446655440000';
    const u2 = '550e8400-e29b-41d4-a716-446655440001';
    const policy = '550e8400-e29b-41d4-a716-44665544aaaa';
    const replies = [`${u1}\n${u2}\n`, ``, ``, ``, `${policy}\n`, ``, ``];
    const { fn, calls } = makeExecutor(replies);

    await service.cleanUp(fn as never);

    expect(calls[0]).toContain('SELECT id from directus_users');
    expect(calls[1]).toContain(`('${u1}','${u2}')`);
    expect(calls[1]).toMatch(
      /UPDATE directus_files SET modified_by = null WHERE modified_by IN/,
    );
    expect(
      calls.some((c) =>
        c.includes(`DELETE FROM directus_access WHERE policy = '${policy}'`),
      ),
    ).toBe(true);
    expect(
      calls.some((c) =>
        c.includes(`DELETE FROM directus_policies WHERE id = '${policy}'`),
      ),
    ).toBe(true);
  });

  it('throws if a returned user id is not a UUID, before any UPDATE', async () => {
    const { service } = build();
    const replies = [`not-a-uuid\n`];
    const { fn, calls } = makeExecutor(replies);

    await expect(service.cleanUp(fn as never)).rejects.toThrow(
      /Invalid UUID for directus_users\.id/,
    );
    expect(calls.some((c) => c.startsWith('UPDATE directus_files'))).toBe(
      false,
    );
  });

  it('throws if a returned policy id is not a UUID', async () => {
    const { service } = build();
    const replies = [``, ``, ``, `not-a-uuid\n`];
    const { fn } = makeExecutor(replies);

    await expect(service.cleanUp(fn as never)).rejects.toThrow(
      /Invalid UUID for directus_policies\.id/,
    );
  });
});
