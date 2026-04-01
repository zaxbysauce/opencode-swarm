import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	fetchGitingest,
	GITINGEST_MAX_RESPONSE_BYTES,
} from '../../../src/tools/gitingest';

describe('gitingest', () => {
	let originalFetch: typeof fetch;
	let lastFetchArgs: [string | URL | Request, RequestInit?] | undefined;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		lastFetchArgs = undefined;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe('fetchGitingest', () => {
		it('should handle success response correctly', async () => {
			// Mock successful fetch response
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				lastFetchArgs = [url, init];
				return new Response(
					JSON.stringify({
						summary: 'Test Summary',
						tree: 'Test Tree Content',
						content: 'Test File Content',
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			const result = await fetchGitingest({
				url: 'https://github.com/test/repo',
			});

			expect(result).toBe(
				'Test Summary\n\nTest Tree Content\n\nTest File Content',
			);
		});

		it('should send correct request body with defaults', async () => {
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				lastFetchArgs = [url, init];
				return new Response(
					JSON.stringify({
						summary: 'S',
						tree: 'T',
						content: 'C',
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			await fetchGitingest({ url: 'https://github.com/test/repo' });

			expect(lastFetchArgs).toBeDefined();
			const [url, init] = lastFetchArgs!;

			expect(url).toBe('https://gitingest.com/api/ingest');
			expect(init?.method).toBe('POST');
			expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });

			const body = JSON.parse(init?.body as string);
			expect(body.input_text).toBe('https://github.com/test/repo');
			expect(body.max_file_size).toBe(50000);
			expect(body.pattern).toBe('');
			expect(body.pattern_type).toBe('exclude');
		});

		it('should send custom args correctly', async () => {
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				lastFetchArgs = [url, init];
				return new Response(
					JSON.stringify({
						summary: 'S',
						tree: 'T',
						content: 'C',
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			await fetchGitingest({
				url: 'https://github.com/test/repo',
				maxFileSize: 10000,
				pattern: '*.ts',
				patternType: 'include',
			});

			expect(lastFetchArgs).toBeDefined();
			const [url, init] = lastFetchArgs!;

			const body = JSON.parse(init?.body as string);
			expect(body.input_text).toBe('https://github.com/test/repo');
			expect(body.max_file_size).toBe(10000);
			expect(body.pattern).toBe('*.ts');
			expect(body.pattern_type).toBe('include');
		});

		it('should throw error on non-ok response', async () => {
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				lastFetchArgs = [url, init];
				return new Response('Not Found', {
					status: 404,
					statusText: 'Not Found',
				});
			}) as typeof fetch;

			await expect(
				fetchGitingest({ url: 'https://github.com/test/repo' }),
			).rejects.toThrow('gitingest API error: 404 Not Found');
		});

		it('should throw error on network failure', async () => {
			const networkError = new Error('Network error');
			globalThis.fetch = (async () => {
				throw networkError;
			}) as typeof fetch;

			await expect(
				fetchGitingest({ url: 'https://github.com/test/repo' }),
			).rejects.toThrow('Network error');
		});

		it('should pass AbortSignal to fetch', async () => {
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				lastFetchArgs = [url, init];
				expect(init?.signal).toBeInstanceOf(AbortSignal);
				return new Response(
					JSON.stringify({
						summary: 'Test Summary',
						tree: 'Test Tree Content',
						content: 'Test File Content',
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			await fetchGitingest({ url: 'https://github.com/test/repo' });
		});

		it('should throw timeout error on DOMException AbortError', async () => {
			let callCount = 0;
			globalThis.fetch = (async () => {
				callCount++;
				throw new DOMException('Aborted', 'AbortError');
			}) as typeof fetch;

			await expect(
				fetchGitingest({ url: 'https://github.com/test/repo' }),
			).rejects.toThrow('gitingest request timed out');
		});

		it('should retry on 5xx errors', async () => {
			let callCount = 0;
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				callCount++;
				if (callCount <= 2) {
					return new Response('Internal Server Error', { status: 500 });
				}
				return new Response(
					JSON.stringify({
						summary: 'Test Summary',
						tree: 'Test Tree Content',
						content: 'Test File Content',
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			const result = await fetchGitingest({
				url: 'https://github.com/test/repo',
			});
			expect(result).toBe(
				'Test Summary\n\nTest Tree Content\n\nTest File Content',
			);
			expect(callCount).toBe(3);
		});

		it('should not retry on 4xx errors', async () => {
			let callCount = 0;
			globalThis.fetch = (async () => {
				callCount++;
				return new Response('Bad Request', {
					status: 400,
					statusText: 'Bad Request',
				});
			}) as typeof fetch;

			await expect(
				fetchGitingest({ url: 'https://github.com/test/repo' }),
			).rejects.toThrow('gitingest API error: 400 Bad Request');
			expect(callCount).toBe(1);
		});

		it('should throw on Content-Length exceeding limit', async () => {
			globalThis.fetch = (async () => {
				const headers = new Headers();
				headers.set('content-length', '10000000');
				return new Response(
					JSON.stringify({
						summary: 'Test Summary',
						tree: 'Test Tree Content',
						content: 'Test File Content',
					}),
					{
						status: 200,
						headers,
					},
				);
			}) as typeof fetch;

			await expect(
				fetchGitingest({ url: 'https://github.com/test/repo' }),
			).rejects.toThrow('gitingest response too large');
		});

		it('should throw on response body exceeding size limit', async () => {
			const largeContent = 'x'.repeat(GITINGEST_MAX_RESPONSE_BYTES + 1);
			globalThis.fetch = (async () => {
				return new Response(
					JSON.stringify({
						summary: 'Test Summary',
						tree: 'Test Tree Content',
						content: largeContent,
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			await expect(
				fetchGitingest({ url: 'https://github.com/test/repo' }),
			).rejects.toThrow('gitingest response too large');
		});

		it('should retry on network errors then succeed', async () => {
			let callCount = 0;
			globalThis.fetch = (async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error('fetch failed');
				}
				return new Response(
					JSON.stringify({
						summary: 'Test Summary',
						tree: 'Test Tree Content',
						content: 'Test File Content',
					}),
					{ status: 200 },
				);
			}) as typeof fetch;

			const result = await fetchGitingest({
				url: 'https://github.com/test/repo',
			});
			expect(result).toBe(
				'Test Summary\n\nTest Tree Content\n\nTest File Content',
			);
			expect(callCount).toBe(2);
		});
	});
});
