/**
 * 本地账户表单校验（纯函数，供单元测试）。
 * 与 contracts 0.4.0 对齐：username 3–24，password 8–128，displayName 1–50。
 * 本地优先形态：无邮箱验证、无服务条款勾选。
 */

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

export function isValidUsername(username: string): boolean {
  const u = username.trim();
  return u.length >= 3 && u.length <= 24;
}

export interface SetupInput {
  displayName: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export type SetupErrors = Partial<
  Record<"displayName" | "username" | "password" | "confirmPassword", string>
>;

/** 首次运行：创建本机管理者账户。 */
export function validateSetup(input: SetupInput): SetupErrors {
  const errors: SetupErrors = {};
  const name = input.displayName.trim();
  if (name.length === 0) errors.displayName = "请填写显示名称";
  else if (name.length > 50) errors.displayName = "显示名称最长 50 字";

  if (!isValidUsername(input.username)) errors.username = "用户名需为 3–24 个字符";

  if (passwordStrength(input.password) < 2) errors.password = "密码至少 8 位，建议混合大小写与数字";
  else if (input.password.length > 128) errors.password = "密码最长 128 位";
  if (input.confirmPassword !== input.password) errors.confirmPassword = "两次输入的密码不一致";
  return errors;
}

export type LoginErrors = Partial<Record<"username" | "password", string>>;

export function validateLogin(username: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (username.trim().length === 0) errors.username = "请输入用户名";
  if (password.length === 0) errors.password = "请输入密码";
  return errors;
}
