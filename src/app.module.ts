import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginModule } from './login/login.module';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { RoomModule } from './room/room.module';
import { SignupModule } from './signup/signup.module';
import { BookingModule } from './booking/booking.module';
import { RedisModule } from './redis/redis.module';
import { RoomsModule } from './admin/rooms/rooms.module';

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
    RoomsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
