import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.data/**", "**/data/**", "**/.production-smoke/**"] },
    watch: {
      ignored: [
        "**/.data/**",
        "**/data/**",
        "**/.production-smoke/**",
        "**/artifacts/**",
        "**/server/**",
      ],
    },
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
