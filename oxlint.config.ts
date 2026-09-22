import kamaalQualityConfig from '@kamaal111/kamaal-quality-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [kamaalQualityConfig.oxlint],
  options: {
    reportUnusedDisableDirectives: 'error',
  },
  plugins: ['vitest'],
  rules: {
    'no-restricted-globals': [
      'error',
      {
        name: 'Reflect',
        message:
          'Reflect is a way to write past a readonly type without an `as` cast. Give the value a real mutable type instead.',
      },
    ],
  },
  ignorePatterns: ['dist/**/*'],
});
