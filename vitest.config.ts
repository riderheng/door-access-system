import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./client/src/test-setup.ts"],
          include: [
            "client/src/**/*.test.ts",
            "client/src/**/*.test.tsx",
            "shared/**/*.test.ts",
          ],
        },
      },
    ],
  },
});
