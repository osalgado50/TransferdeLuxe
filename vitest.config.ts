import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["tests/unit/**/*.test.ts"], exclude: ["**/node_modules/**", "movil/**"], environment: "node" },
});
