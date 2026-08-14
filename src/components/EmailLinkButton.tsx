import { useEffect, useCallback, useState } from 'react';
import { Mail } from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

interface EmailLinkButtonProps {
  onSuccess: (credentials: string) => void;
  onError: (error: string) => void;
}

export function EmailLinkButton({ onSuccess, onError }: EmailLinkButtonProps) {
  const [client, setClient] = useState<any>(null);

  const handleCredentialResponse = useCallback(async (response: any) => {
    try {
      if (!response.code) {
        throw new Error('No authorization code received');
      }

      const apiResponse = await fetch('/api/email-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ code: response.code })
      });

      if (!apiResponse.ok) {
        const data = await apiResponse.json();
        throw new Error(data.error || 'Failed to link email');
      }

      const data = await apiResponse.json();
      onSuccess(data.email);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to link email');
      console.error('Email link error:', err);
    }
  }, [onSuccess, onError]);

  useEffect(() => {
    // Load the Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      console.log('Google Identity Services script loaded');
      console.log('Client ID:', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
      
      try {
        const googleClient = window.google?.accounts.oauth2.initCodeClient({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          ux_mode: 'popup',
          callback: handleCredentialResponse,
        });
        console.log('Google client initialized:', !!googleClient);
        setClient(googleClient);
      } catch (err) {
        console.error('Failed to initialize Google client:', err);
        onError('Failed to initialize Google sign-in');
      }
    };

    script.onerror = () => {
      onError('Failed to load Google authentication');
    };

    return () => {
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, [handleCredentialResponse, onError]);

  const handleClick = useCallback(() => {
    console.log('Button clicked, client exists:', !!client);
    if (client) {
      try {
        client.requestCode();
        console.log('Requested authorization code');
      } catch (err) {
        console.error('Failed to request code:', err);
        onError('Failed to open Google sign-in');
      }
    }
  }, [client, onError]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-orange-500">
        <Mail className="w-5 h-5" />
        <span className="font-medium">Link your email to scan for accounts</span>
      </div>
      <button
        onClick={handleClick}
        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
        disabled={!client}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
          <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
          <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
          <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
          <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
          <path fill="none" d="M2 2h44v44H2z"/>
        </svg>
        Link Gmail Account
      </button>
    </div>
  );
}
