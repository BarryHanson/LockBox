"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * This page is deprecated. 2FA verification now happens via a modal.
 * Redirecting to login...
 */
export default function Verify2FAPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to login - the 2FA modal will handle verification there
    router.push("/login");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </main>
  );
}
