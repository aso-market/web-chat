import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        demo: "demo.html",
      },
    },
  },
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(process.env.VITE_API_BASE),
  },
});
