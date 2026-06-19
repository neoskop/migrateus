import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { ExecOutputReturnValue } from 'shelljs';
import { deleteRole, deleteUser, RestClient } from '@directus/sdk';
import { Credential } from './credential.type.js';
import { RedactService } from '../../redact/redact.service.js';
import { assertUuid } from '../../sql/sql-escape.js';
import { DbDriver } from '../../sql/db-driver/db-driver.interface.js';
import { MysqlExecutor } from '../../sql/mysql-executor.type.js';
import { shquote } from '../../util/sh-quote.js';
import argon2 from 'argon2';

/** Runs a shell command inside the Directus container/pod and returns its output. */
export type ExecInDirectus = (
  command: string,
) => Promise<ExecOutputReturnValue>;

/** Builds an authenticated Directus SDK REST client for the given port/token. */
export type GetDirectusClient = (
  port: number,
  token: string,
) => RestClient<any>;

@Injectable()
export class DirectusUserService {
  private readonly password: string = nanoid(48);
  private readonly roleName: string = `migrateus+${nanoid(6)}`;
  private readonly email: string = `${this.roleName}@neoskop.local`;

  // The token is only known after logging in as the freshly created temp admin.
  public token: string;
  private roleId: string;
  private userId: string;

  // Stored during setupUser so removeUser can rebuild an authenticated client.
  private getClient: GetDirectusClient;
  private port: number;

  constructor(private readonly redactService: RedactService) {
    this.redactService.addRedaction(this.password);
  }

  /**
   * Creates an engine-agnostic temporary admin using the Directus CLI (which
   * talks straight to the database), then logs in as that admin to obtain an
   * access token. The token is stored on `this.token` for SDK consumers.
   */
  public async setupUser(
    execInDirectus: ExecInDirectus,
    getClient: GetDirectusClient,
    port: number,
  ): Promise<void> {
    this.getClient = getClient;
    this.port = port;

    const roleOutput = await execInDirectus(
      `node /directus/cli.js roles create --role ${shquote(this.roleName)} --admin`,
    );
    this.roleId = roleOutput.stdout.trim();

    const userOutput = await execInDirectus(
      `node /directus/cli.js users create --email ${shquote(this.email)} --password ${shquote(this.password)} --role ${shquote(this.roleId)}`,
    );
    this.userId = userOutput.stdout.trim();

    this.token = await this.login(port);
    this.redactService.addRedaction(this.token);
  }

  /**
   * Best-effort cleanup of the temporary admin via the SDK. The role is deleted
   * first (its deletion does not invalidate the token); the user is deleted last
   * because removing it kills the token. A failed role delete must not throw —
   * the leftover empty role is acceptable and is swept by the `clean` command.
   */
  public async removeUser(): Promise<void> {
    if (!this.userId || !this.token) {
      return;
    }
    const client = this.getClient(this.port, this.token);

    if (this.roleId) {
      try {
        await client.request(deleteRole(this.roleId));
      } catch {
        // Role may still be referenced (or already gone) — leave it; the
        // sweep-all `clean` command removes orphaned migrateus roles later.
      }
    }

    await client.request(deleteUser(this.userId));
  }

  private async login(port: number): Promise<string> {
    const response = await fetch(`http://localhost:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to log in as the temporary Directus admin (HTTP ${response.status})`,
      );
    }

    const body = (await response.json()) as {
      data?: { access_token?: string };
    };
    const token = body?.data?.access_token;
    if (!token) {
      throw new Error(
        'Directus login succeeded but returned no access_token for the temporary admin',
      );
    }
    return token;
  }

  public async setCredentials(
    credentials: Credential[],
    driver: DbDriver,
    execSql: MysqlExecutor,
  ) {
    for (const credential of credentials) {
      const email = driver.escapeString(credential.email);

      if (credential.token) {
        const token = driver.escapeString(credential.token);
        await execSql(
          `UPDATE directus_users SET token = ${token} WHERE email = ${email}`,
        );
      }

      if (credential.password) {
        const hash = driver.escapeString(await argon2.hash(credential.password));
        await execSql(
          `UPDATE directus_users SET password = ${hash} WHERE email = ${email}`,
        );
      }
    }
  }

  public async cleanUp(driver: DbDriver, execSql: MysqlExecutor) {
    const userIds = (
      await execSql(
        `SELECT id from directus_users WHERE email LIKE 'migrateus%'`,
      )
    )
      .split('\n')
      .filter(Boolean)
      .map((id) => assertUuid(id, 'directus_users.id'));

    if (userIds.length > 0) {
      const escapedIds = userIds.map((id) => driver.escapeString(id)).join(',');
      await execSql(
        `UPDATE directus_files SET modified_by = null WHERE modified_by IN (${escapedIds})`,
      );
    }

    await execSql(`DELETE FROM directus_users WHERE email LIKE 'migrateus%'`);
    await execSql(`DELETE FROM directus_roles WHERE name LIKE 'migrateus%'`);
    const policyIds = await execSql(
      `SELECT id FROM directus_policies WHERE name LIKE 'migrateus%'`,
    );

    for (const rawPolicyId of policyIds.split('\n')) {
      if (rawPolicyId) {
        const policyId = driver.escapeString(
          assertUuid(rawPolicyId, 'directus_policies.id'),
        );
        await execSql(
          `DELETE FROM directus_access WHERE policy = ${policyId}`,
        );
        await execSql(`DELETE FROM directus_policies WHERE id = ${policyId}`);
      }
    }
  }
}
