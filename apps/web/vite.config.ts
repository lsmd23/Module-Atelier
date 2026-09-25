import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // DEV DEMO ONLY (not committed to the branch): the API sends no CORS headers,
  // so the dev server proxies /api. The frontend's own launcher branch adds this
  // properly; docs/INTEGRATION.md asks for it.
  server: { proxy: { "/api": { target: "http://127.0.0.1:30017", changeOrigin: false } } },
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
