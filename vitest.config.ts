import { defineConfig } from "vitest/config";

/**
 * Lab UI suites (account.session, fee wallet smoke) need isLabApiEnabled().
 * Loopback origin only — never a public API in tests.
 */
export default defineConfig({
  define: {
    "import.meta.env.VITE_LAB_API": JSON.stringify("1"),
    "import.meta.env.VITE_EXCHANGE_API_ORIGIN": JSON.stringify("http://127.0.0.1:18443"),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Live loopback custody — opt-in only (EX_LIVE_LAB=1). Must not flake D0 `npm test` gate.
    // Keep vitest defaults when overriding `exclude`.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      ...(process.env.EX_LIVE_LAB === "1" ? [] : ["src/labCustody.live.test.ts"]),
    ],
    setupFiles: ["src/testSetup.ts"],
    env: {
      VITE_LAB_API: "1",
      VITE_EXCHANGE_API_ORIGIN: "http://127.0.0.1:18443",
    },
  },
});
