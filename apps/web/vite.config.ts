import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 本地优先架构的联调代理：浏览器只跟 5173 同源通信，/api 转发到本机 API。
    // 会话 cookie 因此保持 same-origin，无需 CORS 凭证配置。
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
