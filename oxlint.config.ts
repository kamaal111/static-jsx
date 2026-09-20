import kamaalQualityConfig from '@kamaal111/kamaal-quality-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [kamaalQualityConfig],
  options: {
    reportUnusedDisableDirectives: 'error',
  },
  plugins: ['vitest'],
  rules: {
    'vitest/no-conditional-expect': 'error',
    'no-restricted-globals': [
      'error',
      {
        name: 'Reflect',
        message:
          'Reflect is a way to write past a readonly type without an `as` cast. Give the value a real mutable type instead.',
      },
    ],
    'unicorn/no-abusive-eslint-disable': 'error',
  },
  ignorePatterns: ['dist/**/*'],
});
