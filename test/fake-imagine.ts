/**
 * A small in-memory fake of the blooms.ai browser API (api.md §5), served as a
 * `fetch`. It reads the request from `init` directly, so it works with any
 * AbortSignal (jsdom's included).
 */

let counter = 0;
const id = () => (++counter).toString(16).padStart(24, '0');

export interface Seen {
	method: string;
	path: string;
	headers: Record<string, string>;
	body?: any;
}

export class FakeImagine {
	readonly seen: Seen[] = [];
	readonly jobs = new Map<string, any>();
	readonly images = new Map<string, any[]>();
	/** Answers to serve before the real ones: a status and code. */
	readonly faults: Array<{status: number; code: string; message: string}> = [];
	/** Holds every POST /jobs until released. */
	holdCreates = false;
	private held: Array<() => void> = [];

	token(): {token: string; expiresAt: string} {
		return {token: `ims_${id()}`, expiresAt: new Date(Date.now() + 900_000).toISOString()};
	}

	addJob(total = 2): any {
		const job = {
			_id: id(), name: 'Prompt · A mug', mode: 'prompt', source: 'browser', status: 'queued', pauseReason: null,
			counts: {total, done: 0, failed: 0, cancelled: 0}, credentialId: null, model: 'gemini-3.1-flash-image',
			pacePerMinute: 5, schedule: {acceptedAt: null, startsAt: null, finishesAt: null}, estimate: null,
			externalRef: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, lastError: null,
		};
		this.jobs.set(job._id, job);
		this.images.set(job._id, []);
		return job;
	}

	addImage(jobId: string): any {
		const job = this.jobs.get(jobId);
		const list = this.images.get(jobId)!;
		const image = {_id: id(), jobId, seq: list.length, url: `https://s3.example/${list.length}.png`, mimeType: 'image/png'};
		list.push(image);
		job.counts.done++;
		job.status = job.counts.done >= job.counts.total ? 'completed' : 'running';
		return image;
	}

	release(): void {
		this.held.splice(0).forEach(go => go());
	}

	readonly fetch = async (url: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
		const path = new URL(String(url)).pathname.replace('/api/v1/imagine/browser', '');
		const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
		const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
		this.seen.push({method: init.method ?? 'GET', path, headers, body});
		const fault = this.faults.shift();
		if (fault) return reply(fault.status, {success: false, code: fault.code, message: fault.message});

		if (init.method === 'POST' && path === '/jobs') {
			if (this.holdCreates) await new Promise<void>(go => this.held.push(go));
			return reply(202, {success: true, data: this.addJob(body.count ?? 1)});
		}
		const match = /^\/jobs\/([^/]+)$/.exec(path);
		const job = match && this.jobs.get(match[1]!);
		if (job) return reply(200, {success: true, data: {...job, images: [...this.images.get(job._id)!]}});
		return reply(404, {success: false, code: 'NOT_FOUND', message: 'Not found'});
	};
}

function reply(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
}
