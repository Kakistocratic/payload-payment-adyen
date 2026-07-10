import { defineConfig } from 'tsup'

const external = [
  '@adyen/adyen-web',
  '@adyen/adyen-web/auto',
  '@payloadcms/plugin-ecommerce',
  '@payloadcms/plugin-ecommerce/client/react',
  '@payloadcms/plugin-ecommerce/types',
  'crypto',
  'next',
  'next/navigation',
  'payload',
  'react',
  'react-dom',
  'react/jsx-runtime',
]

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    'bin/migrate-starter': 'src/bin/migrate-starter.ts',
    client: 'src/client.ts',
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    utilities: 'src/utilities.ts',
  },
  external,
  format: ['esm'],
  outDir: 'dist',
  sourcemap: true,
  splitting: false,
  target: 'es2022',
})
