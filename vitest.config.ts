import { defineConfig } from 'vitest/config';

const DEFAULT_TIMEOUT = 5_000;

const FUZZ_TIMEOUT = 600_000;

function testTimeout(): number {
  const runs = Number(process.env.FUZZ_RUNS);

  return Number.isInteger(runs) && runs > 0 ? FUZZ_TIMEOUT : DEFAULT_TIMEOUT;
}

const config = defineConfig({
  test: {
    globals: true,
    testTimeout: testTimeout(),
    include: ['test/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});

export default config;
