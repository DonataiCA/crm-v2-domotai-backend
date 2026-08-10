import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// S3 Client configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: false, // Use virtual hosted-style URLs
});

export async function uploadFile(key: string, file: Buffer, contentType?: string) {
    // Validate environment variables
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION;

    if (!accessKeyId || !secretAccessKey || !bucket) {
        throw new Error('Missing required AWS environment variables');
    }

    // Create S3 client with validated credentials
    const s3ClientInstance = new S3Client({
        region: region || 'us-east-1',
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
        forcePathStyle: false,
    });

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file,
        ContentType: contentType,
        // ACL removed - bucket policies should handle public access
    });

    return s3ClientInstance.send(command);
}

export function getPublicUrl(key: string): string {
    const bucket = process.env.AWS_S3_BUCKET!;
    const region = process.env.AWS_REGION || 'us-east-1';
    // Use the correct S3 endpoint format
    return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
}

