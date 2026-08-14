import nodemailer, { Transporter } from 'nodemailer';
import crypto from 'crypto';

let transporter: Transporter | null = null;

/**
 * Initialize the email transporter with SMTP configuration
 * Reads from environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port
 * - SMTP_USER: SMTP username/email
 * - SMTP_PASSWORD: SMTP password
 * - SMTP_FROM: Email address to send from (default: SMTP_USER)
 */
export function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  const isLocalhost = smtpHost === 'localhost' || smtpHost === '127.0.0.1';
  if (!smtpHost || (!isLocalhost && (!smtpUser || !smtpPassword))) {
    throw new Error(
      'Email configuration incomplete. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD environment variables.'
    );
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    ignoreTLS: isLocalhost,
    ...(isLocalhost ? {} : {
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV !== 'development',
      },
    }),
  });

  return transporter;
}

/**
 * Send a 2FA verification code email
 */
export async function send2FACodeEmail(
  userEmail: string,
  verificationCode: string,
): Promise<void> {
  try {
    const transporter = getTransporter();
    const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;

    const mailOptions = {
      from: `ByteLock Support <${smtpFrom}>`,
      to: userEmail,
      subject: 'Your ByteLock Security Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
              background-color: #f9fafb;
              color: #1f2937;
              line-height: 1.6;
            }
            .wrapper { background-color: #f9fafb; padding: 40px 20px; }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff; 
              border-radius: 12px;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #ff6600 0%, #ff8533 100%);
              padding: 40px 20px;
              text-align: center;
              color: #ffffff;
            }
            .logo-container {
              margin-bottom: 20px;
            }
            .logo-img {
              width: 48px;
              height: 48px;
              border-radius: 8px;
              display: inline-block;
            }
            .logo {
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 10px;
              letter-spacing: -0.5px;
            }
            .header-subtitle {
              font-size: 14px;
              opacity: 0.9;
              font-weight: 500;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 20px;
              color: #1f2937;
            }
            .message {
              font-size: 14px;
              color: #4b5563;
              margin-bottom: 30px;
              line-height: 1.7;
            }
            .code-section {
              background: #f9fafb;
              border-left: 4px solid #ff6600;
              padding: 25px;
              border-radius: 8px;
              margin: 30px 0;
              text-align: center;
            }
            .code-label {
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #6b7280;
              margin-bottom: 15px;
              font-weight: 600;
            }
            .code {
              font-size: 42px;
              font-weight: 700;
              letter-spacing: 8px;
              color: #ff6600;
              font-family: 'Monaco', 'Courier New', monospace;
              word-break: break-all;
              line-height: 1.2;
            }
            .expiry {
              color: #6b7280;
              font-size: 13px;
              margin-top: 15px;
              font-weight: 500;
            }
            .security-note {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px 20px;
              border-radius: 6px;
              margin: 25px 0;
            }
            .security-note-title {
              font-weight: 600;
              color: #92400e;
              font-size: 13px;
              margin-bottom: 5px;
            }
            .security-note-text {
              font-size: 13px;
              color: #b45309;
              line-height: 1.6;
            }
            .tips {
              background-color: #f3f4f6;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
            }
            .tips-title {
              font-size: 13px;
              font-weight: 600;
              color: #374151;
              margin-bottom: 12px;
            }
            .tips-list {
              font-size: 13px;
              color: #4b5563;
              line-height: 1.8;
            }
            .tips-list li {
              margin-bottom: 8px;
              margin-left: 20px;
            }
            .footer {
              text-align: center;
              padding: 30px;
              border-top: 1px solid #e5e7eb;
              background-color: #fafbfc;
              font-size: 12px;
              color: #6b7280;
            }
            .footer-link {
              color: #ff6600;
              text-decoration: none;
              font-weight: 500;
            }
            .footer-link:hover {
              text-decoration: underline;
            }
            .button-container {
              text-align: center;
              margin: 30px 0;
            }
            .button {
              display: inline-block;
              background-color: #ff6600;
              color: #ffffff;
              padding: 12px 30px;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 600;
              font-size: 14px;
              transition: background-color 0.2s;
            }
            .button:hover {
              background-color: #e55a00;
              text-decoration: none;
            }
            @media (max-width: 600px) {
              .content { padding: 30px 20px; }
              .code { font-size: 32px; letter-spacing: 4px; }
              .header { padding: 30px 20px; }
              .logo { font-size: 24px; }
            }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="container">
              <div class="header">
                <div class="logo-container">
                  <img src="https://bytelock.tech/orange_logo_no_text.png" alt="ByteLock" class="logo-img" style="width: 48px; height: 48px; border-radius: 8px;">
                </div>
                <div class="logo">ByteLock</div>
                <div class="header-subtitle">🔐 Security Verification</div>
              </div>
              
              <div class="content">
                <div class="greeting">Hello,</div>
                
                <div class="message">
                  We received a login attempt on your ByteLock account. To keep your data secure, please verify this is you by entering the code below:
                </div>
                
                <div class="code-section">
                  <div class="code-label">Your Security Code</div>
                  <div class="code">${verificationCode}</div>
                  <div class="expiry">⏱️ This code expires in 10 minutes</div>
                </div>
                
                <div class="security-note">
                  <div class="security-note-title">⚠️ Important Security Notice</div>
                  <div class="security-note-text">
                    If you didn't request this code, please do not share it with anyone. We recommend changing your password immediately and checking your account activity.
                  </div>
                </div>
                
                <div class="tips">
                  <div class="tips-title">🛡️ Security Tips:</div>
                  <ul class="tips-list">
                    <li>Never share this code with anyone, including ByteLock support staff</li>
                    <li>ByteLock will never ask for your code via email or phone</li>
                    <li>This is a one-time code and cannot be reused</li>
                    <li>Keep your password and 2FA methods secure</li>
                  </ul>
                </div>
              </div>
              
              <div class="footer">
                <p style="margin-bottom: 10px;">© 2026 ByteLock. All rights reserved.</p>
                <p>
                  Need help? <a href="https://bytelock.tech/support" class="footer-link">Contact Support</a> | 
                  <a href="https://bytelock.tech/privacy" class="footer-link">Privacy Policy</a>
                </p>
                <p style="margin-top: 15px; color: #9ca3af; font-size: 11px;">
                  This is an automated security email. Please do not reply to this message.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `ByteLock - Security Verification

Hello,

We received a login attempt on your ByteLock account. Your security code is:

${verificationCode}

This code expires in 10 minutes and can only be used once.

SECURITY WARNING:
- Never share this code with anyone
- ByteLock support will never ask for this code
- If you didn't request this code, please ignore this email and secure your account

For more information about account security, visit: https://bytelock.tech/security

© 2026 ByteLock. All rights reserved.
support@bytelock.tech`,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send 2FA code email:', error);
    throw error;
  }
}

/**
 * Generate a random 6-digit verification code
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Test the email configuration
 */
export async function testEmailConfiguration(): Promise<void> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('✓ Email configuration is valid and ready to send emails');
  } catch (error) {
    console.error('✗ Email configuration test failed:', error);
    throw error;
  }
}
