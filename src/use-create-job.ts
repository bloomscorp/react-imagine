import {useCallback, useEffect, useRef, useState} from 'react';
import {isImagineError, ImagineError} from '@bloomscorp/imagine.js';
import type {CreatedJob, CreateJobOptions, CreateJobRequest} from '@bloomscorp/imagine.js';
import {useImagine} from './provider';

export interface CreateJobState {
	/**
	 * Ask for images. Resolves to the job, or to `null` when it failed; the failure is
	 * in `error`, so a click handler never has to catch.
	 */
	create: (request: CreateJobRequest, options?: CreateJobOptions) => Promise<CreatedJob | null>;
	/** The job of the latest successful `create`. */
	job: CreatedJob | null;
	/** True while a `create` is on its way. */
	pending: boolean;
	/** The failure of the latest `create`, if it failed. */
	error: ImagineError | null;
	/** Clear `job` and `error`. */
	reset: () => void;
}

export function useCreateJob(): CreateJobState {
	const imagine = useImagine();
	const [state, setState] = useState<{job: CreatedJob | null; pending: boolean; error: ImagineError | null}>(
		{job: null, pending: false, error: null});
	// Only the latest call may set the state, and nothing after unmount.
	const latest = useRef(0);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const create = useCallback(async (request: CreateJobRequest, options?: CreateJobOptions) => {
		const call = ++latest.current;
		setState(s => ({...s, pending: true, error: null}));
		try {
			const job = await imagine.createJob(request, options);
			if (mounted.current && call === latest.current) setState({job, pending: false, error: null});
			return job;
		} catch (cause) {
			const error = isImagineError(cause)
				? cause
				: new ImagineError('UNEXPECTED', (cause as Error)?.message || String(cause), {cause});
			if (mounted.current && call === latest.current) setState(s => ({...s, pending: false, error}));
			return null;
		}
	}, [imagine]);

	const reset = useCallback(() => {
		latest.current++;
		setState({job: null, pending: false, error: null});
	}, []);

	return {create, job: state.job, pending: state.pending, error: state.error, reset};
}
