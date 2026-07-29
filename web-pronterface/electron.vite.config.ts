import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(
          "electron/main/index.ts",
        ),
      },
    },
  },

  preload: {
    build: {
      rollupOptions: {
        input: resolve(
          "electron/preload/index.ts",
        ),
      },
    },
  },

  renderer: {
    root: ".",

    base: "./",

    plugins: [
      react(),
    ],

    resolve: {
      alias: {
        "@": resolve("src"),
      },
    },

    build: {
      rollupOptions: {
        input: resolve("index.html"),
      },
    },
  },
});