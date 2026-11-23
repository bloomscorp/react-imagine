import {act, render, renderHook, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, beforeEach, describe, expect, test, vi, type Mock} from 'vitest';

import {ImagineBrowser, ImagineError, ImagineProvider, useCreateJob, useImagine, useJob} from '../src';
import {FakeImagine} from './fake-imagine';

let fake: FakeImagine;
type TokenFn = () => Promise<{token: string; expiresAt: string}>;
let getSessionToken: Mock<TokenFn>;

beforeEach(() => {
	vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']});
	fake = new FakeImagine();
	getSessionToken = vi.fn<TokenFn>(async () => fake.token());
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function wrapper({children}: {children: ReactNode}) {
	return <ImagineProvider getSessionToken={getSessionToken} baseUrl="https://z.test" fetch={fake.fetch}>{children}</ImagineProvider>;
}

/** Move the fake clock and let React apply what happened. */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const polls = () => fake.seen.filter(s => s.method === 'GET').length;

describe('<ImagineProvider> and useImagine()', () => {
	test('gives every component the same client', () => {
		const {result, rerender} = renderHook(() => useImagine(), {wrapper});
		const first = result.current;
		expect(first).toBeInstanceOf(ImagineBrowser);
		rerender();
		expect(result.current).toBe(first);
	});

	test('useImagine() outside a provider says so', () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(() => renderHook(() => useImagine())).toThrow(/inside <ImagineProvider>/);
	});

	test('a provider without getSessionToken or client says so', () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(() => render(<ImagineProvider>x</ImagineProvider>)).toThrow(/needs getSessionToken/);
	});

	test('the latest getSessionToken is used, without making a new client', async () => {
		const second = vi.fn<TokenFn>(async () => fake.token());
		let fn = getSessionToken;
		const Wrapper = ({children}: {children: ReactNode}) =>
			<ImagineProvider getSessionToken={fn} baseUrl="https://z.test" fetch={fake.fetch}>{children}</ImagineProvider>;
		const {result, rerender} = renderHook(() => useImagine(), {wrapper: Wrapper});
		const client = result.current;
		fn = second;
		rerender();
		expect(result.current).toBe(client);
		const job = fake.addJob();
		await act(() => result.current.getJob(job._id));
		expect(getSessionToken).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	test('a client can be passed in', () => {
		const client = new ImagineBrowser({getSessionToken: () => 'ims_x', fetch: fake.fetch});
		const {result} = renderHook(() => useImagine(), {
			wrapper: ({children}) => <ImagineProvider client={client}>{children}</ImagineProvider>,
		});
		expect(result.current).toBe(client);
	});
});

describe('useJob()', () => {
	test('shows each image once as it arrives, then done', async () => {
		const job = fake.addJob(2);
		const {result} = renderHook(() => useJob(job._id), {wrapper});
		expect(result.current).toEqual({job: null, images: [], error: null, done: false});

		await tick();
		expect(result.current.job?.status).toBe('queued');

		fake.addImage(job._id);
		await tick(2_000);
		expect(result.current.images.map(i => i.seq)).toEqual([0]);
		expect(result.current.done).toBe(false);

		await tick(2_000);   // same answer again: nothing added twice
		expect(result.current.images).toHaveLength(1);

		fake.addImage(job._id);
		await tick(10_000);
		expect(result.current.images.map(i => i.seq)).toEqual([0, 1]);
		expect(result.current.job?.status).toBe('completed');
		expect(result.current.done).toBe(true);
		expect(result.current.error).toBeNull();
	});

	test('stops polling when the component unmounts', async () => {
		const job = fake.addJob();
		const {unmount} = renderHook(() => useJob(job._id), {wrapper});
		await tick(2_000);
		const before = polls();
		expect(before).toBeGreaterThan(0);
		unmount();
		await tick(60_000);
		expect(polls()).toBe(before);
	});

	test('null watches nothing', async () => {
		const {result} = renderHook(() => useJob(null), {wrapper});
		await tick(10_000);
		expect(result.current).toEqual({job: null, images: [], error: null, done: false});
		expect(fake.seen).toHaveLength(0);
	});

	test('a new jobId starts over and stops watching the old one', async () => {
		const a = fake.addJob();
		const b = fake.addJob();
		fake.addImage(a._id);
		const {result, rerender} = renderHook(({id}) => useJob(id), {wrapper, initialProps: {id: a._id}});
		await tick();
		expect(result.current.images).toHaveLength(1);

		rerender({id: b._id});
		expect(result.current.images).toEqual([]);   // never the old job's images
		await tick();
		expect(result.current.job?._id).toBe(b._id);
		await tick(30_000);
		expect(fake.seen.filter(s => s.path === `/jobs/${a._id}`)).toHaveLength(1);
	});

	test('an error is shown, and watching stops', async () => {
		const {result} = renderHook(() => useJob('missing'), {wrapper});
		await tick(30_000);
		expect(result.current.error).toBeInstanceOf(ImagineError);
		expect(result.current.error?.code).toBe('NOT_FOUND');
		expect(result.current.done).toBe(false);
		expect(polls()).toBe(1);
	});

	test('works inside a rendered component', async () => {
		const job = fake.addJob(1);
		fake.addImage(job._id);
		function Gallery() {
			const {images, done} = useJob(job._id);
			return <div>{images.map(i => <img key={i._id} alt={`image ${i.seq}`} src={i.url ?? ''} />)}{done && <p>Done</p>}</div>;
		}
		render(<Gallery />, {wrapper});
		await tick();
		expect(screen.getByAltText('image 0')).toBeTruthy();
		expect(screen.getByText('Done')).toBeTruthy();
	});
});

describe('useCreateJob()', () => {
	test('pending while it runs, then the job; the request carries an Idempotency-Key', async () => {
		fake.holdCreates = true;
		const {result} = renderHook(() => useCreateJob(), {wrapper});
		expect(result.current).toMatchObject({job: null, pending: false, error: null});

		let created: Promise<unknown>;
		act(() => { created = result.current.create({mode: 'prompt', prompt: 'A mug', count: 2}); });
		expect(result.current.pending).toBe(true);
		await tick();
		fake.release();
		await act(async () => { await created; });
		expect(result.current.pending).toBe(false);
		expect(result.current.job?.counts.total).toBe(2);
		const post = fake.seen.find(s => s.method === 'POST')!;
		expect(post.body).toEqual({mode: 'prompt', prompt: 'A mug', count: 2});
		expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
	});

	test('a failure resolves to null and lands in error', async () => {
		fake.faults.push({status: 409, code: 'SESSION_LIMIT', message: 'This session has used its images'});
		const {result} = renderHook(() => useCreateJob(), {wrapper});
		let job: unknown = 'unset';
		await act(async () => { job = await result.current.create({mode: 'prompt', prompt: 'A mug'}); });
		expect(job).toBeNull();
		expect(result.current.error).toMatchObject({code: 'SESSION_LIMIT', status: 409});
		expect(result.current.pending).toBe(false);

		act(() => result.current.reset());
		expect(result.current.error).toBeNull();
	});

	test('only the latest call sets the state', async () => {
		fake.holdCreates = true;
		const {result} = renderHook(() => useCreateJob(), {wrapper});
		let first: Promise<unknown>, second: Promise<unknown>;
		act(() => { first = result.current.create({mode: 'prompt', prompt: 'one', count: 1}); });
		act(() => { second = result.current.create({mode: 'prompt', prompt: 'two', count: 3}); });
		await tick();
		fake.release();
		await act(async () => { await Promise.all([first, second]); });
		expect(result.current.job?.counts.total).toBe(3);
		expect(result.current.pending).toBe(false);
	});

	test('create is stable across renders', () => {
		const {result, rerender} = renderHook(() => useCreateJob(), {wrapper});
		const create = result.current.create;
		rerender();
		expect(result.current.create).toBe(create);
	});

	test('the created job can be watched with useJob', async () => {
		const {result} = renderHook(() => {
			const c = useCreateJob();
			return {c, w: useJob(c.job?._id)};
		}, {wrapper});
		await act(async () => { await result.current.c.create({mode: 'prompt', prompt: 'A mug'}); });
		const id = result.current.c.job!._id;
		await tick();
		expect(result.current.w.job?._id).toBe(id);
		fake.addImage(id);
		await tick(2_000);
		expect(result.current.w.images).toHaveLength(1);
		expect(result.current.w.done).toBe(true);
	});
});
