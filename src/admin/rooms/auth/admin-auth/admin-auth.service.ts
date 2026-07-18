import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AdminAuthService {
  private client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(private jwt: JwtService) {}

  async loginWithGoogle(credential: string) {
    const ticket = await this.client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email: string | undefined = payload?.email?.toLowerCase();

    const allowed: string[] = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => {
        return e.trim().toLowerCase();
      });

    if (!email || !allowed.includes(email)) {
      throw new UnauthorizedException('Not an authorized email');
    }

    const token = this.jwt.sign({ email, role: 'admin' });
    return { success: true, token };
  }
}
