import {EventEmitter} from 'events';
import getStream = require('get-stream');
import PCancelable = require('p-cancelable');
import calculateRetryDelay from './calculate-retry-delay';
import {
	NormalizedOptions,
	CancelableRequest,
	Response,
	RequestError,
	HTTPError,
	ReadError
} from './types';
import PromisableRequest, {parseBody} from './core';
import proxyEvents from '../core/utils/proxy-events';

const proxiedRequestEvents = [
	'request',
	'response',
	'redirect',
	'uploadProgress',
	'downloadProgress'
];

export default function asPromise<T>(options: NormalizedOptions): CancelableRequest<T> {
	let retryCount = 0;
	let globalRequest: PromisableRequest;
	let globalResponse: Response;
	const emitter = new EventEmitter();

	const promise = new PCancelable<T>((resolve, reject, onCancel) => {
		const makeRequest = (): void => {
			// Support retries
			// `options.throwHttpErrors` needs to be always true,
			// so the HTTP errors are caught and the request is retried.
			// The error is **eventually** thrown if the user value is true.
			const {throwHttpErrors} = options;
			if (!throwHttpErrors) {
				options.throwHttpErrors = true;
			}

			const request = new PromisableRequest(options.url, options);
			request._noPipe = true;
			onCancel(() => request.destroy());

			globalRequest = request;

			request.once('response', async (response: Response) => {
				response.retryCount = retryCount;

				if (response.request.aborted) {
					// Canceled while downloading - will throw a `CancelError` or `TimeoutError` error
					return;
				}

				const isOk = (): boolean => {
					const {statusCode} = response;
					const limitStatusCode = options.followRedirect ? 299 : 399;

					return (statusCode >= 200 && statusCode <= limitStatusCode) || statusCode === 304;
				};

				// Download body
				let rawBody;
				try {
					rawBody = await getStream.buffer(request);

					response.rawBody = rawBody;
				} catch (error) {
					request._beforeError(new ReadError(error, options, response));
					return;
				}

				// Parse body
				try {
					response.body = parseBody(response, options.responseType, options.encoding);
				} catch (error) {
					// Fallback to `utf8`
					response.body = rawBody.toString();

					if (isOk()) {
						request._beforeError(error);
						return;
					}
				}

				try {
					for (const [index, hook] of options.hooks.afterResponse.entries()) {
						// @ts-ignore TS doesn't notice that CancelableRequest is a Promise
						// eslint-disable-next-line no-await-in-loop
						response = await hook(response, async (updatedOptions): CancelableRequest<Response> => {
							request.destroy();

							const typedOptions = PromisableRequest.normalizeArguments(undefined, {
								...updatedOptions,
								retry: {
									calculateDelay: () => 0
								},
								throwHttpErrors: false,
								resolveBodyOnly: false
							}, options);

							// Remove any further hooks for that request, because we'll call them anyway.
							// The loop continues. We don't want duplicates (asPromise recursion).
							typedOptions.hooks.afterResponse = typedOptions.hooks.afterResponse.slice(0, index);

							for (const hook of typedOptions.hooks.beforeRetry) {
								// eslint-disable-next-line no-await-in-loop
								await hook(typedOptions);
							}

							const promise: CancelableRequest<Response> = asPromise(typedOptions);

							onCancel(() => {
								promise.catch(() => {});
								promise.cancel();
							});

							return promise;
						});
					}
				} catch (error) {
					request._beforeError(error);
					return;
				}

				if (throwHttpErrors && !isOk()) {
					reject(new HTTPError(response, options));
					return;
				}

				globalResponse = response;

				resolve(options.resolveBodyOnly ? response.body as T : response as unknown as T);
			});

			request.once('error', (error: RequestError) => {
				if (promise.isCanceled) {
					return;
				}

				if (!request.options) {
					reject(error);
					return;
				}

				let backoff: number;

				retryCount++;

				try {
					backoff = options.retry.calculateDelay({
						attemptCount: retryCount,
						retryOptions: options.retry,
						error,
						computedValue: calculateRetryDelay({
							attemptCount: retryCount,
							retryOptions: options.retry,
							error,
							computedValue: 0
						})
					});
				} catch (error_) {
					// Don't emit the `response` event
					request.destroy();

					reject(new RequestError(error_.message, error, request.options));
					return;
				}

				if (backoff) {
					// Don't emit the `response` event
					request.destroy();

					const retry = async (): Promise<void> => {
						options.throwHttpErrors = throwHttpErrors;

						try {
							for (const hook of options.hooks.beforeRetry) {
								// eslint-disable-next-line no-await-in-loop
								await hook(options, error, retryCount);
							}
						} catch (error_) {
							// Don't emit the `response` event
							request.destroy();

							reject(new RequestError(error_.message, error, request.options));
							return;
						}

						makeRequest();
					};

					setTimeout(retry, backoff);
					return;
				}

				// The retry has not been made
				retryCount--;

				if (error instanceof HTTPError) {
					// It will be handled by the `response` event
					return;
				}

				// Don't emit the `response` event
				request.destroy();

				reject(error);
			});

			proxyEvents(request, emitter, proxiedRequestEvents);
		};

		makeRequest();
	}) as CancelableRequest<T>;

	promise.on = (event: string, fn: (...args: any[]) => void) => {
		emitter.on(event, fn);
		return promise;
	};

	const shortcut = <T>(responseType: NormalizedOptions['responseType']): CancelableRequest<T> => {
		const newPromise = (async () => {
			// Wait until downloading has ended
			await promise;

			return parseBody(globalResponse, responseType, options.encoding);
		})();

		Object.defineProperties(newPromise, Object.getOwnPropertyDescriptors(promise));

		return newPromise as CancelableRequest<T>;
	};

	promise.json = () => {
		if (!globalRequest.writableFinished && options.headers.accept === undefined) {
			options.headers.accept = 'application/json';
		}

		return shortcut('json');
	};

	promise.buffer = () => shortcut('buffer');
	promise.text = () => shortcut('text');

	return promise;
}

export * from './types';
export {PromisableRequest};
