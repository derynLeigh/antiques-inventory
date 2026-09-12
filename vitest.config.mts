import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest config. tsconfigPaths honours the @/* alias from tsconfig.json so
 * test imports match app imports. We use the default "node" environment —
 * these are pure-logic tests (filters, validation), no DOM needed, so we
 * skip jsdom and the React testing libraries entirely. Component/E2E tests
 * can be added later if the app grows that need.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
