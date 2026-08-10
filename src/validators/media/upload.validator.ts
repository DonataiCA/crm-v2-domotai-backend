import { Request, Response } from 'express';
import { sendError } from '../../utils/error';

type UploadData = {
    file: Express.Multer.File;
    userId: string;
};

export const validateUpload = (req: Request, res: Response): UploadData | Response => {
    const file = req.file;
    const userId = (req as Request & { userId?: string }).userId;

    if (!userId) {
        return sendError(res, 401, 'User not authenticated');
    }

    if (!file) {
        return sendError(res, 400, 'No file provided');
    }

    // Validate file type (optional - you can adjust according to your needs)
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
        return sendError(res, 400, 'File type not allowed');
    }

    // Validate file size (5MB maximum)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        return sendError(res, 400, 'File too large. Maximum size is 5MB');
    }

    return { file, userId };
};

