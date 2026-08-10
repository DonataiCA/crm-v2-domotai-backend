import { Request, Response } from 'express';
import { sendError } from '../utils/error';
import { uploadFile, getPublicUrl } from '../utils/s3';
import { validateUpload } from '../validators/media/upload.validator';
import path from 'path';

export const MediaController = {
    upload: async (req: Request, res: Response) => {
        try {
            const orgId = req.headers['x-organization-id'] as string;
            if (!orgId) return sendError(res, 400, 'X-Organization-Id header is required');

            const validationResult = validateUpload(req, res);

            // If the result is a response (error), the response was already sent
            if ('status' in validationResult) {
                return;
            }

            const { file, userId } = validationResult;

            // Generate unique name for the file
            const timestamp = Date.now();
            const originalName = file.originalname;
            const extension = path.extname(originalName);
            const fileName = path.basename(originalName, extension);

            // Create the path: userId/name-timestamp.extension
            const key = `${userId}/${fileName}-${timestamp}${extension}`;

            // Upload file to S3
            await uploadFile(key, file.buffer, file.mimetype);

            // Generate public URL
            const publicUrl = getPublicUrl(key);

            res.json({
                url: publicUrl,
                key: key,
                fileName: originalName,
                size: file.size,
                mimeType: file.mimetype
            });

        } catch (error) {
            return sendError(res, 500, 'File upload failed', error);
        }
    }
};

