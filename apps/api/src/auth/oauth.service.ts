import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuthResult, AuthService } from './auth.service';

/**
 * Hand-rolled OAuth code flows (no passport) so providers stay flag-gated by env:
 * a provider with no client id configured returns 503 instead of breaking boot.
 */
@Injectable()
export class OAuthService {
  constructor(private readonly auth: AuthService) {}

  private apiUrl() {
    return process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
  }

  newState(): string {
    return randomBytes(16).toString('hex');
  }

  googleEnabled() {
    return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  }

  facebookEnabled() {
    return !!process.env.FACEBOOK_APP_ID && !!process.env.FACEBOOK_APP_SECRET;
  }

  googleAuthUrl(state: string): string {
    if (!this.googleEnabled()) {
      throw new ServiceUnavailableException('Google login is not configured');
    }
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${this.apiUrl()}/api/v1/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleGoogleCallback(code: string): Promise<AuthResult> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${this.apiUrl()}/api/v1/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new BadRequestException('Google token exchange failed');
    const data = (await res.json()) as { id_token?: string };
    if (!data.id_token) throw new BadRequestException('Missing id_token');

    const claims = JSON.parse(
      Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8'),
    ) as { aud: string; sub: string; email?: string; name?: string; picture?: string };
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new BadRequestException('Invalid id_token audience');
    }
    return this.auth.upsertSocialUser('GOOGLE', claims.sub, {
      email: claims.email,
      name: claims.name ?? 'Player',
      avatarUrl: claims.picture,
    });
  }

  facebookAuthUrl(state: string): string {
    if (!this.facebookEnabled()) {
      throw new ServiceUnavailableException('Facebook login is not configured');
    }
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      redirect_uri: `${this.apiUrl()}/api/v1/auth/facebook/callback`,
      state,
      scope: 'email,public_profile',
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  }

  async handleFacebookCallback(code: string): Promise<AuthResult> {
    const tokenParams = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: `${this.apiUrl()}/api/v1/auth/facebook/callback`,
      code,
    });
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams}`,
    );
    if (!tokenRes.ok) {
      throw new BadRequestException('Facebook token exchange failed');
    }
    const { access_token } = (await tokenRes.json()) as {
      access_token: string;
    };
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture&access_token=${access_token}`,
    );
    if (!meRes.ok) throw new BadRequestException('Facebook profile fetch failed');
    const me = (await meRes.json()) as {
      id: string;
      name: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };
    return this.auth.upsertSocialUser('FACEBOOK', me.id, {
      email: me.email,
      name: me.name,
      avatarUrl: me.picture?.data?.url,
    });
  }
}
