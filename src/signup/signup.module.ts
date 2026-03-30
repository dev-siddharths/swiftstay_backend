import { Module } from '@nestjs/common';
import { SignupService } from './signup.service';
import { SignupController } from './signup.controller';
import { DbModule } from 'src/db/db.module';

@Module({
  imports: [DbModule],
  providers: [SignupService],
  controllers: [SignupController],
})
export class SignupModule {}
