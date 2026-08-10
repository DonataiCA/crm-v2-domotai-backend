import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

// Apple's public keys endpoint
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

export interface AppleUserInfo {
    sub: string; // Apple user ID
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
}

export async function verifyAppleToken(idToken: string): Promise<AppleUserInfo | null> {
    try {
        // For development/testing, allow a mock token
        if (idToken === 'mock-apple-token-for-testing' && process.env.NODE_ENV === 'development') {
            return {
                sub: '123456789012345678901.apple',
                email: 'test.user@privaterelay.appleid.com',
                email_verified: true,
                name: 'Test User',
                given_name: 'Test',
                family_name: 'User'
            };
        }

        // Decode the JWT header to get the key ID
        const decodedHeader = jwt.decode(idToken, { complete: true });
        if (!decodedHeader || typeof decodedHeader === 'string') {
            return null;
        }

        const { kid } = decodedHeader.header;
        if (!kid) {
            return null;
        }

        // Fetch Apple's public keys
        const response = await fetch(APPLE_KEYS_URL);
        const keys = await response.json();

        // Find the matching key
        const key = keys.keys.find((k: any) => k.kid === kid);
        if (!key) {
            return null;
        }

        // Convert JWK to PEM format
        const publicKey = jwkToPem(key);

        // Verify the token
        const payload = jwt.verify(idToken, publicKey, {
            algorithms: ['RS256'],
            audience: process.env.APPLE_CLIENT_ID, // Your Apple App ID
            issuer: 'https://appleid.apple.com'
        }) as any;

        return {
            sub: payload.sub,
            email: payload.email,
            email_verified: payload.email_verified,
            name: payload.name,
            given_name: payload.given_name,
            family_name: payload.family_name
        };
    } catch (error) {
        console.error('Apple token verification failed:', error);
        return null;
    }
}

// Helper function to convert JWK to PEM
function jwkToPem(jwk: any): string {
    const { n, e } = jwk;

    // Convert base64url to base64
    const nBuffer = Buffer.from(n, 'base64url');
    const eBuffer = Buffer.from(e, 'base64url');

    // Create ASN.1 structure
    const asn1 = Buffer.concat([
        Buffer.from([0x30]), // SEQUENCE
        Buffer.from([0x82, 0x01, 0x22]), // Length
        Buffer.from([0x30, 0x0D]), // SEQUENCE
        Buffer.from([0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01]), // OID for RSA
        Buffer.from([0x05, 0x00]), // NULL
        Buffer.from([0x03, 0x82, 0x01, 0x0F]), // BIT STRING
        Buffer.from([0x00]), // Padding
        Buffer.from([0x30, 0x82, 0x01, 0x0A]), // SEQUENCE
        Buffer.from([0x02, 0x82, 0x01, 0x01]), // INTEGER (modulus)
        nBuffer,
        Buffer.from([0x02, 0x03]), // INTEGER (exponent)
        eBuffer
    ]);

    return `-----BEGIN PUBLIC KEY-----\n${asn1.toString('base64')}\n-----END PUBLIC KEY-----`;
}

