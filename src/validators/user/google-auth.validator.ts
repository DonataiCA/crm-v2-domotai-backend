import { z } from 'zod';
import { Request } from 'express';

const userDataSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    gender: z.string().optional(),
    phoneNumber: z.string().optional()
});

export const googleAuthSchema = z.object({
    idToken: z.string().min(1, 'ID token is required'),
    userData: userDataSchema.optional()
});

export function validateGoogleAuth(req: Request) {
    return googleAuthSchema.parse(req.body);
}

