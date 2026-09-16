import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // better-sqlite3 est un module natif : il doit rester hors de la
    // transformation Vite et tourner dans le contexte Node.
    server: { deps: { external: ["better-sqlite3"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` marque db.ts comme serveur-uniquement pour Next, mais
      // leverait sous Vitest : on l'alias vers un stub inerte.
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});
