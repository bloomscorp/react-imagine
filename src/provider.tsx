import {createContext, useContext, useEffect, useMemo, useRef, type ReactNode} from 'react';
import {ImagineBrowser, type ImagineBrowserOptions} from '@bloomscorp/imagine.js';

export interface ImagineProviderProps extends Partial<ImagineBrowserOptions> {
	/** Use this client instead of making one from the other props. */
	client?: ImagineBrowser;
	children?: ReactNode;
}

const ImagineContext = createContext<ImagineBrowser | null>(null);

/**
 * Makes one Imagine client for everything below it.
 *
 * `getSessionToken` may change between renders (an inline arrow is fine): the client
 * always calls the latest one, and is made again only when `baseUrl` or another
 * option changes. Nothing touches the browser during render, so it is safe in
 * server rendering.
 */
export function ImagineProvider(props: ImagineProviderProps): ReactNode {
	const {client, getSessionToken, baseUrl, timeoutMs, uploadTimeoutMs, maxRetries, maxRetryWaitMs, fetch, children} = props;
	if (!client && typeof getSessionToken !== 'function') {
		throw new Error('<ImagineProvider> needs getSessionToken: a function that asks your backend for an Imagine session token.');
	}
	const latest = useRef(getSessionToken);
	useEffect(() => {
		latest.current = getSessionToken;
	}, [getSessionToken]);

	const value = useMemo(() => client ?? new ImagineBrowser({
		getSessionToken: () => latest.current!(),
		baseUrl, timeoutMs, uploadTimeoutMs, maxRetries, maxRetryWaitMs, fetch,
	}), [client, baseUrl, timeoutMs, uploadTimeoutMs, maxRetries, maxRetryWaitMs, fetch]);

	return <ImagineContext.Provider value={value}>{children}</ImagineContext.Provider>;
}

/** The Imagine client of the nearest `<ImagineProvider>`. */
export function useImagine(): ImagineBrowser {
	const client = useContext(ImagineContext);
	if (!client) throw new Error('useImagine() must be used inside <ImagineProvider>.');
	return client;
}
