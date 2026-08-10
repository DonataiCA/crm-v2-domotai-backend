import { Request, Response } from 'express';
import { sendError } from '../../utils/error';
import { AuthProvider, UserRepository } from '../../repositories/user.repository';

type RegisterData = {
    firstName: string;
    lastName: string;
    email: string;
    gender: string;
    phoneNumber: string;
    password?: string;
    providerId?: string;
    authProvider?: AuthProvider;
};

export const validateRegister = async (req: Request, res: Response): Promise<RegisterData | Response> => {
    const { firstName, lastName, email, gender, phoneNumber, password, providerId, authProvider } = req.body;

    if (!firstName || !lastName || !email || !gender || !phoneNumber) {
        return sendError(res, 400, 'Missing required fields');
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return sendError(res, 400, 'Invalid email format');
    }

    // Validar gender
    const validGenders = ['MALE', 'FEMALE', 'OTHER'];
    if (!validGenders.includes(gender.toUpperCase())) {
        return sendError(res, 400, 'Invalid gender. Must be MALE, FEMALE, or OTHER');
    }

    // Verificar que el email no exista ya
    const existingUser = await UserRepository.findByEmail(email.trim().toLowerCase());
    if (existingUser) {
        return sendError(res, 400, 'Email already registered');
    }

    // Verificar que el phoneNumber no exista ya
    const existingPhoneUser = await UserRepository.findByPhoneNumber(phoneNumber);
    if (existingPhoneUser) {
        return sendError(res, 400, 'Phone number already registered');
    }

    if (authProvider === AuthProvider.EMAIL && !password) {
        return sendError(res, 400, 'Password is required for email registration');
    }

    if ((authProvider === AuthProvider.GOOGLE || authProvider === AuthProvider.APPLE) && !providerId) {
        return sendError(res, 400, 'Provider ID is required for external registration');
    }

    return {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        gender: gender.toUpperCase(),
        phoneNumber: phoneNumber.trim(),
        password,
        providerId,
        authProvider: authProvider || AuthProvider.EMAIL
    };
};

