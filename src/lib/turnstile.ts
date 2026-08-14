type VerifyTurnstileInput = {
  token: string;
  ip?: string;
};

type VerifyTurnstileResult = {
  success: boolean;
  errorCodes?: string[];
};

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

export async function verifyTurnstileToken(input: VerifyTurnstileInput): Promise<VerifyTurnstileResult> {
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.error('TURNSTILE_SECRET_KEY is not set');
    return {
      success: false,
      errorCodes: ['missing-input-secret'],
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', input.token);

    if (input.ip) {
      formData.append('remoteip', input.ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        success: false,
        errorCodes: ['siteverify-request-failed'],
      };
    }

    const data = (await response.json()) as TurnstileVerifyResponse;

    return {
      success: data.success === true,
      errorCodes: data['error-codes'] ?? [],
    };
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return {
      success: false,
      errorCodes: ['siteverify-exception'],
    };
  }
}
