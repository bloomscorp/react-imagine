import {defineConfig} from 'tsup';

export default defineConfig({
	entry: ['./src/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	clean: true,
	sourcemap: false,
	target: 'es2020',
	platform: 'browser',
	// React and the core are peers: imported, never bundled.
	external: ['react', 'react/jsx-runtime', '@bloomscorp/imagine.js'],
	// For the Next.js App Router: these hooks run on the client.
	banner: {js: '"use client";'},
});
