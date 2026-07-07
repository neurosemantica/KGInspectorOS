import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "cosmos-vendor": ["@cosmos.gl/graph"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },

  json: { stringify: true },
});
