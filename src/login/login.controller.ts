import { Body, Controller, Get, Post } from '@nestjs/common';
import { LoginService } from './login.service';
type formData = {
  email: string;
  password: string;
  remember?: boolean;
};
@Controller('login')
export class LoginController {
  constructor(private login: LoginService) {}

  @Post()
  checkLogin(@Body() data: formData) {
    return this.login.checkLogin(data);
  }
}
