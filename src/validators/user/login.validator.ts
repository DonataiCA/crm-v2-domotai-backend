import { z } from 'zod';
import { Request } from 'express';

export const loginSchema = z.object({
    email: z.string().email('Invalid email format').optional(),
    phoneNumber: z.string()
        .min(1, 'Phone number is required')
        .regex(/^\+?[\d\s\-\(\)]{7,}$/, 'Invalid phone number format')
        .optional(),
    password: z.string()
        .min(6, 'Password must be at least 6 characters long')
}).refine(data => data.email || data.phoneNumber, {
    message: 'Either email or phoneNumber is required',
});

export function validateLogin(req: Request) {
    const result = loginSchema.parse(req.body);
    return {
        email: result.email?.trim().toLowerCase(),
        phoneNumber: result.phoneNumber?.trim(),
        password: result.password
    };
}

