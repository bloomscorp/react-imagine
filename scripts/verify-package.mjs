// The packaging gate: what `npm publish` would ship is exactly the intended files,
// loads in both module systems, keeps the "use client" banner, and imports nothing
// it does not declare. Requires `npm run build` first.
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const fail = (msg) => { console.error(`verify-package: ${msg}`); process.exit(1); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const CORE = '@bloomscorp/imagine.js';

// Files
const packed = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts', {encoding: 'utf8'}))[0];
const files = packed.files.map(f => f.path).sort();
const allowed = ['LICENSE.md', 'README.md', 'dist/index.d.mts', 'dist/index.d.ts', 'dist/index.js', 'dist/index.mjs', 'package.json'];
const extra = files.filter(f => !allowed.includes(f));
const missing = allowed.filter(f => !files.includes(f));
if (extra.length) fail(`unexpected files in the package: ${extra.join(', ')}`);
if (missing.length) fail(`missing from the package: ${missing.join(', ')}`);

// Manifest
if (Object.keys(pkg.dependencies ?? {}).length) fail('react-imagine must have no runtime dependencies; React and the core are peers');
if (!pkg.peerDependencies?.react || !pkg.peerDependencies?.[CORE]) fail(`react and ${CORE} must be peers`);
if (String(pkg.peerDependencies[CORE]).startsWith('file:')) fail(`the ${CORE} peer must be a version range`);
if (pkg.sideEffects !== false) fail('package.json should declare "sideEffects": false');
if (!/github\.com\/bloomscorp\/react-imagine/.test(pkg.repository?.url ?? '')) fail('repository.url must name bloomscorp/react-imagine (npm provenance checks it)');

// "use client" must be the bundle's first statement, or Next.js treats the hooks as server code.
for (const file of ['dist/index.js', 'dist/index.mjs']) {
	if (!read(file).startsWith('"use client";')) fail(`${file} does not start with "use client"`);
}

// Only peers are imported.
const declared = new Set(Object.keys(pkg.peerDependencies));
for (const file of ['dist/index.js', 'dist/index.mjs']) {
	const code = read(file);
	const specs = [...code.matchAll(/(?:from\s*|require\()\s*["']([^"'.][^"']*)["']/g)].map(m => m[1]);
	for (const spec of specs) {
		const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
		if (!declared.has(name)) fail(`${file} imports ${spec}, which is not a peer`);
	}
}
// Types reach the core by its package root only.
const types = read('dist/index.d.ts');
for (const m of types.matchAll(/from\s*["']([^"']+)["']/g)) {
	if (m[1].startsWith(`${CORE}/`)) fail(`types deep-import the core: ${m[1]}`);
}

// CommonJS and ESM
const expected = ['ImagineBrowser', 'ImagineError', 'ImagineProvider', 'isImagineError', 'useCreateJob', 'useImagine', 'useJob'];
const require = createRequire(import.meta.url);
const cjs = require('../dist/index.js');
const esm = await import('../dist/index.mjs');
for (const [name, mod] of [['cjs', cjs], ['esm', esm]]) {
	const exported = Object.keys(mod).filter(k => k !== 'default').sort();
	if (JSON.stringify(exported) !== JSON.stringify(expected)) fail(`${name} exports ${exported.join(', ')}; expected ${expected.join(', ')}`);
}
if (cjs.ImagineBrowser !== require(CORE).ImagineBrowser) fail('the re-exported ImagineBrowser is not the core\'s');

console.log(`verify-package: ok (${files.length} files, cjs + esm load, "use client" kept, only peers imported, version ${pkg.version})`);
