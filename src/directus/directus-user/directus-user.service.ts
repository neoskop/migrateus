import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { MysqlExecutor } from '../../sql/mysql-executor.type.js';
import argon2 from 'argon2';
import { Credential } from './credential.type.js';

@Injectable()
export class DirectusUserService {
  private password: string = nanoid(48);
  private username: string = `migrateus+${nanoid(6)}`;
  public token: string = nanoid(64);
  private roleId = uuidv4();
  private userId = uuidv4();

  constructor() {}

  public async setupUser(execSql: MysqlExecutor) {
    await execSql(
      `INSERT INTO directus_roles (id, name, admin_access) VALUES ('${this.roleId}', '${this.username}', 1)`,
    );
    const hash = await argon2.hash(this.password);
    await execSql(
      [
        'INSERT INTO',
        'directus_users',
        '(id, first_name, last_name, email, password, role, token)',
        `VALUES ('${this.userId}', 'Migrateus', 'User', '${this.username}@neoskop.de', '${hash}', '${this.roleId}', '${this.token}')`,
      ].join(' '),
    );
  }

  public async removeUser(execSql: MysqlExecutor) {
    await execSql(
      `UPDATE directus_files SET modified_by = null WHERE modified_by = '${this.userId}'`,
    );
    await execSql(
      `DELETE FROM directus_users WHERE id = '${this.userId}' LIMIT 1`,
    );
    await execSql(
      `DELETE FROM directus_roles WHERE id = '${this.roleId}' LIMIT 1`,
    );
  }

  public async setCredentials(
    credentials: Credential[],
    execSql: MysqlExecutor,
  ) {
    for (const credential of credentials) {
      if (credential.token) {
        await execSql(
          `UPDATE directus_users SET token = '${credential.token}' WHERE email = '${credential.email}'`,
        );
      }

      if (credential.password) {
        const hash = await argon2.hash(credential.password);
        await execSql(
          `UPDATE directus_users SET password = '${hash}' WHERE email = '${credential.email}'`,
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
      .filter(Boolean);

    if (userIds.length > 0) {
      await execSql(
        `UPDATE directus_files SET modified_by = null WHERE modified_by IN (${userIds.map((userId) => `'${userId}'`).join(',')})`,
      );
    }

    await execSql(`DELETE FROM directus_users WHERE email LIKE 'migrateus%'`);
    await execSql(`DELETE FROM directus_roles WHERE name LIKE 'migrateus%'`);
  }
}
