import kamaalQualityConfig from '@kamaal111/kamaal-quality-config';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...kamaalQualityConfig.oxfmt,
  ignorePatterns: ['dist', 'pnpm-lock.yaml'],
});
