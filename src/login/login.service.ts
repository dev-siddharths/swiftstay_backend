import { Injectable } from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import { CheckUserDto } from './dto/check-user.dto/check-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class LoginService {
  constructor(
    private db: DbService,
    private jwtService: JwtService,
  ) {}
  async checkLogin(data: CheckUserDto) {
    const result = await this.db.query(
      `SELECT id,name,email,password FROM "User" WHERE email = $1`,
      [data.email],
    );
    const rowsReturned = result.rows[0];
    if (!rowsReturned) {
      return { success: false, message: "User doesn't exist" };
    } else {
      const passwordMatch = await bcrypt.compare(
        data.password,
        rowsReturned.password,
      );
      if (!passwordMatch) {
        return { success: false, message: 'Password is incorrect' };
      } else {
        const payload = {
          id: rowsReturned.id,
          email: rowsReturned.email,
          naam: rowsReturned.name,
        };
        const token = this.jwtService.sign(payload);
        return {
          success: true,
          message: 'Login Successfull',
          token: token,
        };
      }
    }
  }
}
