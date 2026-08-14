"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, File, X } from 'lucide-react';
import { encrypt, deriveKeyFromPassword, ensureEncryptionKeyAvailable, getEncryptionKey, base64ToArrayBuffer, arrayBufferToBase64, exportCryptoKey } from '@/lib/clientCrypto';

interface FileFormProps {
  onFileUploaded: () => void;
}

export function FileForm({ onFileUploaded }: FileFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Allowed file extensions
  const ALLOWED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.json', '.xml',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
    '.zip', '.gz', '.tar', '.7z', '.rar',
    '.mp3', '.mp4', '.wav', '.avi', '.mov',
    '.key', '.pem', '.crt',
  ];

  const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(',');

  const handleFileSelect = (file: File) => {
    // Size validation (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
      alert('File size must be less than 100MB');
      return;
    }

    // Extension validation
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert('File type not allowed. Supported types: documents, images, archives, media.');
      return;
    }

    setSelectedFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const encryptAndUploadFile = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Ensure encryption key is available
      const keyAvailable = await ensureEncryptionKeyAvailable();
      if (!keyAvailable) {
        alert('Please unlock your vault first');
        setIsUploading(false);
        return;
      }

      // Read file as ArrayBuffer
      const fileBuffer = await selectedFile.arrayBuffer();

      // Get encryption key from memory
      const key = await getEncryptionKey();
      if (!key) {
        alert('Encryption key not available');
        setIsUploading(false);
        return;
      }

      // Convert file to base64 string
      const fileBase64 = arrayBufferToBase64(fileBuffer);
      
      // Generate random salts for file data and file name
      const fileDataSalt = crypto.getRandomValues(new Uint8Array(16));
      const fileNameSalt = crypto.getRandomValues(new Uint8Array(16));
      
      // Derive keys using salt-based key derivation (zero-knowledge approach)
      const { key: derivedKeyFileData } = await deriveKeyFromPassword(await exportCryptoKey(key), fileDataSalt);
      const { key: derivedKeyFileName } = await deriveKeyFromPassword(await exportCryptoKey(key), fileNameSalt);
      
      // Encrypt file data with derived key
      const { encrypted, iv: ivFileData } = await encrypt(fileBase64, derivedKeyFileData);
      
      // Encrypt the file name with its own derived key and IV
      const { encrypted: encryptedFileName, iv: ivFileName } = await encrypt(selectedFile.name, derivedKeyFileName);

      // Convert encrypted data back to binary for multipart upload
      const encryptedBuffer = base64ToArrayBuffer(encrypted);
      const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });

      // Create FormData with encrypted file and metadata
      const formData = new FormData();
      formData.append('file', encryptedBlob);
      formData.append('metadata', JSON.stringify({
        encryptedName: encryptedFileName,
        mimeType: selectedFile.type || 'application/octet-stream',
        iv: arrayBufferToBase64(ivFileData.buffer),
        salt: arrayBufferToBase64(fileDataSalt.buffer),
        fileNameIv: arrayBufferToBase64(ivFileName.buffer),
        fileNameSalt: arrayBufferToBase64(fileNameSalt.buffer),
        fileSize: selectedFile.size,
      }));

      // Upload to server (server-side proxy handles R2 upload)
      try {
        const uploadResp = await fetch('/api/files', {
          method: 'POST',
          body: formData,
          // Don't set Content-Type header - browser will set it with multipart boundary
        });

        if (!uploadResp.ok) {
          const err = await uploadResp.json().catch(() => ({ error: 'unknown' }));
          throw new Error(err.error || 'Failed to upload file');
        }

        const file = await uploadResp.json();
        
        // Reset form and close dialog
        setSelectedFile(null);
        setIsOpen(false);
        onFileUploaded();

      } catch (err) {
        console.error('Error uploading file:', err);
        throw new Error('Failed to upload file: ' + (err as Error).message);
      }

    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file: ' + (error as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2" variant="default">
          <Upload className="w-4 h-4" />
          Upload File
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Secure File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Drop your file here</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <Input
                type="file"
                accept={ACCEPT_ATTR}
                onChange={handleFileInput}
                className="hidden"
                id="file-input"
              />
              <Button
                asChild
                variant="outline"
                className="cursor-pointer"
              >
                <Label htmlFor="file-input">
                  Choose File
                </Label>
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Max file size: 100MB</p>
            </div>
          ) : (
            <div className="flex items-center space-x-3 p-4 border rounded-lg bg-card">
              <File className="w-8 h-8 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={encryptAndUploadFile}
              disabled={!selectedFile || isUploading}
              variant="default"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}