"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type Props = {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
};

type TurnstileWidgetId = string;

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => TurnstileWidgetId;
      reset: (widgetId: TurnstileWidgetId) => void;
      remove: (widgetId: TurnstileWidgetId) => void;
    };
  }
}

export default function CloudflareTurnstile({ siteKey, onTokenChange, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  const mountWidget = useCallback(() => {
    if (!isScriptLoaded || !siteKey || !containerRef.current || !window.turnstile) return;

    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onTokenChange(token),
      'expired-callback': () => onTokenChange(null),
      'error-callback': () => onTokenChange(null),
    });
  }, [isScriptLoaded, onTokenChange, siteKey]);

  useEffect(() => {
    mountWidget();
  }, [mountWidget]);

  useEffect(() => {
    if (!window.turnstile || !widgetIdRef.current) return;
    onTokenChange(null);
    window.turnstile.reset(widgetIdRef.current);
  }, [onTokenChange, resetKey]);

  useEffect(() => {
    return () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setIsScriptLoaded(true)}
      />
      <div ref={containerRef} className="min-h-[65px]" />
    </>
  );
}
