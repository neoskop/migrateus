import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { MysqlExecutor } from '../../sql/mysql-executor.type.js';
import argon2 from 'argon2';
import { Credential } from './credential.type.js';
import { RedactService } from '../../redact/redact.service.js';
import {
  assertUuid,
  escapeMysqlString,
} from '../../sql/sql-escape.js';

@Injectable()
export class DirectusUserService {
  private password: string = nanoid(48);
  private username: string = `migrateus+${nanoid(6)}`;
  public token: string = nanoid(64);
  private roleId = uuidv4();
  private userId = uuidv4();
  private accessId = uuidv4();
  private policyId = uuidv4();

  constructor(private readonly redactService: RedactService) {
    this.redactService.addRedaction(this.password);
    this.redactService.addRedaction(this.token);
  }

  public async setupUser(execSql: MysqlExecutor) {
    const roleId = escapeMysqlString(this.roleId);
    const policyId = escapeMysqlString(this.policyId);
    const accessId = escapeMysqlString(this.accessId);
    const userId = escapeMysqlString(this.userId);
    const username = escapeMysqlString(this.username);
    const email = escapeMysqlString(`${this.username}@neoskop.de`);
    const token = escapeMysqlString(this.token);

    await execSql(
      `INSERT INTO directus_roles (id, name) VALUES (${roleId}, ${username})`,
    );
    await execSql(
      `INSERT INTO directus_policies (id, name, admin_access) VALUES (${policyId}, ${username}, 1)`,
    );
    await execSql(
      `INSERT INTO directus_access (id, role, policy) VALUES (${accessId}, ${roleId}, ${policyId})`,
    );
    const hash = escapeMysqlString(await argon2.hash(this.password));
    await execSql(
      [
        'INSERT INTO',
        'directus_users',
        '(id, first_name, last_name, email, password, role, token)',
        `VALUES (${userId}, 'Migrateus', 'User', ${email}, ${hash}, ${roleId}, ${token})`,
      ].join(' '),
    );
  }

  public async removeUser(execSql: MysqlExecutor) {
    const userId = escapeMysqlString(this.userId);
    const roleId = escapeMysqlString(this.roleId);
    const policyId = escapeMysqlString(this.policyId);
    const accessId = escapeMysqlString(this.accessId);

    await execSql(
      `UPDATE directus_files SET modified_by = null WHERE modified_by = ${userId}`,
    );
    await execSql(
      `DELETE FROM directus_users WHERE id = ${userId} LIMIT 1`,
    );
    await execSql(
      `DELETE FROM directus_roles WHERE id = ${roleId} LIMIT 1`,
    );
    await execSql(
      `DELETE FROM directus_policies WHERE id = ${policyId} LIMIT 1`,
    );
    await execSql(
      `DELETE FROM directus_access WHERE id = ${accessId} LIMIT 1`,
    );
  }

  public async setCredentials(
    credentials: Credential[],
    execSql: MysqlExecutor,
  ) {
    for (const credential of credentials) {
      const email = escapeMysqlString(credential.email);

      if (credential.token) {
        const token = escapeMysqlString(credential.token);
        await execSql(
          `UPDATE directus_users SET token = ${token} WHERE email = ${email}`,
        );
      }

      if (credential.password) {
        const hash = escapeMysqlString(await argon2.hash(credential.password));
        await execSql(
          `UPDATE directus_users SET password = ${hash} WHERE email = ${email}`,
        );
      }
    }
  }

  public async cleanUp(execSql: MysqlExecutor) {
    const userIds = (
      await execSql(
        `SELECT id from directus_users WHERE email LIKE 'migrateus%'`,
      )
    )
      .split('\n')
      .filter(Boolean)
      .map((id) => assertUuid(id, 'directus_users.id'));

    if (userIds.length > 0) {
      const escapedIds = userIds.map((id) => escapeMysqlString(id)).join(',');
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
        const policyId = escapeMysqlString(
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
