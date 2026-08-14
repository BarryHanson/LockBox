import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { z } from "zod";
import { logAuditEvent } from "@/lib/fileAuditLog";
import { checkRateLimit } from '@/lib/rate-limit';
import { getTransporter } from '@/lib/email';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    // Rate limit forgot-password: max 3 requests per 15 minutes per email
    const rateLimit = checkRateLimit(`forgot-password:${email.toLowerCase()}`, 3, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        message: "If an account exists with this email, you will receive a password reset link.",
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Don't reveal if user exists or not (security best practice)
    if (!user) {
      await logAuditEvent({
        req: request,
        action: "auth.forgot_password.user_not_found",
        level: "info",
        status: 200,
        metadata: { email },
      });
      return NextResponse.json({
        message: "If an account exists with this email, you will receive a password reset link.",
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetTokenHash,
        resetTokenExpiry,
      },
    });

    // Send email with reset link
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

    try {
      const transporter = getTransporter();

      await transporter.sendMail({
        from: `ByteLock Support <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject: "ByteLock - Password Reset Request",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(to right, #f97316, #ea580c); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">ByteLock</h1>
                <p style="color: white; margin: 5px 0 0 0; opacity: 0.9;">Password Reset Request</p>
              </div>

              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
                <h2 style="color: #1f2937; margin-top: 0;">Reset Your Password</h2>

                <p style="color: #4b5563; font-size: 16px;">
                  We received a request to reset your password. Click the button below to create a new password:
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetUrl}"
                     style="display: inline-block; background: linear-gradient(to right, #f97316, #ea580c); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Reset Password
                  </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                  Or copy and paste this link into your browser:
                </p>
                <p style="color: #f97316; font-size: 14px; word-break: break-all; background: white; padding: 10px; border-radius: 5px; border: 1px solid #e5e7eb;">
                  ${resetUrl}
                </p>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #d1d5db;">
                  <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
                    <strong>This link will expire in 1 hour.</strong>
                  </p>
                  <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
                    If you didn't request a password reset, you can safely ignore this email.
                  </p>
                </div>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #d1d5db; text-align: center;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    ByteLock - Secure Password Manager
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                    This is an automated message, please do not reply.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `
ByteLock - Password Reset Request

We received a request to reset your password.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

ByteLock - Secure Password Manager
        `,
      });
    } catch (emailError) {
      // Don't fail the request if email fails - don't reveal to user
    }

    await logAuditEvent({
      req: request,
      action: "auth.forgot_password.token_generated",
      level: "info",
      status: 200,
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({
      message: "If an account exists with this email, you will receive a password reset link.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to process password reset request" },
      { status: 500 }
    );
  }
}
