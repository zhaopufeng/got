import {URL} from 'url';
import {CancelError} from 'p-cancelable';
import {
	// Request & Response
	CancelableRequest,
	Response,

	// Options
	Options,
	NormalizedOptions,
	Defaults as DefaultOptions,
	PaginationOptions,

	// Errors
	ParseError,
	RequestError,
	CacheError,
	ReadError,
	HTTPError,
	MaxRedirectsError,
	TimeoutError
} from './as-promise';
import Request from './core';

// `type-fest` utilities
type Except<ObjectType, KeysType extends keyof ObjectType> = Pick<ObjectType, Exclude<keyof ObjectType, KeysType>>;
type Merge<FirstType, SecondType> = Except<FirstType, Extract<keyof FirstType, keyof SecondType>> & SecondType;

export interface InstanceDefaults {
	options: DefaultOptions;
	handlers: HandlerFunction[];
	mutableDefaults: boolean;
	_rawHandlers?: HandlerFunction[];
}

export type GotReturn = Request | CancelableRequest;
export type HandlerFunction = <T extends GotReturn>(options: NormalizedOptions, next: (options: NormalizedOptions) => T) => T | Promise<T>;

export interface ExtendOptions extends Options {
	handlers?: HandlerFunction[];
	mutableDefaults?: boolean;
}

export type OptionsOfTextResponseBody = Options & {isStream?: false; resolveBodyOnly?: false; responseType?: 'text'};
export type OptionsOfJSONResponseBody = Options & {isStream?: false; resolveBodyOnly?: false; responseType: 'json'};
export type OptionsOfBufferResponseBody = Options & {isStream?: false; resolveBodyOnly?: false; responseType: 'buffer'};
export type StrictOptions = Except<Options, 'isStream' | 'responseType' | 'resolveBodyOnly'>;
type ResponseBodyOnly = {resolveBodyOnly: true};

export type OptionsWithPagination<T = unknown> = Merge<Options, PaginationOptions<T>>;

export interface GotPaginate {
	<T>(url: string | URL, options?: OptionsWithPagination<T>): AsyncIterableIterator<T>;
	all<T>(url: string | URL, options?: OptionsWithPagination<T>): Promise<T[]>;

	// A bug.
	// eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
	<T>(options?: OptionsWithPagination<T>): AsyncIterableIterator<T>;
	// A bug.
	// eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
	all<T>(options?: OptionsWithPagination<T>): Promise<T[]>;
}

export interface GotRequestFunction {
	// `asPromise` usage
	(url: string | URL, options?: OptionsOfTextResponseBody): CancelableRequest<Response<string>>;
	<T>(url: string | URL, options?: OptionsOfJSONResponseBody): CancelableRequest<Response<T>>;
	(url: string | URL, options?: OptionsOfBufferResponseBody): CancelableRequest<Response<Buffer>>;

	(options: OptionsOfTextResponseBody): CancelableRequest<Response<string>>;
	<T>(options: OptionsOfJSONResponseBody): CancelableRequest<Response<T>>;
	(options: OptionsOfBufferResponseBody): CancelableRequest<Response<Buffer>>;

	// `resolveBodyOnly` usage
	(url: string | URL, options?: (OptionsOfTextResponseBody & ResponseBodyOnly)): CancelableRequest<string>;
	<T>(url: string | URL, options?: (OptionsOfJSONResponseBody & ResponseBodyOnly)): CancelableRequest<T>;
	(url: string | URL, options?: (OptionsOfBufferResponseBody & ResponseBodyOnly)): CancelableRequest<Buffer>;

	(options: (OptionsOfTextResponseBody & ResponseBodyOnly)): CancelableRequest<string>;
	<T>(options: (OptionsOfJSONResponseBody & ResponseBodyOnly)): CancelableRequest<T>;
	(options: (OptionsOfBufferResponseBody & ResponseBodyOnly)): CancelableRequest<Buffer>;

	// `asStream` usage
	(url: string | URL, options?: Options & {isStream: true}): Request;

	(options: Options & {isStream: true}): Request;

	// Fallback
	(url: string | URL, options?: Options): CancelableRequest | Request;

	(options: Options): CancelableRequest | Request;
}

export type HTTPAlias =
	| 'get'
	| 'post'
	| 'put'
	| 'patch'
	| 'head'
	| 'delete';

interface GotStreamFunction {
	(url: string | URL, options?: Options & {isStream?: true}): Request;
	(options?: Options & {isStream?: true}): Request;
}

export type GotStream = GotStreamFunction & Record<HTTPAlias, GotStreamFunction>;

export interface Got extends Record<HTTPAlias, GotRequestFunction>, GotRequestFunction {
	stream: GotStream;
	paginate: GotPaginate;
	defaults: InstanceDefaults;
	CacheError: typeof CacheError;
	RequestError: typeof RequestError;
	ReadError: typeof ReadError;
	ParseError: typeof ParseError;
	HTTPError: typeof HTTPError;
	MaxRedirectsError: typeof MaxRedirectsError;
	TimeoutError: typeof TimeoutError;
	CancelError: typeof CancelError;

	extend(...instancesOrOptions: Array<Got | ExtendOptions>): Got;
	mergeInstances(parent: Got, ...instances: Got[]): Got;
	mergeOptions(...sources: Options[]): NormalizedOptions;
}
