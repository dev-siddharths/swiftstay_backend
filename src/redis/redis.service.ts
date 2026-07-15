import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: RedisClientType = createClient({
    url: process.env.REDIS_URL,
  });

  async onModuleInit() {
    this.client.on('error', (err) => {
      console.log('Redis Client Error', err);
    });
    await this.client.connect();
    console.log('Redis Connected Successfully');
  }

  async onModuleDestroy() {
    await this.client.quit();
    console.log('Redis Connection Closed');
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
