import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { DirectusUserService } from './directus-user.service.js';

function build() {
  const redact = { addRedaction: jest.fn() };
  const service = new DirectusUserService(redact as never);
  return { service, redact };
}

interface ExecOutput {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Fake `execInDirectus` that returns the supplied stdout lines in order (the
 * Directus CLI prints the created role id, then the created user id).
 */
function makeExec(stdouts: string[]) {
  const calls: string[] = [];
  let i = 0;
  const fn = jest.fn(async (command: string) => {
    calls.push(command);
    const stdout = stdouts[i] ?? '';
    i += 1;
    return { code: 0, stdout, stderr: '' } satisfies ExecOutput;
  });
  return { fn, calls };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('DirectusUserService constructor', () => {
  it('redacts the password up-front (the token is only known after login)', () => {
    const { redact } = build();
    expect(redact.addRedaction).toHaveBeenCalledTimes(1);
  });
});

describe('DirectusUserService.setupUser', () => {
  it('creates an admin role then a user via the Directus CLI, in order, and logs in for a token', async () => {
    const { service } = build();
    const { fn, calls } = makeExec(['role-id-123\n', 'user-id-456\n']);
    const getClient = jest.fn();

    const loginFetch = jest.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ data: { access_token: 'tok-from-login' } }),
        }) as never,
    );
    globalThis.fetch = loginFetch as never;

    await service.setupUser(fn as never, getClient as never, 8055);

    // Two CLI commands ran, in order: roles create --admin, then users create.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('roles create');
    expect(calls[0]).toContain('--admin');
    expect(calls[1]).toContain('users create');
    // The user-create command references the parsed role id from the first call.
    expect(calls[1]).toContain('role-id-123');
    // The login response token is stored on the public `token` field.
    expect(service.token).toBe('tok-from-login');
  }, 20000);

  it('logs in with the generated email/password against the given port', async () => {
    const { service } = build();
    const { fn } = makeExec(['r1\n', 'u1\n']);

    let loginUrl = '';
    let loginBody: any;
    const loginFetch = jest.fn(async (url: string, init: any) => {
      loginUrl = url;
      loginBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ data: { access_token: 'tok' } }),
      } as never;
    });
    globalThis.fetch = loginFetch as never;

    await service.setupUser(fn as never, jest.fn() as never, 9000);

    expect(loginUrl).toBe('http://localhost:9000/auth/login');
    expect(loginBody.email).toMatch(/^migrateus\+.+@neoskop\.local$/);
    expect(typeof loginBody.password).toBe('string');
    expect(loginBody.password.length).toBeGreaterThan(0);
  }, 20000);

  it('redacts the access token after login', async () => {
    const { service, redact } = build();
    const { fn } = makeExec(['r1\n', 'u1\n']);
    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ data: { access_token: 'secret-token' } }),
      }) as never) as never;

    await service.setupUser(fn as never, jest.fn() as never, 8055);

    expect(redact.addRedaction).toHaveBeenCalledWith('secret-token');
  }, 20000);

  it('throws when the login response is not ok', async () => {
    const { service } = build();
    const { fn } = makeExec(['r1\n', 'u1\n']);
    globalThis.fetch = (async () =>
      ({ ok: false, status: 401, json: async () => ({}) }) as never) as never;

    await expect(
      service.setupUser(fn as never, jest.fn() as never, 8055),
    ).rejects.toThrow(/401/);
  }, 20000);
});

