import { useState, useCallback } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnEvent, PlaidLinkOnExit, PlaidLinkOptionsWithLinkToken, PlaidLinkError } from 'react-plaid-link';
import { Button } from './ui/button';


interface PlaidLinkProps {
  linkToken: string;
  onSuccess: (token: string) => void;
}

export function PlaidLink({ linkToken, onSuccess }: PlaidLinkProps) {
  const [error, setError] = useState('');

  const handleSuccess: PlaidLinkOnSuccess = useCallback(
    async (public_token) => {
      console.log('🔵 Plaid Link success, got public token:', public_token);
      try {
        console.log('🔵 Exchanging public token for access token...');
        const response = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicToken: public_token }),
        });

        if (!response.ok) throw new Error('Failed to exchange token');
        
        const data = await response.json();
        if (!data.success) throw new Error('Exchange failed');

        onSuccess(public_token);
        setError('');
      } catch (err) {
        console.error('🔴 Plaid Link error:', err);
        setError('Failed to link account');
      }
    },
    [onSuccess]
  );

  const handleExit: PlaidLinkOnExit = useCallback((err: PlaidLinkError | null) => {
    console.log('🟡 Plaid Link exited', err ? 'with error' : 'normally');
    if (err) {
      console.error('🔴 Plaid exit error:', err);
      setError(err.display_message || 'An error occurred');
    }
  }, []);

  const handleEvent: PlaidLinkOnEvent = useCallback((eventName: string, metadata: any) => {
    console.log('🟣 Plaid event:', eventName, metadata);
    if (eventName === 'ERROR' && metadata.error_code) {
      console.error('🔴 Plaid event error:', metadata);
      setError(metadata.error_message || 'An error occurred');
    }
  }, []);

  const config: PlaidLinkOptionsWithLinkToken = {
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
    onEvent: handleEvent,
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <div className="space-y-2">
      <Button 
        onClick={() => open()} 
        disabled={!ready}
        className="w-full"
      >
        Connect Bank Account
      </Button>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
