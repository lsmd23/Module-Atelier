import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthScreen } from "./auth/AuthScreen";
import { bootstrapAuth, useAuthStore } from "./auth/authStore";
import { useUiStore } from "./state/uiStore";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 编辑器的本地内容是事实来源；查询缓存不做激进的后台轮询
      staleTime: 30_000,
      refetchOnWindowFocus: false
    }
  }
});

/** 认证门禁 + 项目门禁：未认证只见进入页；工作台的数据流以打开的项目为作用域。 */
function Root() {
  const status = useAuthStore((s) => s.status);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-parchment text-ink-faint">
        <p className="animate-pulse text-2xl tracking-widest">❦</p>
      </div>
    );
  }
  return status === "authenticated" ? <App /> : <AuthScreen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>
);
