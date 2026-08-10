import { Router } from 'express';
import multer from 'multer';
import { MediaController } from '../controllers/media.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Configure multer to handle files in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// Route to upload files (requires authentication)
router.post('/upload', authenticate, upload.single('file'), MediaController.upload);

export default router;

