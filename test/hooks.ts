import {URL} from 'url';
import test from 'ava';
import getStream from 'get-stream';
import delay = require('delay');
import {Handler} from 'express';
import Responselike = require('responselike');
import got, {RequestError} from '../source';
import withServer from './helpers/with-server';

const errorString = 'oops';
const error = new Error(errorString);

const echoHeaders: Handler = (request, response) => {
	response.end(JSON.stringify(request.headers));
};

const echoUrl: Handler = (request, response) => {
	response.end(request.url);
};

const retryEndpoint: Handler = (request, response) => {
	if (request.headers.foo) {
		response.statusCode = 302;
		response.setHeader('location', '/');
		response.end();
	}

	response.statusCode = 500;
	response.end();
};

const redirectEndpoint: Handler = (_request, response) => {
	response.statusCode = 302;
	response.setHeader('location', '/');
	response.end();
};

test('async hooks', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const {body} = await got({
		responseType: 'json',
		hooks: {
			beforeRequest: [
				async options => {
					await delay(100);
					options.headers.foo = 'bar';
				}
			]
		}
	});
	t.is(body.foo, 'bar');
});

test('catches init thrown errors', async t => {
	await t.throwsAsync(got('https://example.com', {
		hooks: {
			init: [() => {
				throw error;
			}]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('passes init thrown errors to beforeError hooks (promise-only)', async t => {
	t.plan(2);

	await t.throwsAsync(got('https://example.com', {
		hooks: {
			init: [() => {
				throw error;
			}],
			beforeError: [error => {
				t.is(error.message, errorString);

				return error;
			}]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('passes init thrown errors to beforeError hooks (promise-only) - beforeError rejection', async t => {
	const message = 'foo, bar!';

	await t.throwsAsync(got('https://example.com', {
		hooks: {
			init: [() => {
				throw error;
			}],
			beforeError: [() => {
				throw new Error(message);
			}]
		}
	}), {message});
});

test('catches beforeRequest thrown errors', async t => {
	await t.throwsAsync(got('https://example.com', {
		hooks: {
			beforeRequest: [() => {
				throw error;
			}]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('catches beforeRedirect thrown errors', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);
	server.get('/redirect', redirectEndpoint);

	await t.throwsAsync(got('redirect', {
		hooks: {
			beforeRedirect: [() => {
				throw error;
			}]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('catches beforeRetry thrown errors', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);
	server.get('/retry', retryEndpoint);

	await t.throwsAsync(got('retry', {
		hooks: {
			beforeRetry: [() => {
				throw error;
			}]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('catches afterResponse thrown errors', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	await t.throwsAsync(got({
		hooks: {
			afterResponse: [() => {
				throw error;
			}]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('accepts an async function as init hook', async t => {
	await got('https://example.com', {
		hooks: {
			init: [
				async () => {
					t.pass();
				}
			]
		}
	});
});

test('catches beforeRequest promise rejections', async t => {
	await t.throwsAsync(got('https://example.com', {
		hooks: {
			beforeRequest: [
				async () => {
					throw error;
				}
			]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('catches beforeRedirect promise rejections', withServer, async (t, server, got) => {
	server.get('/', redirectEndpoint);

	await t.throwsAsync(got({
		hooks: {
			beforeRedirect: [
				async () => {
					throw error;
				}
			]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('catches beforeRetry promise rejections', withServer, async (t, server, got) => {
	server.get('/retry', retryEndpoint);

	await t.throwsAsync(got('retry', {
		hooks: {
			beforeRetry: [
				async () => {
					throw error;
				}
			]
		}
	}), {
		instanceOf: RequestError,
		message: errorString
	});
});

test('catches afterResponse promise rejections', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	await t.throwsAsync(got({
		hooks: {
			afterResponse: [
				async () => {
					throw error;
				}
			]
		}
	}), {message: errorString});
});

test('catches beforeError errors', async t => {
	// @ts-ignore Error tests
	await t.throwsAsync(got('https://example.com', {
		// @ts-ignore Error tests
		request: () => {
			throw new Error('No way');
		},
		hooks: {
			beforeError: [
				async () => {
					throw error;
				}
			]
		}
	}), {message: errorString});
});

test('init is called with options', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const context = {};

	await got({
		hooks: {
			init: [
				options => {
					t.is(options.context, context);
				}
			]
		},
		context
	});
});

test('init from defaults is called with options', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const context = {};

	const instance = got.extend({
		hooks: {
			init: [
				options => {
					t.is(options.context, context);
				}
			]
		}
	});

	await instance({context});
});

test('init allows modifications', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		response.end(request.headers.foo);
	});

	const {body} = await got('', {
		headers: {},
		hooks: {
			init: [
				options => {
					options.headers!.foo = 'bar';
				}
			]
		}
	});
	t.is(body, 'bar');
});

test('beforeRequest is called with options', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	await got({
		responseType: 'json',
		hooks: {
			beforeRequest: [
				options => {
					t.is(options.url.pathname, '/');
					t.is(options.url.hostname, 'localhost');
				}
			]
		}
	});
});

test('beforeRequest allows modifications', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const {body} = await got({
		responseType: 'json',
		hooks: {
			beforeRequest: [
				options => {
					options.headers.foo = 'bar';
				}
			]
		}
	});
	t.is(body.foo, 'bar');
});

test('returning HTTP response from a beforeRequest hook', withServer, async (t, server, got) => {
	server.get('/', echoUrl);

	const {statusCode, headers, body} = await got({
		hooks: {
			beforeRequest: [
				() => {
					return new Responselike(
						200,
						{foo: 'bar'},
						Buffer.from('Hi!'),
						''
					);
				}
			]
		}
	});

	t.is(statusCode, 200);
	t.is(headers.foo, 'bar');
	t.is(body, 'Hi!');
});

test('beforeRedirect is called with options and response', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);
	server.get('/redirect', redirectEndpoint);

	await got('redirect', {
		responseType: 'json',
		hooks: {
			beforeRedirect: [
				(options, response) => {
					t.is(options.url.pathname, '/');
					t.is(options.url.hostname, 'localhost');

					t.is(response.statusCode, 302);
					t.is(new URL(response.url).pathname, '/redirect');
					t.is(response.redirectUrls.length, 1);
				}
			]
		}
	});
});

test('beforeRedirect allows modifications', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);
	server.get('/redirect', redirectEndpoint);

	const {body} = await got('redirect', {
		responseType: 'json',
		hooks: {
			beforeRedirect: [
				options => {
					options.headers.foo = 'bar';
				}
			]
		}
	});
	t.is(body.foo, 'bar');
});

test('beforeRetry is called with options', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);
	server.get('/retry', retryEndpoint);

	const context = {};

	await got('retry', {
		responseType: 'json',
		retry: 1,
		throwHttpErrors: false,
		context,
		hooks: {
			beforeRetry: [
				(options, error, retryCount) => {
					t.is(options.url.hostname, 'localhost');
					t.is(options.context, context);
					t.truthy(error);
					t.true(retryCount! >= 1);
				}
			]
		}
	});
});

test('beforeRetry allows modifications', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);
	server.get('/retry', retryEndpoint);

	const {body} = await got('retry', {
		responseType: 'json',
		hooks: {
			beforeRetry: [
				options => {
					options.headers.foo = 'bar';
				}
			]
		}
	});
	t.is(body.foo, 'bar');
});

test('afterResponse is called with response', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	await got({
		responseType: 'json',
		hooks: {
			afterResponse: [
				response => {
					t.is(typeof response.body, 'object');

					return response;
				}
			]
		}
	});
});

test('afterResponse allows modifications', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const {body} = await got({
		responseType: 'json',
		hooks: {
			afterResponse: [
				response => {
					response.body = {hello: 'world'};

					return response;
				}
			]
		}
	});
	t.is(body.hello, 'world');
});

test('afterResponse allows to retry', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		if (request.headers.token !== 'unicorn') {
			response.statusCode = 401;
		}

		response.end();
	});

	const {statusCode} = await got({
		hooks: {
			afterResponse: [
				(response, retryWithMergedOptions) => {
					if (response.statusCode === 401) {
						return retryWithMergedOptions({
							headers: {
								token: 'unicorn'
							}
						});
					}

					return response;
				}
			]
		}
	});
	t.is(statusCode, 200);
});

test('cancelling the request after retrying in a afterResponse hook', withServer, async (t, server, got) => {
	let requests = 0;
	server.get('/', (_request, response) => {
		requests++;
		response.end();
	});

	const gotPromise = got({
		hooks: {
			afterResponse: [
				(_response, retryWithMergedOptions) => {
					const promise = retryWithMergedOptions({
						headers: {
							token: 'unicorn'
						}
					});

					gotPromise.cancel();

					return promise;
				}
			]
		},
		retry: {
			calculateDelay: () => 1
		}
	});

	await t.throwsAsync(gotPromise);
	await delay(100);
	t.is(requests, 1);
});

test('afterResponse allows to retry - `beforeRetry` hook', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		if (request.headers.token !== 'unicorn') {
			response.statusCode = 401;
		}

		response.end();
	});

	let isCalled = false;

	const {statusCode} = await got({
		hooks: {
			afterResponse: [
				(response, retryWithMergedOptions) => {
					if (response.statusCode === 401) {
						return retryWithMergedOptions({
							headers: {
								token: 'unicorn'
							}
						});
					}

					return response;
				}
			],
			beforeRetry: [
				options => {
					t.truthy(options);
					isCalled = true;
				}
			]
		}
	});
	t.is(statusCode, 200);
	t.true(isCalled);
});

test('no infinity loop when retrying on afterResponse', withServer, async (t, server, got) => {
	server.get('/', (request, response) => {
		if (request.headers.token !== 'unicorn') {
			response.statusCode = 401;
		}

		response.end();
	});

	await t.throwsAsync(got({
		retry: 0,
		hooks: {
			afterResponse: [
				(_response, retryWithMergedOptions) => {
					return retryWithMergedOptions({
						headers: {
							token: 'invalid'
						}
					});
				}
			]
		}
	}), {instanceOf: got.HTTPError, message: 'Response code 401 (Unauthorized)'});
});

test('throws on afterResponse retry failure', withServer, async (t, server, got) => {
	let didVisit401then500: boolean;
	server.get('/', (_request, response) => {
		if (didVisit401then500) {
			response.statusCode = 500;
		} else {
			didVisit401then500 = true;
			response.statusCode = 401;
		}

		response.end();
	});

	await t.throwsAsync(got({
		retry: 1,
		hooks: {
			afterResponse: [
				(response, retryWithMergedOptions) => {
					if (response.statusCode === 401) {
						return retryWithMergedOptions({
							headers: {
								token: 'unicorn'
							}
						});
					}

					return response;
				}
			]
		}
	}), {instanceOf: got.HTTPError, message: 'Response code 500 (Internal Server Error)'});
});

test('doesn\'t throw on afterResponse retry HTTP failure if throwHttpErrors is false', withServer, async (t, server, got) => {
	let didVisit401then500: boolean;
	server.get('/', (_request, response) => {
		if (didVisit401then500) {
			response.statusCode = 500;
		} else {
			didVisit401then500 = true;
			response.statusCode = 401;
		}

		response.end();
	});

	const {statusCode} = await got({
		throwHttpErrors: false,
		retry: 1,
		hooks: {
			afterResponse: [
				(response, retryWithMergedOptions) => {
					if (response.statusCode === 401) {
						return retryWithMergedOptions({
							headers: {
								token: 'unicorn'
							}
						});
					}

					return response;
				}
			]
		}
	});
	t.is(statusCode, 500);
});

test('throwing in a beforeError hook - promise', withServer, async (t, server, got) => {
	server.get('/', (_request, response) => {
		response.end('ok');
	});

	await t.throwsAsync(got({
		hooks: {
			afterResponse: [
				() => {
					throw error;
				}
			],
			beforeError: [
				(): never => {
					throw new Error('foobar');
				},
				() => {
					throw new Error('This shouldn\'t be called at all');
				}
			]
		}
	}), {message: 'foobar'});
});

test('throwing in a beforeError hook - stream', withServer, async (t, _server, got) => {
	await t.throwsAsync(getStream(got.stream({
		hooks: {
			beforeError: [
				() => {
					throw new Error('foobar');
				},
				() => {
					throw new Error('This shouldn\'t be called at all');
				}
			]
		}
	})), {message: 'foobar'});
});

test('beforeError is called with an error - promise', withServer, async (t, server, got) => {
	server.get('/', (_request, response) => {
		response.end('ok');
	});

	await t.throwsAsync(got({
		hooks: {
			afterResponse: [
				() => {
					throw error;
				}
			],
			beforeError: [error2 => {
				t.true(error2 instanceof Error);
				return error2;
			}]
		}
	}), {message: errorString});
});

test('beforeError is called with an error - stream', withServer, async (t, _server, got) => {
	await t.throwsAsync(getStream(got.stream({
		hooks: {
			beforeError: [error2 => {
				t.true(error2 instanceof Error);
				return error2;
			}]
		}
	})), {message: 'Response code 404 (Not Found)'});
});

test('beforeError allows modifications', async t => {
	const errorString2 = 'foobar';

	await t.throwsAsync(got('https://example.com', {
		request: () => {
			throw error;
		},
		hooks: {
			beforeError: [
				error => {
					const newError = new Error(errorString2);

					return new RequestError(newError.message, newError, error.options);
				}
			]
		}
	}), {message: errorString2});
});

test('does not break on `afterResponse` hook with JSON mode', withServer, async (t, server, got) => {
	server.get('/foobar', echoHeaders);

	await t.notThrowsAsync(got('', {
		hooks: {
			afterResponse: [
				(response, retryWithMergedOptions) => {
					if (response.statusCode === 404) {
						const url = new URL('/foobar', response.url);

						return retryWithMergedOptions({url});
					}

					return response;
				}
			]
		},
		responseType: 'json'
	}));
});

test('catches HTTPErrors', withServer, async (t, _server, got) => {
	t.plan(2);

	await t.throwsAsync(got({
		hooks: {
			beforeError: [
				error => {
					t.true(error instanceof got.HTTPError);
					return error;
				}
			]
		}
	}));
});

test('timeout can be modified using a hook', withServer, async (t, server, got) => {
	server.get('/', () => {});

	await t.throwsAsync(got({
		timeout: 1000,
		hooks: {
			beforeRequest: [
				options => {
					options.timeout.request = 500;
				}
			]
		},
		retry: 0
	}), {message: 'Timeout awaiting \'request\' for 500ms'});
});

test('beforeRequest hook is called before each request', withServer, async (t, server, got) => {
	server.post('/', echoUrl);
	server.post('/redirect', redirectEndpoint);

	const buffer = Buffer.from('Hello, Got!');
	let counts = 0;

	await got.post('redirect', {
		body: buffer,
		hooks: {
			beforeRequest: [
				options => {
					counts++;
					t.is(options.headers['content-length'], String(buffer.length));
				}
			]
		}
	});

	t.is(counts, 2);
});
