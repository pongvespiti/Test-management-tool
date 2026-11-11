import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2023',
  // tsup's declaration bundler passes `baseUrl`, deprecated in TypeScript 6.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  // CommonJS dependencies stay external; `cjs.ts` handles their default-export interop.
  external: ['exceljs', 'jszip', '@tmt/shared'],
});
