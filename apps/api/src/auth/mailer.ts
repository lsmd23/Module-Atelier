/**
 * Verification-code delivery.
 *
 * Phase 1 ships no SMTP dependency: the transport is a sink, so the default
 * deployment writes codes to the API log and tests capture them. A real SMTP
 * transport can be added behind this same interface.
 */

export type VerificationCodeType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export type VerificationMail = {
  email: string;
  code: string;
  type: VerificationCodeType;
};

export type Mailer = {
  sendVerificationCode: (mail: VerificationMail) => Promise<void>;
  /**
   * Development aid only: the most recent code sent to an address, available
   * for a short window. Returns undefined unless `rememberCodes` is enabled.
   */
  peekLastCode: (email: string) => string | undefined;
};

export type MailSink = (mail: VerificationMail) => void;

const rememberedCodeTtlMs = 10 * 60 * 1000;

/**
 * `rememberCodes` backs the AUTH_DEV_EXPOSE_CODE flag. It keeps the code in
 * process memory for ten minutes so a developer (and the frontend tests) can
 * complete the flow without reading the server log. It must stay off in any
 * deployment: the API route only returns the code when that flag is enabled.
 */
export function createLogMailer(sink: MailSink, options: { rememberCodes?: boolean } = {}): Mailer {
  const remembered = new Map<string, { code: string; at: number }>();

  return {
    sendVerificationCode: async (mail) => {
      sink(mail);
      if (options.rememberCodes === true) {
        remembered.set(mail.email.toLowerCase(), { code: mail.code, at: Date.now() });
      }
    },
    peekLastCode: (email) => {
      const entry = remembered.get(email.toLowerCase());
      if (entry === undefined) {
        return undefined;
      }
      if (Date.now() - entry.at > rememberedCodeTtlMs) {
        remembered.delete(email.toLowerCase());
        return undefined;
      }
      return entry.code;
    }
  };
}