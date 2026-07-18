import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { DbModule } from 'src/db/db.module';
import { AuthModule } from 'src/auth/auth.module';
import { AdminAuthController } from './auth/admin-auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth/admin-auth.service';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [DbModule, AuthModule, RedisModule], // ← ADD: DbModule (DbService) + AuthModule (JwtService)
  controllers: [RoomsController, AdminAuthController], // ← ADD AdminAuthController
  providers: [RoomsService, AdminAuthService], // ← ADD AdminAuthService
})
export class RoomsModule {}
