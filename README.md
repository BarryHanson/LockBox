# ByteLock

ByteLock is a full-stack password manager and secret vault built with Next.js, Prisma, and PostgreSQL. The project focuses on encrypted credential storage, vault unlock flows, secure sharing, subscription controls, and browser-assisted autofill.

## Hosted Instance

This service is already being hosted by me at [bytelock.tech](https://bytelock.tech).

## Overview

The application is structured around a vault-first security model:

- The user unlocks the vault with a vault password.
- Sensitive values are encrypted in the browser before being sent to the server.
- The backend stores only ciphertext, metadata, and auth/session information.
- Optional integrations such as Stripe, Plaid, email 2FA, Google account discovery, and HIBP scanning extend the core vault rather than replacing it.

## Core Features

- Encrypted vault for passwords, cards, notes, and files
- Vault setup, unlock, and password-change flows
- Email and authenticator-based 2FA support
- One-time or expiring secure share links for vault items
- Subscription tiers for FREE, PRO, and TEAM plans
- Stripe checkout and webhook synchronization
- Plaid account linking and transaction access
- Google email/account discovery flows
- Privacy scanning against HIBP
- Browser extension for autofill and save-to-vault workflows

## Tech Stack

- Frontend: Next.js 14, React 18, TypeScript
- Styling: Tailwind CSS, Radix UI, Framer Motion, Lucide
- Auth: NextAuth + custom JWT/session handling
- Database: PostgreSQL with Prisma ORM
- Encryption: client-side `crypto.subtle` / Web Crypto APIs plus PBKDF2 + AES-GCM
- Storage: S3-compatible object storage (Cloudflare R2 / Backblaze B2 / generic S3)
- Billing: Stripe
- Finance: Plaid
- Email: Nodemailer / SMTP

## Browser Extension

The project includes a browser extension under the [browser-extension](browser-extension) folder.

It is a Manifest V3 extension designed to:

- detect login fields on websites
- save credentials into the ByteLock flow
- offer autofill for known accounts
- work with the same encryption model used by the web app

The extension uses the same general cryptographic pattern as the main app: password-derived keys, per-field salts, and AES-GCM encryption/decryption in the browser. This keeps the extension aligned with the app’s vault-level security model while still allowing rich browser autofill behavior.

## How Encryption Works

The encryption model is intentionally browser-side and follows a zero-knowledge-style pattern for vault data.

### 1. Password-to-key derivation

The app derives a key from the user’s vault password using PBKDF2 with SHA-256:

- input: user vault password
- salt: random per-value salt
- iterations: 100,000
- output: 256-bit AES key

This happens in the browser using the Web Crypto API (`crypto.subtle`). The raw password is never sent to the server.

The main implementation is in [src/lib/clientCrypto.ts](src/lib/clientCrypto.ts), while the server-side helper code in [src/lib/crypto.ts](src/lib/crypto.ts) reflects the same AES-GCM and PBKDF2 principles for backend consistency.

### 2. Per-field key derivation

The app does not reuse one static key for every field. Instead, each field is encrypted with a derived per-field key:

- start with the master key or master password-derived material
- generate a unique random salt for that item field
- derive a field-specific key from that material and salt
- use the field-specific key for encryption

This is important because it reduces reuse of the same key across unrelated fields and gives the app a stronger per-record encryption pattern.

### 3. AES-GCM encryption

Each field is encrypted with AES-GCM using:

- 256-bit key size
- 12-byte IV
- authenticated encryption with associated data semantics via the AEAD tag

The cryptographic flow is effectively:

```text
password -> PBKDF2 -> AES key
AES key + random IV + plaintext -> AES-GCM ciphertext + auth tag
```

The code stores the `ciphertext`, the `IV`, and the `salt` as metadata so the browser can decrypt later without sending anything sensitive to the server.

### 4. Browser-only decryption

On unlock, the user re-enters the vault password or the app rehydrates the vault key in memory. The browser:

- re-derives the same key from the password and salt
- validates the auth tag
- decrypts the stored ciphertext
- returns the original plaintext value

This means the server sees encrypted values only; it does not have access to plaintext secrets under normal operation.

### 5. Extension parity

The extension implements the same concept in [browser-extension/crypto.js](browser-extension/crypto.js):

- PBKDF2 key derivation
- random per-field salts
- AES-GCM encryption
- IV and metadata handling
- separate key derivation for field-level encryption

This keeps extension-side credential actions consistent with the main web app and avoids a different security model between the browser extension and the vault UI.

## Important Design Notes

- The vault password and derived key material are kept in browser memory rather than persisted to storage.
- Sensitive values are encrypted before storage and decrypted only when the user unlocks the vault.
- File uploads use presigned object storage flows rather than proxying raw file bytes through the app server.
- Access control and feature gating remain server-side, even though the sensitive payload is encrypted client-side.

## Repository Layout

```text
.
├── src/
│   ├── app/                  # App Router pages and API routes
│   ├── components/          # UI and feature components
│   ├── lib/                 # auth, crypto, prisma, integrations, utils
│   ├── middleware.ts
│   └── ...
├── prisma/
│   ├── schema.prisma        # Prisma models
│   ├── seed.ts              # seed script
│   └── migrations/          # DB migrations
├── browser-extension/       # browser extension assets and crypto logic
├── docs/
│   └── openapi.yaml         # OpenAPI reference for API endpoints
├── public/                  # public static assets
├── .env.example             # environment template
├── package.json             # scripts and dependencies
├── next.config.js           # Next.js config
├── README.md                # project documentation
├── tsconfig.json            # TypeScript config
└── ...
```

## Prerequisites

- Node.js 18+
- npm
- PostgreSQL database
- S3-compatible object storage bucket
- Stripe credentials for billing features
- Plaid credentials if finance integration is enabled
- SMTP credentials for email-based 2FA

## Environment Configuration

Create a local environment file from the example:

```bash
cp .env.example .env.local
```

The project expects values like:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/lockboxdb"
JWT_SECRET="your-generated-secret"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-generated-secret"

R2_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"
R2_BUCKET="your-bucket-name"
R2_ACCESS_KEY_ID="your-access-key-id"
R2_SECRET_ACCESS_KEY="your-secret-access-key"

STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLIC_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRO_PRICE_ID="price_..."
STRIPE_TEAM_PRICE_ID="price_..."

NEXT_PUBLIC_TURNSTILE_SITE_KEY="..."
TURNSTILE_SECRET_KEY="..."

SMTP_HOST="localhost"
SMTP_PORT="587"
SMTP_USER="your-email@yourdomain.com"
SMTP_PASSWORD="your-smtp-password"
SMTP_FROM="your-email@yourdomain.com"
```

See [.env.example](.env.example) for the full template.

## Database Setup

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply the schema to the database:

```bash
npm run prisma:migrate
```

Optional seed data:

```bash
npm run prisma:seed
```

## Local Development

Start the app locally:

```bash
npm run dev
```

Then browse:

```text
http://localhost:3000
```

## Production Build

```bash
npm install
npm run build
npm run start
```

Production deployments should keep environment variables configured in the deployment environment, and services should be exposed behind the appropriate platform or reverse proxy layer.

## API Surface

The application exposes a substantial API under `src/app/api`, including:

- `auth` and `user` endpoints
- vault setup, unlock, and password management
- item CRUD for passwords, cards, notes, files, and tags
- 2FA registration and verification
- share link creation and redemption
- subscription checkout and status
- Plaid connectivity endpoints
- Stripe webhook processing
- privacy scan and email discovery flows

The HTTP contract is documented in [docs/openapi.yaml](docs/openapi.yaml).

## Useful Scripts

From [package.json](package.json):

```bash
npm run dev          # start the Next.js app in dev mode
npm run build        # production build
npm run start        # production server
npm run lint         # lint the project
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Contributor Notes

- Keep encryption and access boundaries explicit when modifying vault logic.
- Use migration-safe schema changes for existing data.
- Do not commit real secrets or production credentials.
- Validate environment configuration before deployment.
- Keep the browser extension aligned with the main vault security model whenever modifying crypto code.

## Summary

ByteLock is a security-focused vault platform for managing secrets and sensitive records across the browser, API layer, and browser extension. The project is intentionally structured around encrypted data handling, auth enforcement, and modular integrations so that the vault remains the core security boundary rather than the backend alone.

