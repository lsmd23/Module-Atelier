import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuthStore } from "./auth/authStore";
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

/** 认证门禁：未登录时只渲染进入页，工作台（及其数据流）不挂载。 */
function Root() {
  const status = useAuthStore((s) => s.status);
  return status === "authenticated" ? <App /> : <AuthScreen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>
);
