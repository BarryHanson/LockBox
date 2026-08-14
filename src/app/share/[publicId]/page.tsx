"use client";

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Clock3, KeyRound } from 'lucide-react';
import { arrayBufferToBase64, base64ToArrayBuffer, decrypt, deriveKeyFromPassword, importCryptoKey } from '@/lib/clientCrypto';
import DOMPurify from 'dompurify';

type SharedPayload =
  | { type: 'PASSWORD'; title: string; username: string; password: string; url?: string; notes?: string }
  | { type: 'CARD'; name: string; cardNumber: string; expiryMonth: number; expiryYear: number; cvv: string; billingAddress?: string; tags?: string[] }
  | { type: 'NOTE'; title: string; content: string }
  | { type: 'FILE'; fileName: string; mimeType: string; fileSize: number; dataIv: string; dataKey: string };

function readSecretFromHash(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  return params.get('k') || '';
}

type LinkState = 'loading' | 'ready' | 'expired' | 'invalid' | 'error' | 'missing-key';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <Input readOnly value={value} className="bg-background" />
    </div>
  );
}

export default function SharedItemPage({ params }: { params: { publicId: string } }) {
  const [linkState, setLinkState] = useState<LinkState>('loading');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [secret, setSecret] = useState('');
  const [isDownloadingFile, setIsDownloadingFile] = useState(false);

  const hasSecret = useMemo(() => secret.length > 0, [secret]);

  useEffect(() => {
    const initialSecret = readSecretFromHash();
    setSecret(initialSecret);
  }, []);

  useEffect(() => {
    const redeem = async () => {
      if (!hasSecret) {
        setLinkState('missing-key');
        setError('Missing share key in the link.');
        return;
      }

      setLinkState('loading');
      setError('');

      try {
        const response = await fetch('/api/share-items/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicId: params.publicId, token: secret }),
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data?.error || 'This share link is invalid.');
          if (response.status === 410) {
            setLinkState('expired');
          } else {
            setLinkState('invalid');
          }
          return;
        }

        const saltBytes = new Uint8Array(base64ToArrayBuffer(data.payloadSalt));
        const ivBytes = new Uint8Array(base64ToArrayBuffer(data.payloadIv));
        const { key } = await deriveKeyFromPassword(secret, saltBytes);
        const jsonPayload = await decrypt(data.payloadCipher, key, ivBytes);
        const parsedPayload = JSON.parse(jsonPayload) as SharedPayload;
        setPayload(parsedPayload);
        setLinkState('ready');
      } catch (err) {
        setError('Failed to decrypt shared item.');
        setLinkState('error');
      }
    };

    redeem();
  }, [hasSecret, params.publicId, secret]);

  const downloadSharedFile = async () => {
    if (!payload || payload.type !== 'FILE') return;

    setIsDownloadingFile(true);
    try {
      const response = await fetch('/api/share-items/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: params.publicId, token: secret }),
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Download failed');
      }

      const encryptedArrayBuffer = await response.arrayBuffer();
      const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);
      const dataKey = await importCryptoKey(payload.dataKey);
      const dataIv = new Uint8Array(base64ToArrayBuffer(payload.dataIv));
      const decryptedBase64 = await decrypt(encryptedBase64, dataKey, dataIv);
      const binaryData = new Uint8Array(base64ToArrayBuffer(decryptedBase64));

      const blob = new Blob([binaryData], { type: payload.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download shared file.');
      if ((err instanceof Error ? err.message : '').toLowerCase().includes('expired')) {
        setLinkState('expired');
      }
    } finally {
      setIsDownloadingFile(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-background/95 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-2 rounded-full border border-primary/20">
            <Image
              src="/orange_logo_no_text.png"
              alt="ByteLock"
              width={34}
              height={34}
              className="rounded-full"
            />
          </div>
          <p className="text-2xl font-bold bg-gradient-to-r from-primary via-primary-hover to-primary-dark bg-clip-text text-transparent">
            ByteLock
          </p>
        </div>

        <Card className="w-full p-6 sm:p-8 space-y-5 border-border/60">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Shared Secure Item</h1>
            <p className="text-sm text-muted-foreground">
              View-only secure content shared from ByteLock.
            </p>
          </div>

          {linkState === 'loading' && (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Verifying and decrypting your shared item…
            </div>
          )}

          {linkState === 'missing-key' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <div className="flex items-start gap-2">
                <KeyRound className="w-4 h-4 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-medium">Missing Share Key</p>
                  <p className="text-muted-foreground">This link is incomplete. Ask the sender to copy the full link including the key fragment.</p>
                </div>
              </div>
            </div>
          )}

          {linkState === 'expired' && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Clock3 className="w-4 h-4 mt-0.5 text-destructive" />
                <div>
                  <p className="font-medium">Shared Link Expired</p>
                  <p className="text-muted-foreground">This shared password link is expired or has already been used.</p>
                </div>
              </div>
            </div>
          )}

          {(linkState === 'invalid' || linkState === 'error') && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive" />
                <div>
                  <p className="font-medium">Unable to Open Link</p>
                  <p className="text-muted-foreground">{error || 'This link is invalid or no longer available.'}</p>
                </div>
              </div>
            </div>
          )}

          {linkState === 'ready' && payload?.type === 'PASSWORD' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-primary">Password</p>
              <Field label="Title" value={payload.title} />
              <Field label="Username / Email" value={payload.username} />
              <Field label="Password" value={payload.password} />
              {payload.url && <Field label="Website" value={payload.url} />}
              {payload.notes && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <div className="text-sm whitespace-pre-wrap rounded-md border bg-background p-3">{payload.notes}</div>
                </div>
              )}
            </div>
          )}

          {linkState === 'ready' && payload?.type === 'CARD' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-primary">Card</p>
              <Field label="Card Name" value={payload.name} />
              <Field label="Card Number" value={payload.cardNumber} />
              <Field label="Expiry" value={`${payload.expiryMonth.toString().padStart(2, '0')}/${payload.expiryYear}`} />
              <Field label="CVV" value={payload.cvv} />
              {payload.billingAddress && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billing Address</p>
                  <div className="text-sm whitespace-pre-wrap rounded-md border bg-background p-3">{payload.billingAddress}</div>
                </div>
              )}
            </div>
          )}

          {linkState === 'ready' && payload?.type === 'NOTE' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-primary">Note</p>
              <Field label="Title" value={payload.title} />
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</p>
                <div
                  className="prose prose-sm dark:prose-invert rounded-md border bg-background p-3 max-h-[55vh] overflow-auto"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(payload.content || '') }}
                />
              </div>
            </div>
          )}

          {linkState === 'ready' && payload?.type === 'FILE' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-primary">File</p>
              <Field label="File Name" value={payload.fileName} />
              <Field label="File Type" value={payload.mimeType} />
              <Field label="File Size" value={`${payload.fileSize} bytes`} />
              <Button onClick={downloadSharedFile} disabled={isDownloadingFile}>
                {isDownloadingFile ? 'Downloading…' : 'Download File'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
