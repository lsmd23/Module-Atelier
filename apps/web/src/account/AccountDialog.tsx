import { useEffect, useState } from "react";
import type { AccountSession, AccountUser } from "@module-atelier/contracts";
import { api } from "../api";
import type { ProjectMember } from "../api/types";
import { useAuthStore } from "../auth/authStore";
import { passwordStrength, passwordStrengthLabel } from "../auth/validation";
import { useUiStore } from "../state/uiStore";

/*
 * 账户管理对话框（右上角头像 →「账户与安全」）。
 * 本地账户（contracts 0.4.0）：无邮箱验证、无找回邮件；密码修改后服务端会
 * 吊销其它会话。成员分区为 MOCK 演示位（BE-002 phase 2 待落地）。
 */

type SectionId = "profile" | "security" | "sessions" | "members";

const sections: { id: SectionId; label: string; mock?: boolean }[] = [
  { id: "profile", label: "个人资料" },
  { id: "security", label: "安全" },
  { id: "sessions", label: "会话" },
  { id: "members", label: "成员与权限", mock: true }
];

const roleText: Record<AccountUser["role"], string> = { author: "作者", collaborator: "协作者", reader: "只读" };
const planText: Record<AccountUser["plan"], string> = { free: "免费版", creator: "创作者版", studio: "工作室版" };
const memberRoleText: Record<ProjectMember["role"], string> = { author: "作者", collaborator: "协作者", reader: "只读" };

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function ProfileSection({ user }: { user: AccountUser }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState(user.displayName);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="text-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-oxblood/40 bg-oxblood/10 text-xl text-oxblood">
          {user.displayName.slice(0, 1)}
        </span>
        <div>
          <p className="font-semibold">{user.displayName}</p>
          <p className="text-xs text-ink-faint">@{user.username}</p>
        </div>
      </div>

      <FieldRow label="显示名称">
        <span className="flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            className="w-48 rounded-md border border-hairline bg-paper px-2 py-1 text-sm outline-none focus:border-brass"
          />
          <button
            type="button"
            disabled={busy || !name.trim() || name.trim() === user.displayName}
            onClick={() => {
              setBusy(true);
              void api
                .updateProfile(name.trim())
                .then((u) => {
                  setUser(u);
                  setSaved(true);
                })
                .finally(() => setBusy(false));
            }}
            className="rounded-md border border-hairline px-2.5 text-xs text-ink-soft hover:border-brass disabled:opacity-40"
          >
            {saved ? "已保存" : "保存"}
          </button>
        </span>
      </FieldRow>
      <FieldRow label="用户名">@{user.username}</FieldRow>
      <FieldRow label="邮箱">
        <span className="text-ink-faint">未设置（本地账户不联网，邮箱仅作可选项）</span>
      </FieldRow>
      <FieldRow label="角色">{roleText[user.role]}</FieldRow>
      <FieldRow label="计划">{planText[user.plan]}</FieldRow>
      <FieldRow label="注册时间">{new Date(user.createdAt).toLocaleString("zh-CN")}</FieldRow>
      <FieldRow label="上次登录">
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "—"}
      </FieldRow>
    </div>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(next);

  const submitPassword = () => {
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    if (strength < 2) {
      setMsg({ ok: false, text: "新密码太弱（至少 8 位，建议混合大小写与数字）" });
      return;
    }
    setBusy(true);
    api
      .changePassword(current, next)
      .then(() => {
        setMsg({ ok: true, text: "密码已更新，其它设备的会话已吊销" });
        setCurrent("");
        setNext("");
        setConfirm("");
      })
      .catch((e: Error) =>
        setMsg({ ok: false, text: e.message === "INVALID_CREDENTIALS" ? "当前密码不正确" : "修改失败，请稍后重试" })
      )
      .finally(() => setBusy(false));
  };

  const inputCls =
    "w-full rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-brass";

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">修改密码</h4>
        <div className="max-w-xs space-y-2">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="当前密码"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="新密码（至少 8 位）"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputCls}
          />
          {next.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="flex h-1 flex-1 overflow-hidden rounded bg-hairline">
                <span
                  className={`h-full ${strength >= 3 ? "bg-forest" : strength >= 2 ? "bg-brass" : "bg-oxblood"}`}
                  style={{ width: `${(strength / 4) * 100}%` }}
                />
              </span>
              <span className="text-[11px] text-ink-faint">{passwordStrengthLabel[strength]}</span>
            </span>
          )}
          <input
            type="password"
            autoComplete="new-password"
            placeholder="确认新密码"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
          />
          {msg && (
            <p role="alert" className={`text-xs ${msg.ok ? "text-forest" : "text-oxblood"}`}>
              {msg.text}
            </p>
          )}
          <button
            type="button"
            disabled={busy || !current || !next || !confirm}
            onClick={submitPassword}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-paper hover:bg-ink-soft disabled:opacity-40"
          >
            更新密码
          </button>
        </div>
      </section>

      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">本地账户说明</h4>
        <p className="rounded border border-hairline bg-paper px-2.5 py-2 text-xs leading-relaxed text-ink-soft">
          账户只存在于这台设备的数据目录里，没有云端找回。忘记密码只能按文档重置数据目录中的账户库。
        </p>
      </section>
    </div>
  );
}

