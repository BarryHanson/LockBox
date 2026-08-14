"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import TwoFactorModal from "./TwoFactorModal";

interface TwoFactorContextType {
  requestTwoFactor: (options: TwoFactorOptions) => Promise<string>;
}

interface TwoFactorOptions {
  email: string;
  password: string;
  method: "email" | "totp";
  turnstileToken?: string;
}

const TwoFactorContext = createContext<TwoFactorContextType | undefined>(undefined);

export function TwoFactorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<TwoFactorOptions | null>(null);
  const [resolvePromise, setResolvePromise] = useState<((token: string) => void) | null>(null);
  const [rejectPromise, setRejectPromise] = useState<(() => void) | null>(null);

  const requestTwoFactor = (opts: TwoFactorOptions): Promise<string> => {
    return new Promise((resolve, reject) => {
      setOptions(opts);
      setIsOpen(true);
      setResolvePromise(() => resolve);
      setRejectPromise(() => reject);
    });
  };

  const handleSuccess = (token: string) => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(token);
    }
    // Reset state
    setOptions(null);
    setResolvePromise(null);
    setRejectPromise(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (rejectPromise) {
      rejectPromise();
    }
    // Reset state
    setOptions(null);
    setResolvePromise(null);
    setRejectPromise(null);
  };

  return (
    <TwoFactorContext.Provider value={{ requestTwoFactor }}>
      {children}
      {options && (
        <TwoFactorModal
          isOpen={isOpen}
          onClose={handleClose}
          onSuccess={handleSuccess}
          email={options.email}
          password={options.password}
          method={options.method}
          turnstileToken={options.turnstileToken}
        />
      )}
    </TwoFactorContext.Provider>
  );
}

export function useTwoFactor() {
  const context = useContext(TwoFactorContext);
  if (context === undefined) {
    throw new Error("useTwoFactor must be used within a TwoFactorProvider");
  }
  return context;
}
