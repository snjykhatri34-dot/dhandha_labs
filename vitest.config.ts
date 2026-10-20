import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // lib/data/index.ts guards against client imports; tests run on the server side.
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // tests/live talks to the real Supabase project: run it on purpose with `npm run test:live`.
    exclude: ["tests/live/**", "node_modules/**"],
    env: { MOCK_ANALYSE_DELAY_MS: "0" },
  },
});
