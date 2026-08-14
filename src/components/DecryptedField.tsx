"use client";

import { useState, useEffect } from 'react';
import { decryptObject, retrieveEncryptionKey, ensureEncryptionKeyAvailable } from '@/lib/clientCrypto';
import { CheckIcon, ClipboardCopyIcon } from 'lucide-react';

interface DecryptedFieldProps {
  value: string;
  encryptionData?: Record<string, { iv: string; salt: string }>;
  fieldName: string;
  masked?: boolean;
  showDecrypted?: boolean;
  className?: string;
}

/**
 * Component that handles decryption of sensitive fields
 * MODIFIED: Now hides sensitive information by default when loading the page
 */
export function DecryptedField({
  value,
  encryptionData,
  fieldName,
  masked = true, // Default to masked for security
  showDecrypted = false, // Default to hiding decrypted data for security
  className = '',
}: DecryptedFieldProps) {
  const [decryptedValue, setDecryptedValue] = useState<string>('');
  const [isDecrypted, setIsDecrypted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start with loading state
  const [error, setError] = useState<string | null>(null);
  const [showValue, setShowValue] = useState<boolean>(showDecrypted);
  const [copied, setCopied] = useState<boolean>(false);

  // Function to decrypt the value
  const decryptValue = async () => {
    // If already decrypted, just return
    if (isDecrypted) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // If no encryption data or it's missing for this field, just use the raw value
      if (!encryptionData || !encryptionData[fieldName]) {
        setDecryptedValue(value);
        setIsDecrypted(true);
        return;
      }
      
      // Implement a robust retry mechanism with multiple attempts
      let encryptionKey = null;
      let attempts = 0;
      const maxAttempts = 3;
      const delays = [0, 300, 800]; // Increasing delays between attempts in ms
      
      while (!encryptionKey && attempts < maxAttempts) {
        // Wait before retry (except first attempt)
        if (attempts > 0) {
          await new Promise(resolve => setTimeout(resolve, delays[attempts]));
        }
        
        attempts++;
        
        // Try to get the key directly
        encryptionKey = await retrieveEncryptionKey();
        
        // If not found, try to restore it
        if (!encryptionKey) {
          const keyRestored = await ensureEncryptionKeyAvailable();
          
          if (keyRestored) {
            encryptionKey = await retrieveEncryptionKey();
          }
        }
      }
      
      if (!encryptionKey) {
        setDecryptedValue(value);
        setIsDecrypted(true);
        return;
      }
      
      // Create an object with just the field we want to decrypt
      const objToDecrypt = { [fieldName]: value };
      const fieldsToDecrypt = [fieldName] as const;
      
      // Only include encryption data for the specific field
      const fieldEncryptionData = {
        [fieldName]: encryptionData[fieldName]
      };
      
      try {
        const decrypted = await decryptObject(
          objToDecrypt,
          encryptionKey,
          fieldsToDecrypt as any,
          fieldEncryptionData
        );
        
        setDecryptedValue(decrypted[fieldName]);
        setIsDecrypted(true);
      } catch (decryptErr) {
        // Decryption failed - likely unencrypted legacy data, use raw value
        setDecryptedValue(value);
        setIsDecrypted(true);
      }
    } catch (err) {
      // General error in decryption process - fall back to raw value
      setDecryptedValue(value);
      setIsDecrypted(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Always decrypt on mount immediately
  useEffect(() => {
    // Force immediate decryption attempt
    decryptValue();
    
    // Keep showValue as initially set (default is hidden)
    // Do not force showValue to true
    // Ensure the component re-renders when value or encryption data changes
  }, [value, encryptionData, fieldName]);

  // Handle toggling visibility
  const toggleVisibility = () => {
    if (!isDecrypted && !showValue) {
      decryptValue();
    }
    setShowValue(!showValue);
  };
  
  // Handle copying to clipboard
  const handleCopy = async () => {
    try {
      // Make sure we have decrypted the value before copying
      if (!isDecrypted) {
        await decryptValue();
      }
      
      // Copy the decrypted value to clipboard
      await navigator.clipboard.writeText(isDecrypted ? decryptedValue : value);
      
      // Show success indicator
      setCopied(true);
      
      // Reset after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Mask the value for display
  const getMaskedValue = () => {
    // Use decrypted value if available, otherwise fall back to original value
    const valueToMask = isDecrypted ? decryptedValue : value;
    
    if (typeof valueToMask !== 'string') return '';
    
    // For credit card numbers, show last 4 digits
    if (fieldName === 'cardNumber' && valueToMask.length > 4) {
      return '•••• '.repeat(3) + valueToMask.slice(-4);
    }
    
    // For CVV, mask completely
    if (fieldName === 'cvv') {
      return '•••';
    }
    
    // For passwords, mask completely
    if (fieldName === 'password') {
      return '••••••••';
    }
    
    // For usernames, show first character and domain if it's an email
    if (fieldName === 'username' && valueToMask.includes('@')) {
      const [localPart, domain] = valueToMask.split('@');
      return `${localPart[0]}${'•'.repeat(localPart.length - 1)}@${domain}`;
    }
    
    // For other fields, show first and last character
    if (valueToMask.length > 2) {
      return valueToMask[0] + '•'.repeat(valueToMask.length - 2) + valueToMask[valueToMask.length - 1];
    }
    
    return '•'.repeat(valueToMask.length);
  };

  // Format a card number with spaces every 4 digits
  const formatCardNumber = (number: string) => {
    if (!number) return number;
    // Remove any existing spaces
    const cleaned = number.replace(/\s/g, '');
    // Add a space every 4 characters
    return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
  };

  // Determine what to display - respect masking settings
  const displayValue = () => {
    if (isLoading) {
      return <span className="text-gray-400">Decrypting...</span>;
    }
    
    // Always use decrypted value when available
    const valueToDisplay = isDecrypted ? decryptedValue : value;

    // Apply masking if needed
    if (masked && !showValue) {
      return getMaskedValue();
    }
    
    // Format card numbers with spaces
    if (fieldName === 'cardNumber') {
      return formatCardNumber(valueToDisplay);
    }
    
    // Otherwise show the actual value
    return valueToDisplay;
  };


  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div 
        className="flex-1 font-mono"
        data-field={`${fieldName}-${encryptionData?.[fieldName]?.iv || ''}`}
      >
        {displayValue()}
      </div>
      <div className="flex items-center gap-1">
        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className="text-primary hover:text-primary-hover"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="h-4 w-4 text-green-500" />
          ) : (
            <ClipboardCopyIcon className="h-4 w-4" />
          )}
        </button>
        
        {/* Visibility toggle button */}
        {masked && (
          <button
            type="button"
            onClick={toggleVisibility}
            className="text-primary hover:text-primary-hover"
            title={showValue ? "Hide" : "Show"}
          >
            {showValue ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Simple eye icon components
function EyeIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIcon({ className = "h-6 w-6" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}
