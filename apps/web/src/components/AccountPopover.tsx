import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuthStore } from "../auth/authStore";
import { useUiStore } from "../state/uiStore";

/*
 * 账户入口（顶栏右上角作者头像 → 下拉卡）。
 * 账户信息来自真实登录态（authStore，mock 数据源）；成员列表为 MOCK 演示位。
 */

export function AccountPopover() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const setAccountOpen = useUiStore((s) => s.setAccountOpen);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const initial = user.displayName.slice(0, 1);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="账户"
        title="账户"
        className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs ${
          open ? "border-oxblood/60 bg-paper" : "border-hairline bg-paper hover:border-brass"
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-oxblood/10 text-[11px] font-semibold text-oxblood">
          {initial}
        </span>
        <span className="max-w-20 truncate text-ink-soft">{user.displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="账户"
          className="absolute right-0 z-40 mt-1.5 w-72 rounded-md border border-hairline bg-paper p-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-oxblood/40 bg-oxblood/10 text-lg text-oxblood">
              {initial}
            </span>
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-ink-faint">@{user.username}</p>
            </div>
          </div>

          <dl className="mt-3 space-y-1 border-t border-hairline pt-2 text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-ink-faint">账户类型</dt>
              <dd className="text-ink-soft">本机账户</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-ink-faint">角色</dt>
              <dd className="text-ink-soft">作者</dd>
            </div>
          </dl>

          <div className="mt-3 space-y-1 border-t border-hairline pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAccountOpen(true);
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-parchment"
            >
              账户与安全…
            </button>
            <button
              type="button"
              onClick={() => {
                void api.logout();
                signOut();
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-oxblood hover:bg-oxblood/10"
            >
              退出登录
            </button>
          </div>

          <p className="mt-2 border-t border-hairline pt-2 text-[10px] leading-relaxed text-ink-faint">
            本地账户（契约 0.4.0）：数据保存在本机数据目录，无需联网。
          </p>
        </div>
      )}
    </div>
  );
}