describe('DirectusUserService.removeUser', () => {
  it('deletes the temp user via the SDK client obtained with the stored token', async () => {
    const { service } = build();
    const { fn } = makeExec(['role-id-123\n', 'user-id-456\n']);

    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ data: { access_token: 'tok' } }),
      }) as never) as never;

    const request = jest.fn(async () => undefined);
    const client = { request };
    const getClient = jest.fn(() => client);

    await service.setupUser(fn as never, getClient as never, 8055);
    await service.removeUser();

    // The client was obtained with the stored token, and request was invoked
    // (the user delete must run).
    expect(getClient).toHaveBeenCalledWith(8055, 'tok');
    expect(request).toHaveBeenCalled();
  }, 20000);

  it('does not throw when role deletion fails (best-effort cleanup) and still deletes the user', async () => {
    const { service } = build();
    const { fn } = makeExec(['r1\n', 'u1\n']);
    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ data: { access_token: 'tok' } }),
      }) as never) as never;

    let call = 0;
    const request = jest.fn(async () => {
      call += 1;
      // First request (role delete) rejects; user delete still must run.
      if (call === 1) throw new Error('role delete failed');
      return undefined;
    });
    const getClient = jest.fn(() => ({ request }));

    await service.setupUser(fn as never, getClient as never, 8055);

    await expect(service.removeUser()).resolves.toBeUndefined();
    // Both delete attempts were made despite the first failing.
    expect(request.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 20000);

  it('is a no-op when setupUser was never called (no token/user)', async () => {
    const { service } = build();
    await expect(service.removeUser()).resolves.toBeUndefined();
  });
});

describe('DirectusUserService.setCredentials (unchanged, SQL-based)', () => {
  function fakeDriver() {
    return {
      escapeString: (v: string) => `'${v}'`,
    } as never;
  }
  function makeSqlExecutor() {
    const calls: string[] = [];
    const fn = jest.fn(async (sql: string) => {
      calls.push(sql);
      return '';
    });
    return { fn, calls };
  }

  it('does nothing for empty list', async () => {
    const { service } = build();
    const { fn } = makeSqlExecutor();
    await service.setCredentials([], fakeDriver(), fn as never);
    expect(fn).not.toHaveBeenCalled();
  });

  it('updates only token when only token provided', async () => {
    const { service } = build();
    const { fn, calls } = makeSqlExecutor();
    await service.setCredentials(
      [{ email: 'a@b.c', token: 'tok' } as never],
      fakeDriver(),
      fn as never,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(
      "UPDATE directus_users SET token = 'tok' WHERE email = 'a@b.c'",
    );
  });

  it('updates only password when only password provided', async () => {
    const { service } = build();
    const { fn, calls } = makeSqlExecutor();
    await service.setCredentials(
      [{ email: 'a@b.c', password: 'pw' } as never],
      fakeDriver(),
      fn as never,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(
      /^UPDATE directus_users SET password = '\$argon2id\$[^']+' WHERE email = 'a@b\.c'$/,
    );
  }, 20000);
});

describe('DirectusUserService.cleanUp (unchanged, SQL-based sweep)', () => {
  function fakeDriver() {
    return {
      escapeString: (v: string) => `'${v}'`,
    } as never;
  }
  function makeSqlExecutor(replies: string[] = []) {
    const calls: string[] = [];
    let i = 0;
    const fn = jest.fn(async (sql: string) => {
      calls.push(sql);
      const out = replies[i] ?? '';
      i += 1;
      return out;
    });
    return { fn, calls };
  }

  it('updates files and runs deletes when user-ids are valid UUIDs', async () => {
    const { service } = build();
    const u1 = '550e8400-e29b-41d4-a716-446655440000';
    const u2 = '550e8400-e29b-41d4-a716-446655440001';
    const policy = '550e8400-e29b-41d4-a716-44665544aaaa';
    const replies = [`${u1}\n${u2}\n`, ``, ``, ``, `${policy}\n`, ``, ``];
    const { fn, calls } = makeSqlExecutor(replies);

    await service.cleanUp(fakeDriver(), fn as never);

    expect(calls[0]).toContain('SELECT id from directus_users');
    expect(calls[1]).toContain(`('${u1}','${u2}')`);
    expect(
      calls.some((c) =>
        c.includes(`DELETE FROM directus_access WHERE policy = '${policy}'`),
      ),
    ).toBe(true);
  });

  it('throws if a returned user id is not a UUID, before any UPDATE', async () => {
    const { service } = build();
    const replies = [`not-a-uuid\n`];
    const { fn, calls } = makeSqlExecutor(replies);

    await expect(service.cleanUp(fakeDriver(), fn as never)).rejects.toThrow(
      /Invalid UUID for directus_users\.id/,
    );
    expect(calls.some((c) => c.startsWith('UPDATE directus_files'))).toBe(false);
  });
});
