import { Body, Controller, Post } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private admin_auth_service: AdminAuthService) {}

  @Post('google')
  google(@Body('credential') credential: string) {
    return this.admin_auth_service.loginWithGoogle(credential);
  }
}
