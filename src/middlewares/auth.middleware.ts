import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/error';
import jwt from 'jsonwebtoken';
import { JwtRepository } from '../repositories/jwt.repository';
import { prisma } from '../config/prisma';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return sendError(res, 401, 'No token provided');
        }

        // First, decode the token to extract userId (without verification)
        let decoded: any;
        try {
            decoded = jwt.decode(token);
        } catch (decodeError) {
            return sendError(res, 401, 'Invalid token format');
        }

        if (!decoded || !decoded.id) {
            return sendError(res, 401, 'Invalid token payload');
        }

        const userId = decoded.id;

        // Search for the JWT record by userId in the database
        const jwtRecord = await JwtRepository.findByUserId(userId);

        if (!jwtRecord) {
            return sendError(res, 401, 'Token not found or invalid');
        }

        // Now verify the JWT token using the secret stored in the database
        try {
            const verifiedDecoded = jwt.verify(token, jwtRecord.secret) as { id: string };

            if (!verifiedDecoded || !verifiedDecoded.id) {
                return sendError(res, 401, 'Invalid token payload');
            }

            // Verify that the verified userId matches the stored userId
            if (verifiedDecoded.id !== jwtRecord.userId) {
                return sendError(res, 401, 'Token user mismatch');
            }

            // Add userId to the request for later use
            (req as any).userId = verifiedDecoded.id;

            // Resolve profile for controllers that need profileId and role
            const profile = await prisma.profile.findFirst({
                where: { userId: verifiedDecoded.id },
                select: { id: true, role: true },
            });
            if (profile) {
                (req as any).user = { profileId: profile.id, role: profile.role };
            }

            next();
        } catch (jwtError) {
            if (jwtError instanceof jwt.JsonWebTokenError) {
                return sendError(res, 401, 'Invalid or expired token');
            }
            throw jwtError;
        }

    } catch (error) {
        return sendError(res, 500, 'Authentication error', error);
    }
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const profileRole = (req as any).user?.role;

        if (!profileRole) {
            return sendError(res, 403, 'Access denied. Could not determine user role.');
        }

        if (profileRole !== 'admin') {
            return sendError(res, 403, 'Access denied. Admin role required.');
        }

        next();
    } catch (error) {
        return sendError(res, 500, 'Authorization error', error);
    }
};

/**
 * Middleware that verifies the authenticated user is a member of the
 * organization specified in the X-Organization-Id header.
 * Must be placed AFTER `authenticate`.
 * Sets (req as any).orgId for downstream use.
 */
export const requireOrgMembership = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgId = req.headers['x-organization-id'] as string;
        if (!orgId) {
            return sendError(res, 400, 'X-Organization-Id header is required');
        }

        const profileId = (req as any).user?.profileId;
        if (!profileId) {
            return sendError(res, 403, 'Access denied. User profile not found.');
        }

        // OrgMember.userId references Profile.id
        const membership = await prisma.organizationMember.findFirst({
            where: { organizationId: orgId, userId: profileId },
        });

        if (!membership) {
            return sendError(res, 403, 'Access denied. You are not a member of this organization.');
        }

        // Attach verified orgId so controllers don't need to re-read the header
        (req as any).orgId = orgId;

        next();
    } catch (error) {
        return sendError(res, 500, 'Organization membership check failed', error);
    }
};

