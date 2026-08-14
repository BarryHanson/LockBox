import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/fileAuditLog';

const ENDPOINT = process.env.BACKBLAZE_ENDPOINT || process.env.B2_ENDPOINT || process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
const BUCKET = process.env.BACKBLAZE_BUCKET || process.env.B2_BUCKET || process.env.R2_BUCKET || process.env.S3_BUCKET;
const ACCESS_KEY = process.env.BACKBLAZE_KEY_ID || process.env.B2_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.BACKBLAZE_APPLICATION_KEY || process.env.B2_APPLICATION_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

function createS3Client() {
  if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
    throw new Error('Missing S3-compatible storage configuration in environment');
  }

  return new S3Client({
    endpoint: ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const publicId = typeof body?.publicId === 'string' ? body.publicId : '';
    const token = typeof body?.token === 'string' ? body.token : '';

    if (!publicId || !token) {
      await logAuditEvent({ req, action: 'share.file.invalid_input', level: 'warn', status: 400, metadata: { publicIdPresent: !!publicId } });
      return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const link = await prisma.sharedItemLink.findUnique({
      where: { publicId },
      select: {
        itemType: true,
        itemId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
      }
    });

    if (!link || link.tokenHash !== tokenHash) {
      await logAuditEvent({ req, action: 'share.file.invalid_link', level: 'warn', status: 401, metadata: { publicId } });
      return NextResponse.json({ error: 'Invalid shared file link' }, { status: 401 });
    }

    if (link.revokedAt) {
      await logAuditEvent({ req, action: 'share.file.revoked', level: 'warn', status: 410, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link was revoked.' }, { status: 410 });
    }

    if (link.itemType !== 'FILE') {
      await logAuditEvent({ req, action: 'share.file.invalid_item_type', level: 'warn', status: 400, metadata: { publicId, itemType: link.itemType } });
      return NextResponse.json({ error: 'Shared item is not a file' }, { status: 400 });
    }

    if (link.expiresAt && link.expiresAt <= now) {
      await logAuditEvent({ req, action: 'share.file.expired', level: 'warn', status: 410, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }

    const file = await prisma.file.findUnique({ where: { id: link.itemId } });
    if (!file || !file.storageKey) {
      await logAuditEvent({ req, action: 'share.file.not_found', level: 'warn', status: 404, metadata: { publicId } });
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const s3 = createS3Client();
    const getResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET!, Key: file.storageKey }));
    if (!getResp.Body) {
      await logAuditEvent({ req, action: 'share.file.content_missing', level: 'warn', status: 404, metadata: { publicId } });
      return NextResponse.json({ error: 'File content not found' }, { status: 404 });
    }

    let bytes: Uint8Array;
    const bodyStream = getResp.Body as {
      transformToByteArray?: () => Promise<Uint8Array>;
      arrayBuffer?: () => Promise<ArrayBuffer>;
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
    };

    if (typeof bodyStream.transformToByteArray === 'function') {
      bytes = await bodyStream.transformToByteArray();
    } else if (typeof bodyStream.arrayBuffer === 'function') {
      bytes = new Uint8Array(await bodyStream.arrayBuffer());
    } else if (bodyStream[Symbol.asyncIterator]) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of bodyStream as AsyncIterable<Uint8Array | Buffer | string>) {
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

    await logAuditEvent({ req, action: 'share.file.success', status: 200, metadata: { publicId, fileId: file.id, size: bytes.byteLength } });

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('share-items file download error:', error);
    await logAuditEvent({ req, action: 'share.file.error', level: 'error', status: 500 });
    return NextResponse.json({ error: 'Failed to download shared file' }, { status: 500 });
  }
}
