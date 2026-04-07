import { Body, Controller, Post } from '@nestjs/common';
import { LoginService } from './login.service';
import { CheckUserDto } from './dto/check-user.dto/check-user.dto';

@Controller('login')
export class LoginController {
  constructor(private login: LoginService) {}

  @Post()
  checkLogin(@Body() data: CheckUserDto) {
    return this.login.checkLogin(data);
  }
}
