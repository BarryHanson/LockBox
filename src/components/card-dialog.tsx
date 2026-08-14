"use client";

import { useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card } from "@prisma/client";
import { DecryptedField } from "./DecryptedField";

interface CardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Card>) => Promise<void>;
  initialData?: Partial<Card> & { encryptionData?: Record<string, { iv: string; salt: string }> };
  title: string;
}

export function CardDialog({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  title,
}: CardDialogProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    cardNumber: initialData?.cardNumber || "",
    expiryMonth: initialData?.expiryMonth || 1,
    expiryYear: initialData?.expiryYear || new Date().getFullYear(),
    cvv: initialData?.cvv || "",
    billingAddress: initialData?.billingAddress || "",
    tags: initialData?.tags || [],
  });

  const [showSensitive, setShowSensitive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");

  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error("Failed to save card:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = () => {
    if (tagInput && !formData.tags.includes(tagInput)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput]
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-full max-w-lg">
        <div className="bg-card border border-border rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">{title}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Card Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="cardNumber" className="text-sm font-medium">
                Card Number
              </label>
              <div className="relative">
                <DecryptedField
                  value={formData.cardNumber}
                  encryptionData={initialData?.encryptionData}
                  fieldName="cardNumber"
                  masked={!showSensitive}
                  showDecrypted={showSensitive}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSensitive(!showSensitive)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSensitive ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="expiryMonth" className="text-sm font-medium">
                  Expiry Month
                </label>
                <select
                  id="expiryMonth"
                  value={formData.expiryMonth}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      expiryMonth: parseInt(e.target.value),
                    }))
                  }
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                  required
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>
                      {month.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="expiryYear" className="text-sm font-medium">
                  Expiry Year
                </label>
                <select
                  id="expiryYear"
                  value={formData.expiryYear}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      expiryYear: parseInt(e.target.value),
                    }))
                  }
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                  required
                >
                  {Array.from(
                    { length: 10 },
                    (_, i) => new Date().getFullYear() + i
                  ).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="cvv" className="text-sm font-medium">
                CVV
              </label>
              <div className="relative">
                <DecryptedField
                  value={formData.cvv}
                  encryptionData={initialData?.encryptionData}
                  fieldName="cvv"
                  masked={!showSensitive}
                  showDecrypted={showSensitive}
                  className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSensitive(!showSensitive)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSensitive ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="billingAddress" className="text-sm font-medium">
                Billing Address
              </label>
              <DecryptedField
                value={formData.billingAddress || ''}
                encryptionData={initialData?.encryptionData}
                fieldName="billingAddress"
                masked={!showSensitive}
                showDecrypted={showSensitive}
                className="w-full px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 rounded-full bg-primary/10 text-primary text-sm flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-primary-hover"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addTag()}
                  placeholder="Add a tag"
                  className="flex-1 px-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-4 py-2 text-sm rounded-lg border border-input hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Add
                </button>
              </div>
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
