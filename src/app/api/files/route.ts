import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { getUserById } from "@/lib/auth";
import { z } from "zod";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Schema for presign request (no file data allowed)
const presignSchema = z.object({
  action: z.literal("presign"),
  fileName: z.string().min(1, "File name is required"),
  encryptedName: z.string().min(1, "Encrypted file name is required"),
  fileSize: z.number().min(1, "File size must be greater than 0"),
  mimeType: z.string().min(1, "MIME type is required"),
  iv: z.string().optional(),
  authTag: z.string().optional(),
});

// Schema for completion request (after client uploads to object storage)
const completeSchema = z.object({
  action: z.literal("complete"),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  encryptedName: z.string().min(1),
  iv: z.string().optional(),
  authTag: z.string().optional(),
});

// S3-compatible configuration (supports Backblaze B2, Cloudflare R2, generic S3)
const ENDPOINT = process.env.BACKBLAZE_ENDPOINT || process.env.B2_ENDPOINT || process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
const BUCKET = process.env.BACKBLAZE_BUCKET || process.env.B2_BUCKET || process.env.R2_BUCKET || process.env.S3_BUCKET;
const ACCESS_KEY = process.env.BACKBLAZE_KEY_ID || process.env.B2_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.BACKBLAZE_APPLICATION_KEY || process.env.B2_APPLICATION_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

