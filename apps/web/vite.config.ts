import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return
          }

          if (
            id.includes("/react-router/") ||
            id.includes("/react-router-dom/") ||
            id.includes("/@remix-run/router/")
          ) {
            return "router"
          }

          if (id.includes("/@tanstack/")) {
            return "tanstack"
          }

          if (
            id.includes("/radix-ui/") ||
            id.includes("/@radix-ui/") ||
            id.includes("/@base-ui/")
          ) {
            return "ui-radix"
          }

          if (
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/") ||
            id.includes("/zod/")
          ) {
            return "forms"
          }

          if (id.includes("/better-auth/")) {
            return "auth"
          }

          if (id.includes("/axios/")) {
            return "http"
          }

          if (id.includes("/lucide-react/")) {
            return "icons"
          }
        },
      },
    },
  },
})
