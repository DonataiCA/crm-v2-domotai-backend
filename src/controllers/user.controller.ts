import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import bcrypt from 'bcryptjs';
import { UserRepository, AuthProvider } from '../repositories/user.repository';
import { prisma } from '../config/prisma';
import { generateToken } from '../utils/jwt';
import crypto from 'crypto';
import { JwtRepository } from '../repositories/jwt.repository';
import { validatePagination } from '../validators/user/pagination.validator';
import { validateFilters } from '../validators/user/filter.validator';
import { validateRegister } from '../validators/user/register.validator';
import { validateUpdate } from '../validators/user/update.validator';
import { validateIdParam } from '../validators/user/params.validator';
import { getAuthenticatedUserId } from '../validators/user/params.validator';
import { validateLogin } from '../validators/user/login.validator';
import { validatePhoneCheck } from '../validators/user/phone-check.validator';
import { validateGoogleAuth } from '../validators/user/google-auth.validator';
import { validateAppleAuth } from '../validators/user/apple-auth.validator';
import { validateLogout } from '../validators/user/logout.validator';
import { transformUser, transformUsers, transformUserWithRelations } from '../transformers/user.transformer';
import { verifyGoogleToken } from '../utils/google-auth';
import { verifyAppleToken } from '../utils/apple-auth';
import { emailService } from '../utils/email';
import {
    DEFAULT_ORG_ROLE,
    DEFAULT_PROFILE_ROLE,
    PROFILE_ROLES,
    isAdminRole,
    isProfileRole,
    normalizeRole,
} from '../constants/roles';

