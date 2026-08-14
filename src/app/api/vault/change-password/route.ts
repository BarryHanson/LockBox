import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    // Get token from cookies
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Rate limit vault password change: 5 attempts per 15 minutes per user
    const rateLimit = checkRateLimit(`vault-change-pw:${userId}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    const { currentVaultPassword, vaultPasswordHash, keySalt, encryptedMasterKey, passwords, cards, notes, files, vaultCheckEncrypted, vaultCheckIv } = await req.json();

    if (!encryptedMasterKey || !vaultPasswordHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!vaultCheckEncrypted || !vaultCheckIv) {
      return NextResponse.json({ error: 'Missing vault check data' }, { status: 400 });
    }

    // Get user's vault settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, vaultSettings: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.vaultSettings) {
      return NextResponse.json({ error: 'Vault settings not found' }, { status: 404 });
    }

    // C8: Verify current vault password before allowing change
    if (!currentVaultPassword) {
      return NextResponse.json({ error: 'Current vault password is required' }, { status: 400 });
    }

    if (typeof currentVaultPassword !== 'string' || currentVaultPassword.length < 8) {
      return NextResponse.json({ error: 'Invalid vault password' }, { status: 400 });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentVaultPassword, user.vaultSettings.vaultPasswordHash);
    if (!isCurrentPasswordValid) {
      return NextResponse.json({ error: 'Current vault password is incorrect' }, { status: 401 });
    }

    // C9: Wrap all operations in a transaction to prevent partial updates
    await prisma.$transaction(async (tx) => {
      // Update vault settings with new encrypted key, password hash, salt, and VaultCheck
      await tx.vaultSettings.update({
        where: { userId: user.id },
        data: {
          encryptedMasterKey,
          vaultPasswordHash,
          keySalt,
          vaultCheckEncrypted,
          vaultCheckIv
        }
      });

      // C7: Update all passwords with userId ownership check
      if (passwords && passwords.length > 0) {
        await Promise.all(
          passwords.map((pass: any) =>
            tx.password.update({
              where: { id: pass.id, userId: user.id },
              data: {
                password: pass.password,
                username: pass.username,
                notes: pass.notes,
                encryptionData: pass.encryptionData
              }
            })
          )
        );
      }

      // Update all cards with userId ownership check
      if (cards && cards.length > 0) {
        await Promise.all(
          cards.map((card: any) =>
            tx.card.update({
              where: { id: card.id, userId: user.id },
              data: {
                cardNumber: card.cardNumber,
                cvv: card.cvv,
                billingAddress: card.billingAddress,
                encryptionData: card.encryptionData
              }
            })
          )
        );
      }

      // Update all notes with userId ownership check
      if (notes && notes.length > 0) {
        await Promise.all(
          notes.map((note: any) =>
            tx.note.update({
              where: { id: note.id, userId: user.id },
              data: {
                encryptedTitle: note.encryptedTitle,
                encryptedContent: note.encryptedContent,
                encryptionMetadata: note.encryptionMetadata
              }
            })
          )
        );
      }

      // Update all files with userId ownership check
      if (files && files.length > 0) {
        await Promise.all(
          files.map((file: any) =>
            tx.file.update({
              where: { id: file.id, userId: user.id },
              data: {
                encryptedName: file.encryptedName,
                iv: file.encryptionMetadata?.data?.iv || file.iv,
                encryptionMetadata: file.encryptionMetadata
              }
            })
          )
        );
      }
    });

    return NextResponse.json({ success: true, message: 'Vault password changed successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to change vault password' }, { status: 500 });
  }
}
