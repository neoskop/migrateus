import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { MysqlExecutor } from './mysql-executor.type.js';
import argon2 from 'argon2';

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
      `DELETE FROM directus_users WHERE id = '${this.userId}' LIMIT 1`,
    );
    await execSql(
      `DELETE FROM directus_roles WHERE id = '${this.roleId}' LIMIT 1`,
    );
  }
}
