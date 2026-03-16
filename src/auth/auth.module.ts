import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
// import { JwtStrategy } from './jwt.strategy';
@Module({
  imports: [
    JwtModule.register({
      secret: 'superSecretKey',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  // providers:[JwtS]
  exports: [JwtModule],
})
export class AuthModule {}
