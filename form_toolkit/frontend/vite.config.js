// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, "../static"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Tüm API istekleri unified backend'e (port 5002) gider.
      // Yeni: /api/forms/<slug>/*  · Eski: /api/oturum/*, /api/pesel/* (legacy compat)
      "/api": {
        target: "http://localhost:5002",
        changeOrigin: true,
      },
    },
  },
});
