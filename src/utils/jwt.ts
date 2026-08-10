import jwt from 'jsonwebtoken';

export const generateToken = (userId: string, secret: string) => {
    return jwt.sign({ id: userId }, secret, { expiresIn: '1d' });
};

export const verifyToken = (token: string, secret: string) => {
    return jwt.verify(token, secret);
};

