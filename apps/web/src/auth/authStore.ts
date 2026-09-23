import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccountUser } from "@module-atelier/contracts";
import { api } from "../api";

/**
 * 会话状态（本地账户，contracts 0.4.0）。
 * loading → 启动时检查 setup-status；needsSetup → 首次运行，创建管理者；
 * guest → 未登录；authenticated → 已进入。
 */
export type AuthStatus = "loading" | "needsSetup" | "guest" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: AccountUser | null;

  setStatus(status: AuthStatus): void;
  setAuthenticated(user: AccountUser): void;
  setUser(user: AccountUser): void;
  signOut(): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: "loading",
      user: null,

      setStatus: (status) => set({ status }),
      setAuthenticated: (user) => set({ status: "authenticated", user }),
      setUser: (user) => set({ user }),
      signOut: () => set({ status: "guest", user: null })
    }),
    {
      name: "module-atelier-auth",
      // status 不持久化（每次启动以服务端 setup-status 为准），只记住用户概要
      partialize: (s) => ({ user: s.user })
    }
  )
);

/**
 * 启动引导：首次运行 → needsSetup；已有账户 → 尝试恢复会话（me()），
 * 失败则回到登录。离线/未启动后端时落入 guest（mock 下总能恢复）。
 */
export async function bootstrapAuth(): Promise<void> {
  const { setStatus, setAuthenticated } = useAuthStore.getState();
  try {
    const { needsSetup } = await api.getSetupStatus();
    if (needsSetup) {
      setStatus("needsSetup");
      return;
    }
    const user = await api.me();
    setAuthenticated(user);
  } catch {
    setStatus("guest");
  }
}
