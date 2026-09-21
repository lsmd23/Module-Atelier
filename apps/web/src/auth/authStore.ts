import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccountUser } from "../api/types";

/**
 * 会话状态（MOCK ONLY 数据源）。
 * guest → 未登录；pendingVerification → 已注册待邮箱验证；authenticated → 已进入工作台。
 */
export type AuthStatus = "guest" | "pendingVerification" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: AccountUser | null;
  /** 注册后等待验证的邮箱 */
  pendingEmail: string | null;

  setAuthenticated(user: AccountUser): void;
  setPendingVerification(email: string): void;
  setUser(user: AccountUser): void;
  signOut(): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: "guest",
      user: null,
      pendingEmail: null,

      setAuthenticated: (user) => set({ status: "authenticated", user, pendingEmail: null }),
      setPendingVerification: (pendingEmail) => set({ status: "pendingVerification", pendingEmail }),
      setUser: (user) => set({ user }),
      signOut: () => set({ status: "guest", user: null, pendingEmail: null })
    }),
    { name: "module-atelier-auth" }
  )
);
