import { useEffect, useState } from "react";
import { api, apiMode } from "../api";
import { useUiStore } from "../state/uiStore";
import { useAuthStore } from "./authStore";
import {
  isValidVerificationCode,
  passwordStrength,
  passwordStrengthLabel,
  validateLogin,
  validateRegister,
  type FieldErrors,
  type LoginErrors
} from "./validation";

/*
 * 进入系统前的页面：登录 / 注册 / 邮箱验证。
 * 设计：摊开的「书封」——左侧品牌页（书名、引文、特性），右侧表单页。
 * 数据层 MOCK ONLY（契约未冻结）；交互、校验、状态机均为真实实现。
 */

const strengthColor = ["bg-oxblood", "bg-oxblood", "bg-brass", "bg-forest", "bg-forest"];

function BrandPanel() {
  // 品牌页用固定的深红书面色，不随界面主题漂移（书封是品牌的一部分）
  return (
    <div className="flex flex-col justify-between bg-[#4a1f1f] p-8 text-[#f5ead3] md:min-h-[34rem] md:w-80">
      <div>
        <p className="text-2xl tracking-widest">❦</p>
        <h1 className="mt-4 text-3xl font-bold leading-snug tracking-wide">Module Atelier</h1>
        <p className="label-caps mt-1 text-xs opacity-80">Adventure Authoring IDE</p>
        <div className="my-6 border-t border-white/20" />
        <blockquote className="text-sm leading-relaxed opacity-90">
          「浓雾从北方的山脊压下来，像一床浸了水的灰毯，把镇口的绞架和路牌一并吞没。」
        </blockquote>
        <p className="mt-2 text-xs opacity-60">—— 《雾锁矿脉》第一章</p>
      </div>
      <ul className="space-y-2 text-xs leading-relaxed opacity-80">
        <li>✒ 作者执笔，Agent 协助，编译器成书</li>
        <li>✦ 建议静默到达，改动必经你审阅</li>
        <li>⛁ 本地草稿 + 服务端修订，不丢一个字</li>
      </ul>
    </div>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="label-caps text-[11px] text-ink-faint">{label}</span>
      <span className="mt-1 block">{children}</span>
      {error && (
        <span role="alert" className="mt-1 block text-xs text-oxblood">
          {error}
        </span>
      )}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm outline-none focus:border-brass placeholder:text-ink-faint";

function LoginView({ onGotoRegister }: { onGotoRegister: () => void }) {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateLogin(email, password);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await api.login(email.trim(), password);
      if (result.session) setAuthenticated(result.session.user);
    } catch (err) {
      setFormError(err instanceof Error && err.message === "INVALID_CREDENTIALS" ? "邮箱或密码不正确" : "登录失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h2 className="text-xl font-semibold">登录</h2>
      <Field label="邮箱" error={errors.email}>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          placeholder="you@example.com"
          autoFocus
        />
      </Field>
      <Field label="密码" error={errors.password}>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder="••••••••"
        />
      </Field>
      {formError && (
        <p role="alert" className="rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-xs text-oxblood">
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-ink py-2 text-sm text-paper hover:bg-ink-soft disabled:opacity-40"
      >
        {busy ? "正在登录…" : "登录"}
      </button>
      <p className="text-center text-xs text-ink-faint">
        还没有账户？{" "}
        <button type="button" onClick={onGotoRegister} className="text-oxblood hover:underline">
          注册
        </button>
      </p>
      {apiMode === "mock" && (
        <p className="rounded border border-dashed border-brass/50 px-2 py-1.5 text-center text-[11px] text-brass">
          演示模式：任意邮箱 + 8 位以上密码即可进入
        </p>
      )}
    </form>
  );
}

function RegisterView({ onGotoLogin }: { onGotoLogin: () => void }) {
  const setPendingVerification = useAuthStore((s) => s.setPendingVerification);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateRegister({ displayName, email, password, confirmPassword, acceptedTerms });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await api.register({ displayName: displayName.trim(), email: email.trim(), password });
      if (result.requiresVerification) {
        await api.sendVerificationCode(email.trim());
        setPendingVerification(email.trim());
      }
    } catch {
      setFormError("注册失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h2 className="text-xl font-semibold">注册</h2>
      <Field label="显示名称" error={errors.displayName}>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} placeholder="陆离" autoFocus />
      </Field>
      <Field label="邮箱（用于验证与找回）" error={errors.email}>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
      </Field>
      <Field label="密码" error={errors.password}>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder="至少 8 位"
        />
        {password.length > 0 && (
          <span className="mt-1.5 flex items-center gap-2">
            <span className="flex h-1 flex-1 overflow-hidden rounded bg-hairline">
              <span className={`h-full ${strengthColor[strength]}`} style={{ width: `${(strength / 4) * 100}%` }} />
            </span>
            <span className="text-[11px] text-ink-faint">{passwordStrengthLabel[strength]}</span>
          </span>
        )}
      </Field>
      <Field label="确认密码" error={errors.confirmPassword}>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputCls}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-ink-soft">
        <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5" />
        <span>
          我已阅读并同意<span className="text-oxblood">《服务条款》</span>与<span className="text-oxblood">《隐私政策》</span>
        </span>
      </label>
      {errors.acceptedTerms && (
        <p role="alert" className="text-xs text-oxblood">
          {errors.acceptedTerms}
        </p>
      )}
      {formError && (
        <p role="alert" className="rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-xs text-oxblood">
          {formError}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-md bg-ink py-2 text-sm text-paper hover:bg-ink-soft disabled:opacity-40">
        {busy ? "正在创建…" : "创建账户"}
      </button>
      <p className="text-center text-xs text-ink-faint">
        已有账户？{" "}
        <button type="button" onClick={onGotoLogin} className="text-oxblood hover:underline">
          登录
        </button>
      </p>
    </form>
  );
}

function VerifyView({ email, onBack }: { email: string; onBack: () => void }) {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (!isValidVerificationCode(value)) {
      setError("验证码为 6 位数字");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await api.verifyEmail(email, value);
      setAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error && err.message === "INVALID_CODE" ? "验证码不正确或已过期" : "验证失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">验证邮箱</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        验证码已发送至 <span className="font-semibold text-ink">{email}</span>。
        输入邮件中的 6 位数字完成注册。
      </p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        autoFocus
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(v);
          if (v.length === 6) void submit(v);
        }}
        className="w-full rounded-md border border-hairline bg-paper px-3 py-3 text-center text-2xl tracking-[0.6em] outline-none focus:border-brass"
        placeholder="——————"
        aria-label="6 位验证码"
      />
      {error && (
        <p role="alert" className="text-xs text-oxblood">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={onBack} className="text-ink-faint hover:text-ink">
          ← 返回
        </button>
        <button
          type="button"
          disabled={cooldown > 0}
          onClick={() => {
            void api.sendVerificationCode(email);
            setCooldown(60);
          }}
          className="text-oxblood hover:underline disabled:text-ink-faint disabled:no-underline"
        >
          {cooldown > 0 ? `重新发送（${cooldown}s）` : "重新发送验证码"}
        </button>
      </div>
      {apiMode === "mock" && (
        <p className="rounded border border-dashed border-brass/50 px-2 py-1.5 text-center text-[11px] text-brass">
          演示模式验证码：246810
        </p>
      )}
    </div>
  );
}

export function AuthScreen() {
  const status = useAuthStore((s) => s.status);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const signOut = useAuthStore((s) => s.signOut);
  const [view, setView] = useState<"login" | "register">("login");
  const theme = useUiStore((s) => s.theme);

  const body =
    status === "pendingVerification" && pendingEmail ? (
      <VerifyView email={pendingEmail} onBack={() => signOut()} />
    ) : view === "login" ? (
      <LoginView onGotoRegister={() => setView("register")} />
    ) : (
      <RegisterView onGotoLogin={() => setView("login")} />
    );

  return (
    <div data-theme={theme} className="flex min-h-full items-center justify-center bg-parchment p-4 text-ink">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-hairline shadow-2xl md:flex-row">
        <BrandPanel />
        <div className="flex-1 bg-paper p-8">{body}</div>
      </div>
    </div>
  );
}
