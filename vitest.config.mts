import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true, // auto-cleanup de @testing-library/react entre les tests
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
