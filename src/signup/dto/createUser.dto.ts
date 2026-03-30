import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

class createUserDto {
  @IsString()
  @MaxLength(100)
  fullName: string;
  @IsEmail()
  email: string;
  @IsString()
  @MinLength(8, { message: 'Minimum password required of length 8' })
  password: string;
}
export default createUserDto;
