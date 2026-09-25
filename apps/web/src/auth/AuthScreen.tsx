import { useEffect, useState } from "react";
import { api } from "../api";
import { useUiStore } from "../state/uiStore";
import { useAuthStore } from "./authStore";
import { tableQuotes } from "./quotes";
import {
  passwordStrength,
  passwordStrengthLabel,
  validateLogin,
  validateSetup,
  type LoginErrors,
  type SetupErrors
} from "./validation";

/*
 * 进入系统前的页面（本地优先形态）：
 * - 首次运行：创建本机管理者账户（setup）
 * - 之后：用户名 + 密码登录
 * 无邮箱验证、无联网依赖。设计：摊开的「书封」。
 */

const strengthColor = ["bg-oxblood", "bg-oxblood", "bg-brass", "bg-forest", "bg-forest"];

/** 开场提示词式轮替名言（D&D 官方作品 + 桌面传统），15 秒淡出淡入，免打扰。 */
function RotatingQuote() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * tableQuotes.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % tableQuotes.length);
        setVisible(true);
      }, 450);
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  const quote = tableQuotes[index]!;

  return (
    <figure aria-live="off" className="min-h-24">
      <div className="transition-opacity duration-500" style={{ opacity: visible ? 1 : 0 }}>
        <blockquote className="text-sm italic leading-relaxed opacity-95">「{quote.text}」</blockquote>
        <figcaption className="mt-2 text-[11px] opacity-60">—— {quote.source}</figcaption>
      </div>
    </figure>
  );
}

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
          「五百年前，矮人和侏儒各氏族签订了著名的『凡戴尔协定』，共同分享潮音洞穴下的富矿资源。」
        </blockquote>
        <p className="mt-2 text-xs opacity-60">—— 《凡戴尔的失落矿坑》开篇</p>
      </div>
      <div className="mt-6 border-t border-white/20 pt-4">
        <RotatingQuote />
      </div>
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

function LoginView({ notice }: { notice?: string | null }) {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateLogin(username, password);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const session = await api.login(username.trim(), password);
      setAuthenticated(session.user);
    } catch (err) {
      setFormError(err instanceof Error && err.message === "INVALID_CREDENTIALS" ? "用户名或密码不正确" : "登录失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h2 className="text-xl font-semibold">登录</h2>
      {notice && (
        <p className="rounded-md border border-forest/40 bg-forest/10 px-3 py-2 text-xs text-forest">{notice}</p>
      )}
      <p className="text-xs text-ink-faint">本机账户。所有数据保存在这台设备上。</p>
      <Field label="用户名" error={errors.username}>
        <input
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputCls}
          placeholder="3–24 个字符"
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
        {busy ? "正在登录…" : "进入工作室"}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        忘记密码？本地账户没有找回渠道——
        数据目录在本机，可按文档重置。
      </p>
    </form>
  );
}

function SetupView({ onCreated }: { onCreated: () => void }) {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<SetupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSetup({ displayName, username, password, confirmPassword });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const session = await api.setup({ displayName: displayName.trim(), username: username.trim(), password });
      setAuthenticated(session.user);
    } catch (err) {
      if (err instanceof Error && err.message === "SETUP_NO_SESSION") {
        // 账户已建、会话未建立：引导去登录
        onCreated();
        return;
      }
      setFormError(
        err instanceof Error && err.message === "REGISTRATION_DISABLED"
          ? "管理者账户已存在，请直接登录"
          : "创建失败，请稍后重试"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h2 className="text-xl font-semibold">欢迎来到工作室</h2>
      <p className="text-xs leading-relaxed text-ink-faint">
        首次运行。创建本机管理者账户——它只存在于这台设备上，不需要联网，也不会发送任何邮件。
      </p>
      <Field label="显示名称（署名用）" error={errors.displayName}>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} placeholder="陆离" autoFocus />
      </Field>
      <Field label="用户名（登录用）" error={errors.username}>
        <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="3–24 个字符" />
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
      {formError && (
        <p role="alert" className="rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-xs text-oxblood">
          {formError}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-md bg-ink py-2 text-sm text-paper hover:bg-ink-soft disabled:opacity-40">
        {busy ? "正在创建…" : "创建并进入"}
      </button>
    </form>
  );
}

export function AuthScreen() {
  const status = useAuthStore((s) => s.status);
  const setStatus = useAuthStore((s) => s.setStatus);
  const theme = useUiStore((s) => s.theme);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div data-theme={theme} className="flex min-h-full items-center justify-center bg-parchment p-4 text-ink">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-hairline shadow-2xl md:flex-row">
        <BrandPanel />
        <div className="flex-1 bg-paper p-8">
          {status === "needsSetup" ? (
            <SetupView
              onCreated={() => {
                setNotice("账户已创建，请直接登录");
                setStatus("guest");
              }}
            />
          ) : (
            <LoginView notice={notice} />
          )}
        </div>
      </div>
    </div>
  );
}
