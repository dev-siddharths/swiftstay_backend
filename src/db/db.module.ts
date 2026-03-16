import { Module } from '@nestjs/common';
import { DbService } from './db.service';

@Module({
  providers: [DbService],
  exports: [DbService], // so other modules can use it
})
export class DbModule {}
