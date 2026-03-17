import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy/jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
@Module({
  imports: [
    JwtModule.register({
      secret: 'superSecretKey',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  providers: [JwtStrategy, AuthService],
  exports: [JwtModule],
  controllers: [AuthController],
})
export class AuthModule {}
