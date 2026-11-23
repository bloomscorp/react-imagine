import {useEffect, useState} from 'react';
import type {Image, ImagineError, Job} from '@bloomscorp/imagine.js';
import {useImagine} from './provider';

export interface UseJobOptions {
	/** The first wait between polls. Default 2 000 ms. */
	intervalMs?: number;
	/** The longest wait between polls. Default 10 000 ms. */
	maxIntervalMs?: number;
}

export interface JobState {
	/** The job as last seen, or null before the first answer. */
	job: Job | null;
	/** Every image so far, in `seq` order, each once. */
	images: Image[];
	/** The error that stopped watching, if any. */
	error: ImagineError | null;
	/** True once the job is completed, failed or cancelled. */
	done: boolean;
}

const NO_IMAGES: Image[] = [];
const IDLE: JobState = {job: null, images: NO_IMAGES, error: null, done: false};

/**
 * Watch a job until it ends. Pass `null` to watch nothing. Changing `jobId` starts
 * over; unmounting stops polling.
 */
export function useJob(jobId: string | null | undefined, options: UseJobOptions = {}): JobState {
	const imagine = useImagine();
	const {intervalMs, maxIntervalMs} = options;
	const [state, setState] = useState<JobState & {id: string | null}>({...IDLE, id: null});

	useEffect(() => {
		const id = jobId || null;
		setState({...IDLE, id});
		if (!id) return undefined;
		const mine = (update: (s: JobState) => Partial<JobState>) =>
			setState(s => (s.id === id ? {...s, ...update(s)} : s));
		return imagine.watchJob(id, {
			intervalMs,
			maxIntervalMs,
			onProgress: job => mine(() => ({job})),
			onImage: image => mine(s => ({images: [...s.images, image]})),
			onDone: job => mine(() => ({job, done: true})),
			onError: error => mine(() => ({error})),
		});
	}, [imagine, jobId, intervalMs, maxIntervalMs]);

	// Until the effect runs for a new id, show nothing rather than the old job.
	if (state.id !== (jobId || null)) return IDLE;
	return {job: state.job, images: state.images, error: state.error, done: state.done};
}
