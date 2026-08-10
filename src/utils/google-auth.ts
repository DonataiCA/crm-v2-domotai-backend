import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface GoogleUserInfo {
    sub: string; // Google user ID
    email: string;
    email_verified: boolean;
    name: string;
    given_name: string;
    family_name: string;
    picture: string;
    locale: string;
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo | null> {
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload) return null;

        return {
            sub: payload.sub,
            email: payload.email!,
            email_verified: payload.email_verified as boolean,
            name: payload.name!,
            given_name: payload.given_name!,
            family_name: payload.family_name!,
            picture: payload.picture!,
            locale: payload.locale!,
        };
    } catch (error) {
        console.error('Google token verification failed:', error);
        return null;
    }
}

