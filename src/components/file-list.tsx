"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { File, Download, Trash2, FileText, Image, Video, Archive, Share2 } from 'lucide-react';
import { decrypt, getEncryptionKey, base64ToArrayBuffer, arrayBufferToBase64, deriveKeyFromPassword, exportCryptoKey } from '@/lib/clientCrypto';

interface SecureFile {
  id: string;
  fileName: string;
  encryptedName?: string | null;
  storageKey?: string | null;
  fileSize: number;
  mimeType: string;
  iv?: string | null;
  authTag?: string | null;
  encryptionMetadata?: any;
  createdAt: string;
  updatedAt: string;
}

interface FileListProps {
  files: SecureFile[];
  onFileDeleted: () => void;
  onShareFile?: (file: SecureFile) => void;
}

export function FileList({ files, onFileDeleted, onShareFile }: FileListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<SecureFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="w-6 h-6 text-green-500" />;
    if (mimeType.startsWith('video/')) return <Video className="w-6 h-6 text-blue-500" />;
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) {
      return <Archive className="w-6 h-6 text-yellow-500" />;
    }
    if (mimeType.startsWith('text/') || mimeType.includes('pdf')) {
      return <FileText className="w-6 h-6 text-red-500" />;
    }
    return <File className="w-6 h-6 text-primary" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const downloadFile = async (file: SecureFile) => {
    setDownloadingId(file.id);
    try {
      // Get encryption key from memory
      const key = await getEncryptionKey();
      if (!key) {
        alert('Please unlock your vault first');
        return;
      }

      // Download encrypted file through our API proxy (avoids browser CORS against object storage)
      const resp = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download-proxy', fileId: file.id }),
        credentials: 'include',
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Failed to download file');
      }

      const encryptedArrayBuffer = await resp.arrayBuffer();

      // Convert encrypted binary to base64 (decrypt expects base64 input)
      const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);

      // Decrypt the file name - handle both old format (IV only) and new format (salt-based)
      let decryptedFileName: string;
      try {
        const nameMetadata = file.encryptionMetadata?.name || {};
        const encryptedName = file.encryptedName;
        if (!encryptedName) {
          decryptedFileName = file.fileName;
        } else {
        
          if (nameMetadata.iv && nameMetadata.salt) {
            // New format: salt-based key derivation
            const ivBytes = new Uint8Array(base64ToArrayBuffer(nameMetadata.iv));
            const saltBytes = new Uint8Array(base64ToArrayBuffer(nameMetadata.salt));
            const { key: derivedKeyFileName } = await deriveKeyFromPassword(await exportCryptoKey(key), saltBytes);
            decryptedFileName = await decrypt(encryptedName, derivedKeyFileName, ivBytes);
          } else if (file.iv) {
            // Old format: simple IV-based encryption (backward compatibility)
            const ivBytes = new Uint8Array(base64ToArrayBuffer(file.iv));
            decryptedFileName = await decrypt(encryptedName, key, ivBytes);
          } else {
            throw new Error('Missing IV or encryption metadata for file name decryption');
          }
        }
      } catch (error) {
        throw new Error('Failed to decrypt file name');
      }

      // Decrypt the file data - handle both old format (IV only) and new format (salt-based)
      let decryptedData: string;
      try {
        const dataMetadata = file.encryptionMetadata?.data || {};
        
        if (dataMetadata.iv && dataMetadata.salt) {
          // New format: salt-based key derivation
          const ivBytes = new Uint8Array(base64ToArrayBuffer(dataMetadata.iv));
          const saltBytes = new Uint8Array(base64ToArrayBuffer(dataMetadata.salt));
          const { key: derivedKeyFileData } = await deriveKeyFromPassword(await exportCryptoKey(key), saltBytes);
          decryptedData = await decrypt(encryptedBase64, derivedKeyFileData, ivBytes);
        } else if (file.iv) {
          // Old format: simple IV-based encryption (backward compatibility)
          const ivBytes = new Uint8Array(base64ToArrayBuffer(file.iv));
          decryptedData = await decrypt(encryptedBase64, key, ivBytes);
        } else {
          throw new Error('Missing IV or encryption metadata for file data decryption');
        }
      } catch (error) {
        throw new Error('Failed to decrypt file data');
      }

      // Convert base64 back to binary
      let binaryData: Uint8Array;
      try {
        const ab = base64ToArrayBuffer(decryptedData);
        binaryData = new Uint8Array(ab);
      } catch (error) {
        throw new Error('Failed to decode file data');
      }

      // Create blob and download
      try {
        const binaryDataCopy = new Uint8Array(binaryData);
        const blob = new Blob([binaryDataCopy], { type: file.mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = decryptedFileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        throw new Error('Failed to create download link');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to download file: ${errorMessage}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteClick = (file: SecureFile) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/files?id=${fileToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      onFileDeleted();
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete file: ' + (error as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (files.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border/50 p-8 text-center">
        <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
          <File className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-2">No files uploaded yet</h3>
        <p className="text-muted-foreground mb-4">Upload your first secure file to get started</p>
        <Button
          variant="outline"
          className="mx-auto"
        >
          Upload Your First File
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <Card key={file.id} className="bg-card rounded-xl p-5 border border-border/50 hover:shadow-md hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 p-1.5 rounded-md">
                {getFileIcon(file.mimeType)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium truncate text-sm" title={file.fileName}>
                  {file.fileName}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(file.fileSize)} • {formatDate(file.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {onShareFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onShareFile(file)}
                  className="h-8 w-8 p-0"
                  title="Share file"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadFile(file)}
                disabled={downloadingId === file.id}
                className="h-8 w-8 p-0"
                title="Download file"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteClick(file)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Delete file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{fileToDelete?.fileName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete File'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}