export const UserController = {
    index: async (req: Request, res: Response) => {
        try {
            const { page, limit } = validatePagination(req);
            const { search } = validateFilters(req);
            const skip = (page - 1) * limit;

            const orgId = (req as any).orgId as string;
            const [users, total] = await Promise.all([
                UserRepository.findAll(skip, limit, { search, organizationId: orgId }),
                UserRepository.count({ search, organizationId: orgId })
            ]);

            res.json({
                data: transformUsers(users),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            return sendError(res, 400, 'Invalid query parameters', error);
        }
    },

    show: async (req: Request, res: Response) => {
        try {
            const { id } = validateIdParam(req);
            const orgId = (req as any).orgId as string;
            const user = await UserRepository.findById(id, orgId);
            if (!user) return sendError(res, 404, 'User not found');
            res.json(transformUserWithRelations(user));
        } catch (error) {
            return sendError(res, 400, 'Invalid ID parameter', error);
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const { id } = validateIdParam(req);
            const validatedData = validateUpdate(req);

            // Prepare data for User model
            const data: any = {};
            if (validatedData.firstName) data.firstName = validatedData.firstName;
            if (validatedData.lastName) data.lastName = validatedData.lastName;
            if (validatedData.gender) data.gender = validatedData.gender;
            if (validatedData.phoneNumber) data.phoneNumber = validatedData.phoneNumber;
            if (validatedData.providerId) data.providerId = validatedData.providerId;
            if (validatedData.authProvider) data.authProvider = validatedData.authProvider;

            if (validatedData.email) {
                data.email = validatedData.email.trim().toLowerCase();
            }

            if (validatedData.password) {
                data.password = await bcrypt.hash(validatedData.password, 12);
            }

            // Also derive firstName/lastName from fullName if provided
            if (validatedData.fullName && !validatedData.firstName) {
                data.firstName = validatedData.fullName.split(' ')[0] || validatedData.fullName;
                data.lastName = validatedData.fullName.split(' ').slice(1).join(' ') || '';
            }

            const user = await UserRepository.update(id, data);

            // Sync Profile fields (fullName, phone, role, email)
            const profileData: any = {};
            if (validatedData.fullName) profileData.fullName = validatedData.fullName;
            if (validatedData.phone !== undefined) profileData.phone = validatedData.phone;
            // V1: sólo un admin puede cambiar el rol. Un no-admin únicamente
            // puede reenviar su rol actual (no-op); intentar escalar es 403.
            if (validatedData.role !== undefined) {
                const requestedRole = normalizeRole(validatedData.role);
                const requesterRole = (req as any).user?.role as string | undefined;
                if (isAdminRole(requesterRole)) {
                    profileData.role = requestedRole;
                } else if (requestedRole !== requesterRole) {
                    return sendError(res, 403, 'Only an admin can change a user role.');
                }
            }
            if (validatedData.email) profileData.email = validatedData.email.trim().toLowerCase();

            if (Object.keys(profileData).length > 0) {
                await prisma.profile.updateMany({
                    where: { userId: id },
                    data: profileData,
                });
            }

            res.json(transformUser(user));
        } catch (error) {
            return sendError(res, 400, 'Invalid parameters or request body', error);
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const { id } = validateIdParam(req);
            await UserRepository.delete(id);
            res.sendStatus(204);
        } catch (error) {
            return sendError(res, 400, 'Invalid ID parameter', error);
        }
    },

    adminCreate: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            // Role check enforced by requireAdmin middleware on the route

            const { email, full_name, phone, role, password } = req.body;
            if (!email || !full_name) return sendError(res, 400, 'email and full_name are required');

            // Esta ruta no pasa por un validador, así que el rol se normaliza y valida aquí.
            const normalizedRole = role ? normalizeRole(role) : DEFAULT_PROFILE_ROLE;
            if (!isProfileRole(normalizedRole)) {
                return sendError(res, 400, `Invalid role. Expected one of: ${PROFILE_ROLES.join(', ')}`);
            }

            const normalizedEmail = email.trim().toLowerCase();

            // Check if user already exists
            const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
            if (existing) return sendError(res, 409, 'A user with this email already exists');

            const hashedPassword = await bcrypt.hash(password || 'Domotai2026', 12);

            // Create user + profile + org membership in a transaction
            const result = await prisma.$transaction(async (tx: any) => {
                const user = await tx.user.create({
                    data: {
                        email: normalizedEmail,
                        password: hashedPassword,
                        firstName: full_name.split(' ')[0] || full_name,
                        lastName: full_name.split(' ').slice(1).join(' ') || '',
                        phoneNumber: phone || normalizedEmail,
                    },
                });

                const profile = await tx.profile.create({
                    data: {
                        email: normalizedEmail,
                        fullName: full_name,
                        phone: phone || '',
                        role: normalizedRole,
                        shouldChangePassword: true,
                        currentOrganizationId: orgId,
                        userId: user.id,
                    },
                });

                // OrgMember FK references Profile.id, not User.id
                await tx.organizationMember.create({
                    data: {
                        organizationId: orgId,
                        userId: profile.id,
                        role: isAdminRole(normalizedRole) ? 'admin' : DEFAULT_ORG_ROLE,
                    },
                });

                return profile;
            });

            res.status(201).json(result);
        } catch (error) {
            return sendError(res, 500, 'Failed to create user', error);
        }
    },

    register: async (req: Request, res: Response) => {
        try {
            const validationResult = await validateRegister(req, res);

            // If the result is a response (error), the response was already sent
            if ('status' in validationResult) {
                return;
            }

            const { firstName, lastName, email, gender, phoneNumber, password, providerId, authProvider } = validationResult;

            let user;
            if (authProvider === AuthProvider.EMAIL) {
                // Normal registration with email and password
                const hashedPassword = await bcrypt.hash(password!, 12);
                user = await UserRepository.create({
                    email,
                    password: hashedPassword,
                    firstName,
                    lastName,
                    gender,
                    phoneNumber,
                    authProvider,
                });
            } else if (authProvider === AuthProvider.GOOGLE || authProvider === AuthProvider.APPLE) {
                // Registration with Google or Apple
                user = await UserRepository.create({
                    email,
                    firstName,
                    lastName,
                    gender,
                    phoneNumber,
                    providerId,
                    authProvider,
                });
            } else {
                return sendError(res, 400, 'Invalid auth provider');
            }

            // Generate JWT with a unique secret for this user
            const userSecret = crypto.randomBytes(32).toString('hex');
            const token = generateToken(user.id, userSecret);

            // Save JWT secret in database
            await JwtRepository.create(user.id, userSecret);

            res.status(201).json({
                user: transformUser(user),
                token
            });
        } catch (error) {
            return sendError(res, 400, 'Invalid request body', error);
        }
    },

    changePassword: async (req: Request, res: Response) => {
        try {
            const userId = getAuthenticatedUserId(req);
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return sendError(res, 400, 'currentPassword and newPassword are required');
            }
            if (newPassword.length < 6) {
                return sendError(res, 400, 'New password must be at least 6 characters');
            }

            const user = await UserRepository.findById(userId);
            if (!user || !user.password) {
                return sendError(res, 404, 'User not found');
            }

            const isValid = await bcrypt.compare(currentPassword, user.password);
            if (!isValid) {
                return sendError(res, 401, 'Current password is incorrect');
            }

            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await UserRepository.update(userId, { password: hashedPassword });

            // Also update shouldChangePassword flag if it exists on profile
            try {
                    await prisma.profile.updateMany({
                    where: { userId },
                    data: { shouldChangePassword: false },
                });
            } catch { /* profile might not exist */ }

            // Send password changed confirmation (fire and forget)
            if (user?.email) {
                emailService.sendPasswordChanged(user.email, user.profile?.fullName || user.firstName);
            }

            res.json({ message: 'Password changed successfully' });
        } catch (error) {
            return sendError(res, 500, 'Failed to change password', error);
        }
    },

    profile: async (req: Request, res: Response) => {
        try {
            const userId = getAuthenticatedUserId(req);
            const user = await UserRepository.findById(userId);
            if (!user) return sendError(res, 404, 'User not found');
            res.json(transformUserWithRelations(user));
        } catch (error) {
            return sendError(res, 401, 'User not authenticated', error);
        }
    },

    checkPhoneNumber: async (req: Request, res: Response) => {
        try {
            const { phoneNumber } = validatePhoneCheck(req);

            // Find user by phone number
            const user = await UserRepository.findByPhoneNumber(phoneNumber);

            if (!user) {
                return res.json({
                    exists: false,
                    authProvider: null
                });
            }

            return res.json({
                exists: true,
                authProvider: user.authProvider
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'ZodError') {
                return sendError(res, 400, 'Validation error', error);
            }
            return sendError(res, 500, 'Phone number check failed', error);
        }
    },

    login: async (req: Request, res: Response) => {
        try {
            const { email, phoneNumber, password } = validateLogin(req);

            // Find user by email or phone number
            let user;
            if (email) {
                user = await UserRepository.findByEmail(email);
            } else if (phoneNumber) {
                user = await UserRepository.findByPhoneNumber(phoneNumber);
            }
            if (!user) {
                return sendError(res, 401, 'Invalid credentials');
            }

            // Verify that the user registered with email/password
            if (user.authProvider !== AuthProvider.EMAIL) {
                return sendError(res, 401, 'Please use Google/Apple sign-in for this account');
            }

            // Verify password
            if (!user.password) {
                return sendError(res, 401, 'Invalid credentials');
            }

            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return sendError(res, 401, 'Invalid credentials');
            }

            // Get user with all relations after successful authentication
            const userWithRelations = await UserRepository.findById(user.id);

            // Generar JWT con un secreto único para este usuario
            const userSecret = crypto.randomBytes(32).toString('hex');
            const token = generateToken(user.id, userSecret);

            // Verificar si ya existe un JWT para este usuario
            const existingJwt = await JwtRepository.findByUserId(user.id);

            if (existingJwt) {
                await JwtRepository.update(existingJwt.id, { secret: userSecret, createdAt: new Date() });
            } else {
                await JwtRepository.create(user.id, userSecret);
            }

            res.json({
                user: transformUserWithRelations(userWithRelations),
                token
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'ZodError') {
                return sendError(res, 400, 'Validation error', error);
            }
            return sendError(res, 500, 'Login failed', error);
        }
    },

    googleAuth: async (req: Request, res: Response) => {
        try {
            const { idToken, userData } = validateGoogleAuth(req);

            // For development/testing, allow a mock token
            let googleUser;
            if (idToken === 'mock-google-token-for-testing' && process.env.NODE_ENV === 'development') {
                googleUser = {
                    sub: '123456789012345678901',
                    email: 'test.user@gmail.com',
                    email_verified: true,
                    name: 'Test User',
                    given_name: 'Test',
                    family_name: 'User',
                    picture: 'https://lh3.googleusercontent.com/a/default-user',
                    locale: 'en'
                };
            } else {
                // Verify the token with Google
                googleUser = await verifyGoogleToken(idToken);
                if (!googleUser) {
                    return sendError(res, 401, 'Invalid Google token');
                }
            }

            // Verify that the email is verified
            if (!googleUser.email_verified) {
                return sendError(res, 401, 'Email not verified with Google');
            }

            // Find existing user
            let user = await UserRepository.findByEmail(googleUser.email);
            let isNewUser = false;

            if (!user) {
                // Create new user if it doesn't exist
                const userCreateData: any = {
                    email: googleUser.email,
                    firstName: userData?.firstName || googleUser.given_name,
                    lastName: userData?.lastName || googleUser.family_name,
                    gender: userData?.gender || 'UNKNOWN',
                    phoneNumber: userData?.phoneNumber || '',
                    providerId: googleUser.sub,
                    authProvider: AuthProvider.GOOGLE,
                };

                user = await UserRepository.create(userCreateData);
                isNewUser = true;
            } else {
                // Verify that the existing user uses Google
                if (user.authProvider !== AuthProvider.GOOGLE) {
                    return sendError(res, 401, 'Account already exists with email/password. Please use email login.');
                }

                // Update providerId if necessary
                if (user.providerId !== googleUser.sub) {
                    await UserRepository.update(user.id, { providerId: googleUser.sub });
                }
            }

            // Generate JWT with a unique secret for this user
            const userSecret = crypto.randomBytes(32).toString('hex');
            const token = generateToken(user.id, userSecret);

            // Save JWT secret in database
            await JwtRepository.create(user.id, userSecret);

            res.json({
                user: transformUser(user),
                token,
                isNewUser
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'ZodError') {
                return sendError(res, 400, 'Validation error', error);
            }
            return sendError(res, 500, 'Google authentication failed', error);
        }
    },

    appleAuth: async (req: Request, res: Response) => {
        try {
            const { idToken, userData } = validateAppleAuth(req);

            // For development/testing, allow a mock token
            let appleUser;
            if (idToken === 'mock-apple-token-for-testing' && process.env.NODE_ENV === 'development') {
                appleUser = {
                    sub: '123456789012345678901.apple',
                    email: 'test.user@privaterelay.appleid.com',
                    email_verified: true,
                    name: 'Test User',
                    given_name: 'Test',
                    family_name: 'User'
                };
            } else {
                // Verify the token with Apple
                appleUser = await verifyAppleToken(idToken);
                if (!appleUser) {
                    return sendError(res, 401, 'Invalid Apple token');
                }
            }

            // Verify that the email is verified (Apple always provides verified emails)
            if (!appleUser.email_verified) {
                return sendError(res, 401, 'Email not verified with Apple');
            }

            // Find existing user
            let user = await UserRepository.findByEmail(appleUser.email!);
            let isNewUser = false;

            if (!user) {
                // Create new user if it doesn't exist
                const userCreateData: any = {
                    email: appleUser.email!,
                    firstName: userData?.firstName || appleUser.given_name || 'Apple',
                    lastName: userData?.lastName || appleUser.family_name || 'User',
                    gender: userData?.gender || 'UNKNOWN',
                    phoneNumber: userData?.phoneNumber || '',
                    providerId: appleUser.sub,
                    authProvider: AuthProvider.APPLE,
                };

                user = await UserRepository.create(userCreateData);
                isNewUser = true;
            } else {
                // Verify that the existing user uses Apple
                if (user.authProvider !== AuthProvider.APPLE) {
                    return sendError(res, 401, 'Account already exists with email/password. Please use email login.');
                }

                // Update providerId if necessary
                if (user.providerId !== appleUser.sub) {
                    await UserRepository.update(user.id, { providerId: appleUser.sub });
                }
            }

            // Generate JWT with a unique secret for this user
            const userSecret = crypto.randomBytes(32).toString('hex');
            const token = generateToken(user.id, userSecret);

            // Save JWT secret in database
            await JwtRepository.create(user.id, userSecret);

            res.json({
                user: transformUser(user),
                token,
                isNewUser
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'ZodError') {
                return sendError(res, 400, 'Validation error', error);
            }
            return sendError(res, 500, 'Apple authentication failed', error);
        }
    },

    logout: async (req: Request, res: Response) => {
        try {
            const { token } = validateLogout(req);

            // Invalidate the token in the database
            await JwtRepository.deleteByToken(token);

            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            if (error instanceof Error && error.name === 'ZodError') {
                return sendError(res, 400, 'Validation error', error);
            }
            return sendError(res, 500, 'Logout failed', error);
        }
    }
};

