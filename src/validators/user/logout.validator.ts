import { z } from 'zod';
import { Request } from 'express';

export const logoutSchema = z.object({
    authorization: z.string()
        .min(1, 'No token provided')
        .transform((val) => {
            const token = val.split(' ')[1];
            if (!token) {
                throw new Error('No token provided');
            }
            return token;
        })
});

export function validateLogout(req: Request) {
    const result = logoutSchema.parse(req.headers);
    return { token: result.authorization };
}

