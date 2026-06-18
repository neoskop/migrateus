import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.unstable_mockModule('../util/exec.js', () => ({
  exec: jest.fn<() => Promise<{ code: number; stdout: string; stderr: string }>>().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
}));

const { ConfigService } = await import('./config.service.js');

function makeService() {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const redactService = { addRedaction: jest.fn() };
  const onepasswordService = {
    isLoggedIn: jest.fn<() => boolean>().mockReturnValue(false),
  };
  return new ConfigService(logger as any, redactService as any, onepasswordService as any);
}

async function withTempConfigFile(content: string, fn: (filePath: string) => Promise<void>) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'migrateus-test-'));
  const filePath = path.join(tmpDir, 'migrateus.yml');
  await fs.promises.writeFile(filePath, content, 'utf8');
  try {
    await fn(filePath);
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
    await fs.promises.rmdir(tmpDir).catch(() => {});
  }
}

describe('ConfigService', () => {
  it('is exported as a class', () => {
    expect(ConfigService).toBeDefined();
    expect(typeof ConfigService).toBe('function');
  });

  describe('loadConfigFile() — ${ENV_VAR} interpolation from process.env', () => {
    let savedEnvVars: Record<string, string | undefined>;

    beforeEach(() => {
      savedEnvVars = {};
    });

    afterEach(() => {
      for (const [key, val] of Object.entries(savedEnvVars)) {
        if (val === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = val;
        }
      }
    });

    function setEnv(key: string, value: string) {
      savedEnvVars[key] = process.env[key];
      process.env[key] = value;
    }

    function unsetEnv(key: string) {
      savedEnvVars[key] = process.env[key];
      delete process.env[key];
    }

    it('replaces ${MY_TOKEN} in yaml string values with the process.env value', async () => {
      setEnv('MIGRATEUS_TEST_TOKEN', 'secret-token-value');

      const yamlContent = `environments:\n  - name: prod\n    token: \${MIGRATEUS_TEST_TOKEN}\n`;

      await withTempConfigFile(yamlContent, async (filePath) => {
        const service = makeService();
        service.configFilePath = filePath;
        service.envFilePath = path.join(path.dirname(filePath), '.env-nonexistent');
        await service.loadConfigFile();

        const envs = service.getEnvironments();
        expect((envs[0] as any).token).toBe('secret-token-value');
      });
    });

    it('replaces ${MISSING_VAR} with empty string when var is not in process.env (yaml parses as null)', async () => {
      unsetEnv('MIGRATEUS_TEST_MISSING_VAR');

      const yamlContent = `environments:\n  - name: prod\n    token: \${MIGRATEUS_TEST_MISSING_VAR}\n`;

      await withTempConfigFile(yamlContent, async (filePath) => {
        const service = makeService();
        service.configFilePath = filePath;
        service.envFilePath = path.join(path.dirname(filePath), '.env-nonexistent');
        await service.loadConfigFile();

        const envs = service.getEnvironments();
        // ${MISSING_VAR} → '' → YAML parses bare empty value as null
        expect((envs[0] as any).token).toBeNull();
      });
    });

    it('does not disturb $VAR (no braces) interpolation from envConfig alongside ${VAR}', async () => {
      setEnv('MIGRATEUS_TEST_TOKEN_B', 'from-process-env');

      const yamlContent = `environments:\n  - name: prod\n    a: $MIGRATEUS_TOKEN_A\n    b: \${MIGRATEUS_TEST_TOKEN_B}\n`;

      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'migrateus-test-'));
      const configPath = path.join(tmpDir, 'migrateus.yml');
      const envPath = path.join(tmpDir, '.env');
      await fs.promises.writeFile(configPath, yamlContent, 'utf8');
      await fs.promises.writeFile(envPath, 'MIGRATEUS_TOKEN_A=from-dotenv\n', 'utf8');

      try {
        const service = makeService();
        service.configFilePath = configPath;
        service.envFilePath = envPath;
        await service.loadConfigFile();

        const envs = service.getEnvironments();
        expect((envs[0] as any).a).toBe('from-dotenv');
        expect((envs[0] as any).b).toBe('from-process-env');
      } finally {
        await fs.promises.unlink(configPath).catch(() => {});
        await fs.promises.unlink(envPath).catch(() => {});
        await fs.promises.rmdir(tmpDir).catch(() => {});
      }
    });
  });
});
