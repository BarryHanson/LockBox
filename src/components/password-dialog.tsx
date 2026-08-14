"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Password } from "@prisma/client";
import { decryptObject, retrieveEncryptionKey } from "@/lib/clientCrypto";

interface PasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Password>) => Promise<void>;
  initialData?: Partial<Password & { encryptionData?: Record<string, { iv: string; salt: string }> }>;
  title: string;
}

export function PasswordDialog({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  title,
}: PasswordDialogProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    username: initialData?.username || "",
    password: initialData?.password || "",
    url: initialData?.url || "",
    notes: initialData?.notes || "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState("");

  // Add decryption function
  const decryptPassword = async () => {
    if (!initialData?.password || !initialData.encryptionData) return;

    try {
      const encryptionKey = await retrieveEncryptionKey();
      if (!encryptionKey) {
        console.error("No encryption key available");
        return;
      }

      const decrypted = await decryptObject(
        { password: initialData.password },
        encryptionKey,
        ["password"],
        initialData.encryptionData
      );

      setDecryptedPassword(decrypted.password);
    } catch (error) {
      console.error("Decryption failed:", error);
    }
  };

  // Decrypt password when component loads or initialData changes
  useEffect(() => {
    if (initialData?.password) {
      decryptPassword();
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error("Failed to save password:", error);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-full max-w-lg">
        <div className="bg-card border border-border rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">{title}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, username: e.target.value }))
                }
                className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {initialData?.password && (
                <div className="mt-2 text-sm">
                  <p className="text-muted-foreground">Decrypted password:</p>
                  <div className="flex items-center mt-1">
                    <span className="bg-muted px-2 py-1 rounded">
                      {showPassword ? decryptedPassword : '••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="ml-2 text-primary"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="url" className="text-sm font-medium">
                URL
              </label>
              <input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, url: e.target.value }))
                }
                className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">
                Notes
              </label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors min-h-[100px]"
              />
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-primary text-primary-foreground hover:bg-primary-hover px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>{isLoading ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
