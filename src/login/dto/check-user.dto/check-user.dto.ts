import { IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';

export class CheckUserDto {
  @IsEmail()
  email: string;
  @IsString()
  @MinLength(6)
  password: string;
  @IsBoolean()
  remember?: boolean;
}
