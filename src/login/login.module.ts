import { Module } from '@nestjs/common';
import { LoginService } from './login.service';
import { LoginController } from './login.controller';
import { DbModule } from '../db/db.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [DbModule, AuthModule],
  providers: [LoginService],
  controllers: [LoginController],
})
export class LoginModule {}
