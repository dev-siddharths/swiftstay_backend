import { Body, Controller, Post } from '@nestjs/common';
import createUserDto from './dto/createUser.dto';
import { SignupService } from './signup.service';

@Controller('signup')
export class SignupController {
  constructor(private signupService: SignupService) {}
  @Post()
  createUser(@Body() data: createUserDto) {
    console.log('Incoming request body:', data);
    return this.signupService.createUser(data);
  }
}
