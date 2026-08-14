// Password validation utilities

export interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: 'minLength',
    label: 'At least 8 characters',
    test: (password: string) => password.length >= 8,
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter (A-Z)',
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter (a-z)',
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    id: 'number',
    label: 'One number (0-9)',
    test: (password: string) => /[0-9]/.test(password),
  },
  {
    id: 'special',
    label: 'One special character (!@#$%^&*)',
    test: (password: string) => /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~;']/.test(password),
  },
];

export function validatePassword(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every(req => req.test(password));
}

export function getPasswordRequirementStatus(password: string) {
  return PASSWORD_REQUIREMENTS.map(req => ({
    ...req,
    met: req.test(password),
  }));
}

export function getPasswordStrength(password: string): number {
  if (!password) return 0;
  
  let strength = 0;
  const length = password.length;
  
  // Length contributes up to 50 points
  strength += Math.min(50, (length * 50) / 20);
  
  // Character variety
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~;']/.test(password);
  
  // Variety contributes up to 30 points
  const varietyCount = [hasLowercase, hasUppercase, hasNumbers, hasSpecial]
    .filter(Boolean).length;
  strength += (varietyCount * 30) / 4;
  
  // Deductions for common patterns
  if (length < 8) strength -= 20;
  if (password === password.toLowerCase() || password === password.toUpperCase()) {
    strength -= 15;
  }
  if (/^[a-zA-Z]+$/.test(password)) strength -= 10;
  if (/^[0-9]+$/.test(password)) strength -= 20;
  
  return Math.max(0, Math.min(100, Math.round(strength)));
}
