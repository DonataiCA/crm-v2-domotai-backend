import { z } from 'zod';
import { Request } from 'express';

export const phoneCheckSchema = z.object({
    phoneNumber: z.string()
        .min(1, 'Phone number is required')
        .regex(/^\+?[\d\s\-\(\)]{7,}$/, 'Invalid phone number format')
        .transform(val => val.trim())
});

export function validatePhoneCheck(req: Request) {
    return phoneCheckSchema.parse(req.body);
}

