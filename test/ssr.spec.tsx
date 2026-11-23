// @vitest-environment node
import {renderToString} from 'react-dom/server';
import {expect, test, vi} from 'vitest';

import {ImagineProvider, useCreateJob, useJob} from '../src';

test('server rendering: renders the idle state, calls nothing', () => {
	const fetch = vi.fn();
	const getSessionToken = vi.fn(() => 'ims_x');
	function Page() {
		const {images, done} = useJob('65736f6d656a6f6269640000');
		const {pending} = useCreateJob();
		return <p>{`${images.length} images, done ${done}, pending ${pending}`}</p>;
	}
	const html = renderToString(<ImagineProvider getSessionToken={getSessionToken} fetch={fetch}><Page /></ImagineProvider>);
	expect(html).toContain('0 images, done false, pending false');
	expect(fetch).not.toHaveBeenCalled();
	expect(getSessionToken).not.toHaveBeenCalled();
});
