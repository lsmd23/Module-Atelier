/**
 * 认证表单校验（纯函数，供单元测试）。
 * 规则与常见商用惯例对齐；服务端侧的权威校验待 auth 契约冻结。
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim()) && email.length <= 254;
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

/** 0=过短 1=弱 2=中 3=强 4=很强 */
export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score) as PasswordStrength;
}

export const passwordStrengthLabel = ["过短", "弱", "中", "强", "很强"] as const;

export function isValidVerificationCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

export type FieldErrors = Partial<Record<"displayName" | "email" | "password" | "confirmPassword" | "acceptedTerms", string>>;

export function validateRegister(input: RegisterInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.displayName.trim();
  if (name.length === 0) errors.displayName = "请填写显示名称";
  else if (name.length > 50) errors.displayName = "显示名称最长 50 字";

  if (!isValidEmail(input.email)) errors.email = "邮箱格式不正确";

  if (passwordStrength(input.password) < 2) errors.password = "密码至少 8 位，建议混合大小写与数字";
  if (input.confirmPassword !== input.password) errors.confirmPassword = "两次输入的密码不一致";
  if (!input.acceptedTerms) errors.acceptedTerms = "请先同意服务条款与隐私政策";
  return errors;
}

export type LoginErrors = Partial<Record<"email" | "password", string>>;

export function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!isValidEmail(email)) errors.email = "邮箱格式不正确";
  if (password.length === 0) errors.password = "请输入密码";
  return errors;
}
