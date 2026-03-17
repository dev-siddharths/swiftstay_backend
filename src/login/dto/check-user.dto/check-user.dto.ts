import { IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';

export class CheckUserDto {
  @IsEmail()
  email: string;
  @IsString()
  @MinLength(6, { message: 'Minimum password required of length 6' })
  password: string;
}
