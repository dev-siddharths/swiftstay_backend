import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginModule } from './login/login.module';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { RoomController } from './room/room.controller';
import { RoomService } from './room/room.service';
import { RoomModule } from './room/room.module';
import { SignupModule } from './signup/signup.module';
import { BookingModule } from './booking/booking.module';
import { RedisService } from './redis/redis.service';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // loads .env
    LoginModule,
    DbModule,
    AuthModule,
    RoomModule,
    SignupModule,
    BookingModule,
    RedisModule,
  ],
  controllers: [AppController, RoomController],
  providers: [AppService, RoomService, RedisService],
})
export class AppModule {}
