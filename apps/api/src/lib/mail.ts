import { Resend } from "resend";

import { env } from "@/lib/env";
import logger from "@/lib/logger";

const resend = new Resend(env.RESEND_API_KEY);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Transactional mail via Resend used by Better Auth and app notifications. */
export async function sendPasswordResetEmail(
  to: string,
  url: string,
): Promise<void> {
  return resend.emails
    .send({
      from: env.RESEND_FROM,
      to,
      subject: "Reset your password",
      html: `<p>Click the link below to choose a new password. This link expires soon.</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
      tags: [{ name: "type", value: "password-reset" }],
    })
    .then(({ error }) => {
      if (error) {
        logger.error({ err: error, to }, "Resend password reset failed");
      }
    })
    .catch((err: unknown) => {
      logger.error({ err, to }, "Resend password reset failed");
    });
}

export async function sendVerificationEmail(
  to: string,
  url: string,
  displayName?: string | null,
): Promise<void> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,";
  return resend.emails
    .send({
      from: env.RESEND_FROM,
      to,
      subject: "Verify your email",
      html: `<p>${greeting}</p><p>Please confirm your email address by clicking the link below.</p><p><a href="${escapeHtml(url)}">Verify email</a></p><p>If you did not create an account, you can ignore this email.</p>`,
      tags: [{ name: "type", value: "email-verification" }],
    })
    .then(({ error }) => {
      if (error) {
        logger.error({ err: error, to }, "Resend verification email failed");
      }
    })
    .catch((err: unknown) => {
      logger.error({ err, to }, "Resend verification email failed");
    });
}
