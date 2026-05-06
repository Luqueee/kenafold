import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return

          // Heavy syntax-highlight lib — only used in code-preview
          if (id.includes("shiki")) return "vendor-shiki"

          // Charts — only used in disk-usage-panel
          if (
            id.includes("recharts") ||
            id.includes("/d3-") ||
            id.includes("d3/") ||
            id.includes("victory-")
          )
            return "vendor-charts"

          // React core
          if (id.includes("react-dom") || /\/react\//.test(id))
            return "vendor-react"

          // Drag & drop
          if (id.includes("@dnd-kit")) return "vendor-dnd"

          // TanStack (table, virtual, hotkeys)
          if (id.includes("@tanstack")) return "vendor-tanstack"

          // UI primitives (radix, lucide, fonts, animation)
          if (
            id.includes("radix-ui") ||
            id.includes("lucide-react") ||
            id.includes("@fontsource") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("vaul") ||
            id.includes("sonner") ||
            id.includes("next-themes") ||
            id.includes("react-resizable-panels")
          )
            return "vendor-ui"
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
})
