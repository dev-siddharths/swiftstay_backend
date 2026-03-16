import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginModule } from './login/login.module';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // loads .env
    LoginModule,
    DbModule,
    AuthModule,
    StudentsModule,
  ],
  controllers: [AppController, StudentsController],
  providers: [AppService, StudentsService],
})
export class AppModule {}
