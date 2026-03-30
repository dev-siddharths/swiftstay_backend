import { IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';

export class CheckUserDto {
  @IsEmail()
  email: string;
  @IsString()
  @MinLength(8, { message: 'Minimum password required of length 8' })
  password: string;
}
