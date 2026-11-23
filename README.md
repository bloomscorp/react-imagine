# @bloomscorp/react-imagine

React hooks for [Imagine](https://bloomscorp.com), the AI image generator of
blooms.ai. Built on [`@bloomscorp/imagine.js`](https://github.com/bloomscorp/imagine.js).

- `<ImagineProvider>` makes one client for your app.
- `useJob(jobId)` watches a job and gives you its images as they arrive.
- `useCreateJob()` asks for images, with `pending` and `error` for the button.
- React 18 and 19. ESM and CommonJS. Marked `"use client"` for the Next.js App Router.
- **No API key in the browser.** The page uses a short-lived session token that your
  backend mints.

## Install

```bash
npm install @bloomscorp/react-imagine @bloomscorp/imagine.js
```

## Quick start

### 1. Your backend mints a session token

With the Node library and an API key that has the **`imagine`** scope (Project
Settings → API keys). The key stays on your server.

```ts
import express from 'express';
import {Imagine} from '@bloomscorp/imagine-node';

const imagine = new Imagine({apiKey: process.env.BLOOMS_API_KEY!});
const app = express();

app.post('/imagine-session', requireLogin, async (req, res) => {
	const session = await imagine.sessions.create({
		ttlSeconds: 900,
		maxImages: 10,
		modes: ['prompt', 'product', 'edit'],
		origins: ['https://shop.example.com'],
		externalUser: req.user.id,
	});
	res.json({token: session.token, expiresAt: session.expiresAt});
});
```

### 2. Wrap your app

```tsx
import {ImagineProvider} from '@bloomscorp/react-imagine';

const getSessionToken = () => fetch('/imagine-session', {method: 'POST'}).then(r => r.json());

export function App() {
	return (
		<ImagineProvider getSessionToken={getSessionToken}>
			<MugMaker />
		</ImagineProvider>
	);
}
```

### 3. Ask for images and show them

```tsx
import {useCreateJob, useJob} from '@bloomscorp/react-imagine';

function MugMaker() {
	const {create, job: created, pending, error} = useCreateJob();
	const {images, job, done} = useJob(created?._id);

	return (
		<>
			<button disabled={pending} onClick={() => create({mode: 'prompt', prompt: 'A mug on a desk', count: 4})}>
				Make 4 images
			</button>
			{error && <p>{error.message}</p>}
			{job && !done && <p>{job.counts.done} of {job.counts.total}</p>}
			{images.map(image => <img key={image._id} src={image.url ?? image.thumbUrl ?? ''} alt={image.prompt} />)}
		</>
	);
}
```

## API

### `<ImagineProvider>`

| Prop | |
|---|---|
| `getSessionToken` | Required (unless `client` is given). `() => string \| { token, expiresAt? }`, or a Promise of either. It may change between renders; the latest is always used |
| `baseUrl` | Default `https://z.bloomscorp.com` |
| `timeoutMs`, `uploadTimeoutMs`, `maxRetries`, `maxRetryWaitMs`, `fetch` | Passed to the client |
| `client` | An `ImagineBrowser` you made yourself, used instead |

### `useImagine()`

The client (`ImagineBrowser` from `@bloomscorp/imagine.js`): `session()`,
`uploadReferences(files)`, `createJob(recipe)`, `getJob(id)`, `cancelJob(id)`,
`watchJob(id, callbacks)`. See its README.

```tsx
const imagine = useImagine();
const refs = await imagine.uploadReferences(input.files);
```

### `useJob(jobId, { intervalMs?, maxIntervalMs? })`

Returns `{ job, images, error, done }`.

- `job`: the job as last seen, or `null` before the first answer
- `images`: every image so far, in `seq` order, each once
- `error`: an `ImagineError` that stopped watching, or `null`
- `done`: `true` once the job is completed, failed or cancelled

Pass `null` or `undefined` to watch nothing. A new `jobId` starts over. Unmounting
stops polling. Polls start every 2 s and slow to every 10 s while nothing changes.

### `useCreateJob()`

Returns `{ create, job, pending, error, reset }`.

- `create(recipe, { idempotencyKey? })` resolves to the job, or to `null` when it
  failed. The failure is in `error`, so a click handler never has to catch
- `job`: the job of the latest successful `create`
- `pending`: `true` while a `create` is on its way
- `reset()`: clears `job` and `error`

Only the latest call updates the state. Every create carries an idempotency key, so a
retry after a network error never makes a second job.

### Types and errors

Everything from the core is re-exported: `ImagineBrowser`, `ImagineError`,
`isImagineError`, and the types (`Job`, `Image`, `Session`, `Presets`,
`CreateJobRequest`, `PromptRecipe`, `ProductRecipe`, `EditRecipe`, `BatchRecipe`, …).
Import them from here.

`error.code` is stable; branch on it. Common ones: `SESSION_LIMIT` (the session has
used its images), `SESSION_SCOPE` (mode not allowed), `ORIGIN_NOT_ALLOWED`,
`TOO_MANY_JOBS`, `PROMPT_REQUIRED`, `RATE_LIMITED`, `SESSION_TOKEN_FAILED` (your
`getSessionToken` failed), `NETWORK_FAILURE`. The full list is in the core's README.

## Server rendering

The provider and hooks render on the server without calling anything: `useJob` and
`useCreateJob` start idle, and polling starts in the browser.

## Security

- **Never put an API key in a web page.** API keys stay on your server; pages get
  session tokens.
- Mint tokens only for signed-in users, with small `maxImages` and `ttlSeconds`, and
  always set `origins`.

## License

MIT
