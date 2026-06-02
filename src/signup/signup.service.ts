import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DbService } from 'src/db/db.service';
import createUserDto from './dto/createUser.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SignupService {
  constructor(private db: DbService) {}
  async createUser(data: createUserDto) {
    try {
      // Check whether this specific email is already registered.
      const email = data.email;
      const res = await this.db.query(
        `select email from "User" where email = $1`,
        [email],
      );
      if (res.rows.length > 0) {
        throw new ConflictException('Email already exists');
      } else {
        const password = data.password;
        // Hash the password before storing it in the database.
        async function hashPassword(password: string) {
          const saltRounds = 10;
          return await bcrypt.hash(password, saltRounds);
        }
        const hashedPassword = await hashPassword(password);
        const res = await this.db.query(
          `insert into "User"(name,email,password) values($1,$2,$3)`,
          [data.fullName, data.email, hashedPassword],
        );
        // INSERT returns rowCount, which tells us how many rows were added.
        if (res.rowCount === 1) {
          return { success: true, message: 'User successfully created' };
        } else {
          throw new InternalServerErrorException('Could not create user');
        }
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      } else {
        throw new InternalServerErrorException('Internal Server Error');
      }
    }
  }
}