function SessionsSection() {
  const signOut = useAuthStore((s) => s.signOut);
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);

  const reload = () => {
    void api.listSessions().then(setSessions).catch(() => setSessions([]));
  };
  useEffect(reload, []);

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">活跃会话</h4>
        {sessions === null ? (
          <p className="text-xs text-ink-faint">读取中…</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-ink-faint">（无）</p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${s.current ? "bg-forest" : "bg-ink-faint"}`} />
                <div className="text-xs">
                  <p className="font-medium text-ink">{s.userAgent ?? "未知设备"}</p>
                  <p className="text-ink-faint">
                    创建于 {new Date(s.createdAt).toLocaleString("zh-CN")} · 过期{" "}
                    {new Date(s.expiresAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                {s.current ? (
                  <span className="ml-auto rounded-full bg-forest/15 px-2 py-px text-[10px] text-forest">当前</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void api.revokeSession(s.id).then(reload)}
                    className="ml-auto rounded border border-oxblood/40 px-2 py-0.5 text-xs text-oxblood hover:bg-oxblood/10"
                  >
                    吊销
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <button
        type="button"
        onClick={() => {
          void api.logout();
          signOut();
        }}
        className="rounded-md border border-oxblood/50 px-4 py-1.5 text-sm text-oxblood hover:bg-oxblood/10"
      >
        退出登录
      </button>
    </div>
  );
}

function MembersSection() {
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectId = useUiStore((s) => s.currentProjectId);
  useEffect(() => {
    if (!projectId) return;
    api
      .listMembers(projectId)
      .then(setMembers)
      .catch(() => setError("成员路由在当前数据模式下不可用"));
  }, [projectId]);
  return (
    <div>
      <p className="mb-3 rounded-md border border-dashed border-brass/60 bg-brass/5 px-3 py-2 text-xs leading-relaxed text-brass">
        MOCK ONLY —— 项目成员与权限模型待 BE-002 phase 2 落地。以下为界面演示位，不可编辑。
      </p>
      {error && <p className="text-sm text-oxblood">{error}</p>}
      <ul className="space-y-2">
        {(members ?? []).map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2 text-sm">
            <span className="shrink-0 whitespace-nowrap font-medium">{m.name}</span>
            {m.you && <span className="rounded-full bg-oxblood/10 px-1.5 text-[10px] text-oxblood">你</span>}
            <span className="rounded-full border border-hairline px-2 py-px text-[11px] text-ink-soft">
              {memberRoleText[m.role]}
            </span>
            {m.note && <span className="ml-auto truncate text-[11px] text-ink-faint">{m.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountDialog() {
  const user = useAuthStore((s) => s.user);
  const setOpen = useUiStore((s) => s.setAccountOpen);
  const [section, setSection] = useState<SectionId>("profile");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!user) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="账户与安全"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex h-[30rem] w-full max-w-2xl overflow-hidden rounded-lg border border-hairline bg-parchment shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="flex w-40 shrink-0 flex-col border-r border-hairline bg-parchment-deep/50 p-2" aria-label="账户分区">
          <p className="label-caps mb-2 px-2 pt-1 text-[11px] text-ink-faint">账户</p>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? "page" : undefined}
              className={`rounded px-2.5 py-1.5 text-left text-sm ${
                section === s.id ? "bg-ink/8 font-semibold text-ink" : "text-ink-soft hover:bg-parchment-deep"
              }`}
            >
              {s.label}
              {s.mock && <span className="ml-1 text-[9px] text-brass">MOCK</span>}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{sections.find((s) => s.id === section)?.label}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-0.5 text-ink-faint hover:bg-parchment-deep hover:text-ink"
              aria-label="关闭账户设置"
            >
              ×
            </button>
          </div>
          {section === "profile" && <ProfileSection user={user} />}
          {section === "security" && <SecuritySection />}
          {section === "sessions" && <SessionsSection />}
          {section === "members" && <MembersSection />}
        </div>
      </div>
    </div>
  );
}
