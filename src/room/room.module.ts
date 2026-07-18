import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { DbModule } from 'src/db/db.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [DbModule, RedisModule],
  providers: [RoomService],
  controllers: [RoomController],
})
export class RoomModule {}