function createS3Client() {
  if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
    throw new Error("Missing S3-compatible storage configuration in environment (set BACKBLAZE_/B2_/R2_/S3_ vars)");
  }

  return new S3Client({
    endpoint: ENDPOINT,
    region: "auto",
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

export async function GET() {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user has PRO subscription for file access
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userSubscription: true }
    });

    if (!user?.userSubscription || (user.userSubscription.plan !== 'PRO' && user.userSubscription.plan !== 'TEAM')) {
      return NextResponse.json({ error: "Pro or Team subscription required" }, { status: 403 });
    }

    const files = await prisma.file.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(files);
  } catch (error) {
    console.error("Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user has PRO subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userSubscription: true }
    });

    if (!user?.userSubscription || (user.userSubscription.plan !== 'PRO' && user.userSubscription.plan !== 'TEAM')) {
      return NextResponse.json({ error: "Pro or Team subscription required" }, { status: 403 });
    }

    // Parse request based on content-type
    let json: any;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle multipart upload (server-side proxy)
      const formData = await req.formData();
      const encryptedFile = formData.get('file') as File;
      const metadataStr = formData.get('metadata') as string;

      if (!encryptedFile || !metadataStr) {
        return NextResponse.json({ error: "Missing file or metadata" }, { status: 400 });
      }

      const metadata = JSON.parse(metadataStr);
      const buffer = await encryptedFile.arrayBuffer();

      // Replace existing file object in storage via server proxy (used for vault password rotation)
      if (metadata?.action === 'replace-proxy' && metadata?.fileId) {
        const fileRecord = await prisma.file.findUnique({ where: { id: metadata.fileId } });
        if (!fileRecord || fileRecord.userId !== userId || !fileRecord.storageKey) {
          return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const s3 = createS3Client();
        const putCommand = new PutObjectCommand({
          Bucket: BUCKET!,
          Key: fileRecord.storageKey,
          Body: new Uint8Array(buffer),
          ContentType: metadata.mimeType || fileRecord.mimeType || 'application/octet-stream',
        });

        await s3.send(putCommand);

        await prisma.file.update({
          where: { id: metadata.fileId },
          data: {
            fileSize: buffer.byteLength,
            mimeType: metadata.mimeType || fileRecord.mimeType || 'application/octet-stream',
          }
        });

        return NextResponse.json({ success: true, overwritten: true });
      }

      // Check file size limit (1GB for PRO users)
      const FILE_SIZE_LIMIT = 1024 * 1024 * 1024;
      if (buffer.byteLength > FILE_SIZE_LIMIT) {
        return NextResponse.json({ error: "File size exceeds limit" }, { status: 400 });
      }

      // Check total storage used by user
      const existingFiles = await prisma.file.findMany({
        where: { userId },
        select: { fileSize: true }
      });

      const totalStorageUsed = existingFiles.reduce((sum, file) => sum + file.fileSize, 0);
      if (totalStorageUsed + buffer.byteLength > FILE_SIZE_LIMIT) {
        return NextResponse.json({ error: "Storage limit exceeded" }, { status: 400 });
      }

      // Generate storage key
      const id = randomUUID();
      const storageKey = `${userId}/${id}/${metadata.encryptedName}`;

      // Upload encrypted file to S3/R2 from server
      const s3 = createS3Client();
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET!,
        Key: storageKey,
        Body: new Uint8Array(buffer),
        ContentType: metadata.mimeType || 'application/octet-stream',
      });

      await s3.send(putCommand);

      // Create file metadata record
      const file = await prisma.file.create({
        data: {
          userId,
          fileName: metadata.fileName,
          encryptedName: metadata.encryptedName,
          storageKey,
          fileSize: buffer.byteLength,
          mimeType: metadata.mimeType || 'application/octet-stream',
          iv: metadata.iv,
          authTag: metadata.authTag,
          encryptionMetadata: {
            data: {
              iv: metadata.iv,
              salt: metadata.salt
            },
            name: {
              iv: metadata.fileNameIv,
              salt: metadata.fileNameSalt
            }
          }
        },
      });

      return NextResponse.json(file);
    } else {
      // Handle JSON requests (presign, presign-get, complete)
      json = await req.json();
    }
    // Decide whether this is a presign request or a completion notification
    if (json?.action === "presign") {
      const validated = presignSchema.parse(json);

      // Check file size limit (1GB for PRO users)
      const FILE_SIZE_LIMIT = 1024 * 1024 * 1024; // 1GB in bytes
      if (validated.fileSize > FILE_SIZE_LIMIT) {
        return NextResponse.json({ error: "File size exceeds limit" }, { status: 400 });
      }

      // Check total storage used by user
      const existingFiles = await prisma.file.findMany({
        where: { userId },
        select: { fileSize: true }
      });

      const totalStorageUsed = existingFiles.reduce((sum, file) => sum + file.fileSize, 0);
      if (totalStorageUsed + validated.fileSize > FILE_SIZE_LIMIT) {
        return NextResponse.json({ error: "Storage limit exceeded" }, { status: 400 });
      }

      // Generate storage key and presigned PUT URL
      const id = randomUUID();
      const storageKey = `${userId}/${id}/${validated.encryptedName}`;

      const s3 = createS3Client();
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        ContentType: validated.mimeType,
      });

      const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 900 }); // 15 minutes

      return NextResponse.json({ uploadUrl, storageKey, expiresInSeconds: 900 });
    }

    if (json?.action === "presign-get") {
      const { fileId } = json as { fileId?: string };
      if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

      const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
      if (!fileRecord || fileRecord.userId !== userId) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const s3 = createS3Client();
      // Bucket is guaranteed by createS3Client, cast to non-null for SDK types
      const getCmd = new GetObjectCommand({ Bucket: BUCKET!, Key: fileRecord.storageKey! });
      const downloadUrl = await getSignedUrl(s3, getCmd, { expiresIn: 300 });

      return NextResponse.json({ downloadUrl });
    }

    if (json?.action === "download-proxy") {
      const { fileId } = json as { fileId?: string };
      if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

      const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
      if (!fileRecord || fileRecord.userId !== userId || !fileRecord.storageKey) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const s3 = createS3Client();
      const getResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET!, Key: fileRecord.storageKey }));

      if (!getResp.Body) {
        return NextResponse.json({ error: 'File content not found' }, { status: 404 });
      }

      let bytes: Uint8Array;
      const body = getResp.Body as {
        transformToByteArray?: () => Promise<Uint8Array>;
        arrayBuffer?: () => Promise<ArrayBuffer>;
        [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
      };

      if (typeof body.transformToByteArray === 'function') {
        bytes = await body.transformToByteArray();
      } else if (typeof body.arrayBuffer === 'function') {
        bytes = new Uint8Array(await body.arrayBuffer());
      } else if (body[Symbol.asyncIterator]) {
        const chunks: Uint8Array[] = [];
        for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
          if (typeof chunk === 'string') {
            chunks.push(new TextEncoder().encode(chunk));
          } else {
            chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
          }
        }

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        bytes = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        return NextResponse.json({ error: 'Unable to read file stream' }, { status: 500 });
      }

      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': fileRecord.mimeType || 'application/octet-stream',
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'private, no-store',
        },
      });
    }

    if (json?.action === "presign-replace") {
      const { fileId, mimeType } = json as { fileId?: string; mimeType?: string };
      if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

      const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
      if (!fileRecord || fileRecord.userId !== userId || !fileRecord.storageKey) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const s3 = createS3Client();
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET!,
        Key: fileRecord.storageKey,
        ContentType: mimeType || fileRecord.mimeType || 'application/octet-stream',
      });

      const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 900 });
      return NextResponse.json({ uploadUrl, storageKey: fileRecord.storageKey, expiresInSeconds: 900 });
    }

    if (json?.action === "complete") {
      const validated = completeSchema.parse(json);

      const s3 = createS3Client();
      const headCommand = new HeadObjectCommand({ Bucket: BUCKET!, Key: validated.storageKey });
      const headResp = await s3.send(headCommand);

      const contentLength = typeof headResp.ContentLength === 'number' ? headResp.ContentLength : undefined;
      if (typeof contentLength !== 'number' || contentLength <= 0) {
        return NextResponse.json({ error: "Uploaded object not found or empty" }, { status: 400 });
      }

      // Optionally, verify that the storageKey belongs to the user (simple check)
      if (!validated.storageKey.startsWith(`${userId}/`)) {
        return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
      }

      // Create file metadata record using client-provided metadata
      const file = await prisma.file.create({
        data: {
          userId,
          fileName: validated.fileName,
          encryptedName: validated.encryptedName,
          storageKey: validated.storageKey,
          fileSize: Number(contentLength),
          mimeType: headResp.ContentType ?? 'application/octet-stream',
          iv: validated.iv ?? undefined,
          authTag: validated.authTag ?? undefined,
        },
      });

      return NextResponse.json(file);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Failed to upload file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const url = new URL(req.url);
    const fileId = url.searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ error: "File ID required" }, { status: 400 });
    }

    // Verify ownership
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.storageKey) {
      const s3 = createS3Client();
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: file.storageKey }));
      } catch (error) {
        const errorName = error && typeof error === 'object' && 'name' in error
          ? String((error as { name?: unknown }).name)
          : '';

        // If the object is already missing, continue deleting metadata.
        if (errorName !== 'NoSuchKey' && errorName !== 'NotFound') {
          throw error;
        }
      }
    }

    await prisma.file.delete({
      where: { id: fileId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete file:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}