/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: web app manifest + injectManifest service worker (src/sw.ts) with
    // precaching, API runtime caching (offline), and push handling.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // manual registerSW() in main.tsx
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
      manifest: {
        name: "Plannerr",
        short_name: "Plannerr",
        description: "Your daily assignments, at a glance.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // In dev, the browser talks to Vite; /api is forwarded to the API.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks → better caching, smaller main chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("rehype-") ||
            id.includes("micromark") ||
            id.includes("unified") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("unist") ||
            id.includes("vfile") ||
            id.includes("character-entities")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
            return "vendor-react";
          }
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
