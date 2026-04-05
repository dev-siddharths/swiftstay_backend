import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  onModuleInit() {
    this.pool = new Pool({
      user: process.env.DB_USER, // DB username
      host: process.env.DB_HOST, // DB host, usually localhost
      database: process.env.DB_NAME, // DB name
      password: process.env.DB_PASS, // DB password
      port: Number(process.env.DB_PORT) || 5432,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }
  async query(sql: string, params?: any[]) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      client.release();
    }
  }
  async getClient() {
    return this.pool.connect();
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
