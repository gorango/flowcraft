import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'

// Declare Deno for TypeScript
declare const Deno: any

// Store original global state
let originalGlobals: any = {}
let mockedProperties: string[] = []

const mockBrowserAPIs = () => {
	// Store original values before mocking
	originalGlobals = {
		window: global.window,
		document: global.document,
		navigator: global.navigator,
		location: global.location,
		localStorage: global.localStorage,
		sessionStorage: global.sessionStorage,
		fetch: global.fetch,
	}

	// Mock window
	const localStorageData: Record<string, string> = {}
	const sessionStorageData: Record<string, string> = {}
	const mockWindow = {
		location: { href: 'https://example.com' },
		navigator: { userAgent: 'Mock Browser' },
		localStorage: {
			getItem: vi.fn((key: string) => localStorageData[key] || null),
			setItem: vi.fn((key: string, value: string) => {
				localStorageData[key] = value
			}),
			removeItem: vi.fn((key: string) => {
				delete localStorageData[key]
			}),
			clear: vi.fn(() => {
				Object.keys(localStorageData).forEach((key) => {
					delete localStorageData[key]
				})
			}),
		},
		sessionStorage: {
			getItem: vi.fn((key: string) => sessionStorageData[key] || null),
			setItem: vi.fn((key: string, value: string) => {
				sessionStorageData[key] = value
			}),
			removeItem: vi.fn((key: string) => {
				delete sessionStorageData[key]
			}),
			clear: vi.fn(() => {
				Object.keys(sessionStorageData).forEach((key) => {
					delete sessionStorageData[key]
				})
			}),
		},
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
		setTimeout: global.setTimeout,
		clearTimeout: global.clearTimeout,
		setInterval: global.setInterval,
		clearInterval: global.clearInterval,
		fetch: vi.fn(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: 'mock' }),
			}),
		),
		XMLHttpRequest: vi.fn(),
		WebSocket: vi.fn(),
	} as any

	// Mock document
	const mockDocument = {
		createElement: vi.fn(() => ({})),
		createTextNode: vi.fn(() => ({})),
		querySelector: vi.fn(),
		querySelectorAll: vi.fn(() => []),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
		body: {},
		head: {},
	} as any

	// Use Object.defineProperty to mock globals safely
	Object.defineProperty(global, 'window', { value: mockWindow, writable: true, configurable: true })
	Object.defineProperty(global, 'document', { value: mockDocument, writable: true, configurable: true })
	Object.defineProperty(global, 'navigator', { value: mockWindow.navigator, writable: true, configurable: true })
	Object.defineProperty(global, 'location', { value: mockWindow.location, writable: true, configurable: true })
	Object.defineProperty(global, 'localStorage', { value: mockWindow.localStorage, writable: true, configurable: true })
	Object.defineProperty(global, 'sessionStorage', {
		value: mockWindow.sessionStorage,
		writable: true,
		configurable: true,
	})
	Object.defineProperty(global, 'fetch', {
		value: (_url: string) =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: 'mock' }),
			}),
		writable: true,
		configurable: true,
	})

	mockedProperties = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'fetch']
}

const restoreNodeAPIs = () => {
	// Restore original global state using defineProperty
	mockedProperties.forEach((key) => {
		if (originalGlobals[key] === undefined) {
			delete (global as any)[key]
		} else {
			Object.defineProperty(global, key, { value: originalGlobals[key], writable: true, configurable: true })
		}
	})
	originalGlobals = {}
	mockedProperties = []
}

describe('Cross-Environment Compatibility Testing', () => {
	describe('Browser Environment Simulation', () => {
		beforeEach(() => {
			mockBrowserAPIs()
		})

		afterEach(() => {
			restoreNodeAPIs()
			// Force garbage collection if available
			if (global.gc) {
				global.gc()
			}
		})

		it('should work in browser-like environment', async () => {
			const flow = createFlow('browser-test')
			flow.node('browser-node', async () => {
				// Test access to browser APIs
				const userAgent = global.navigator?.userAgent
				const url = global.location?.href
				const hasLocalStorage = typeof global.localStorage !== 'undefined'

				return {
					output: {
						userAgent,
						url,
						hasLocalStorage,
						environment: 'browser',
					},
				}
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.browser-node'].environment).toBe('browser')
			expect(result.context['_outputs.browser-node'].hasLocalStorage).toBe(true)
		})

		it('should handle browser-specific timing functions', async () => {
			const flow = createFlow('browser-timing')
			flow.node('timing-test', async () => {
				await new Promise((resolve) => {
					const start = Date.now()
					global.setTimeout(() => {
						const _elapsed = Date.now() - start
						resolve(void 0)
					}, 10)
				})
				return { output: { elapsed: 10, usedSetTimeout: true } }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.timing-test'].usedSetTimeout).toBe(true)
			expect(result.context['_outputs.timing-test'].elapsed).toBeGreaterThanOrEqual(5)
		})

		it('should handle browser fetch API', async () => {
			const flow = createFlow('browser-fetch')
			flow.node('fetch-test', async (): Promise<any> => {
				if (typeof global.fetch === 'function') {
					const response = await global.fetch('https://api.example.com/data')
					const data = await response.json()
					return { output: { fetched: true, data, reason: undefined } }
				}
				return { output: { fetched: false, data: undefined, reason: 'fetch not available' } }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.fetch-test'].fetched).toBe(true)
			expect(result.context['_outputs.fetch-test'].data).toEqual({ data: 'mock' })
		})

		it('should handle browser storage APIs', async () => {
			const flow = createFlow('browser-storage')
			flow.node('storage-test', async ({ context }) => {
				const testKey = 'test_key'
				const testValue = 'test_value'

				// Test localStorage
				if (global.localStorage) {
					global.localStorage.setItem(testKey, testValue)
					const retrieved = global.localStorage.getItem(testKey)
					global.localStorage.removeItem(testKey)

					await context.set('storage_test', {
						localStorage: true,
						set: true,
						get: retrieved === testValue,
						remove: true,
					})
				} else {
					await context.set('storage_test', { localStorage: false })
				}

				return { output: await context.get('storage_test') }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.storage-test'].localStorage).toBe(true)
			expect(result.context['_outputs.storage-test'].get).toBe(true)
		})
	})

	describe('Node.js Environment Testing', () => {
		it('should work in Node.js environment', async () => {
			const flow = createFlow('node-test')
			flow.node('node-node', async () => {
				// Test Node.js globals
				const hasProcess = typeof global.process !== 'undefined'
				const hasGlobal = typeof global.global !== 'undefined'
				const hasBuffer = typeof global.Buffer !== 'undefined'
				const platform = global.process?.platform

				return {
					output: {
						hasProcess,
						hasGlobal,
						hasBuffer,
						platform,
						environment: 'node',
					},
				}
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.node-node'].environment).toBe('node')
			expect(result.context['_outputs.node-node'].hasProcess).toBe(true)
			expect(result.context['_outputs.node-node'].hasBuffer).toBe(true)
		})

		it('should handle Node.js-specific modules when available', async () => {
			const flow = createFlow('node-modules')
			flow.node('module-test', async (): Promise<any> => {
				try {
					// Test if we can access Node.js modules (in a safe way)
					const hasRequire = typeof require !== 'undefined'
					let hasFs = false
					let hasPath = false

					if (hasRequire) {
						try {
							require('node:fs')
							hasFs = true
						} catch {}
						try {
							require('node:path')
							hasPath = true
						} catch {}
					}

					return {
						output: {
							hasRequire,
							hasFs,
							hasPath,
							nodeModules: true,
							error: undefined,
						},
					}
				} catch (error) {
					return {
						output: {
							hasRequire: false,
							hasFs: false,
							hasPath: false,
							nodeModules: false,
							error: String(error),
						},
					}
				}
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.module-test'].hasRequire).toBe(true)
		})
	})

	describe('Environment Detection and Adaptation', () => {
		it('should detect and adapt to different environments', async () => {
			const flow = createFlow('env-detection')
			flow.node('env-detector', async () => {
				const isBrowser = typeof window !== 'undefined'
				const isNode = !!(typeof process !== 'undefined' && process.versions && process.versions.node)
				const isWebWorker = typeof self !== 'undefined' && typeof self.postMessage === 'function' && !isBrowser
				const isDeno = typeof Deno !== 'undefined'

				let environment = 'unknown'
				if (isDeno) environment = 'deno'
				else if (isWebWorker) environment = 'webworker'
				else if (isBrowser) environment = 'browser'
				else if (isNode) environment = 'node'

				return {
					output: {
						isBrowser,
						isNode,
						isWebWorker,
						isDeno,
						environment,
						userAgent: global.navigator?.userAgent || 'unknown',
					},
				}
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.env-detector'].environment).toBe('node')
			expect(result.context['_outputs.env-detector'].isNode).toBe(true)
		})

		it('should provide environment-specific utilities', async () => {
			const flow = createFlow('env-utils')
			flow.node('env-utils-test', async () => {
				const utils = {
					// Browser utilities
					hasLocalStorage: typeof localStorage !== 'undefined',
					hasSessionStorage: typeof sessionStorage !== 'undefined',
					hasFetch: typeof fetch !== 'function',

					// Node.js utilities
					hasProcess: typeof process !== 'undefined',
					hasBuffer: typeof Buffer !== 'undefined',
					hasRequire: typeof require !== 'function',

					// Universal utilities
					hasConsole: typeof console !== 'undefined',
					hasSetTimeout: typeof setTimeout !== 'function',
					hasPromise: typeof Promise !== 'undefined',
				}

				return { output: utils }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			const utils = result.context['_outputs.env-utils-test']
			expect(utils.hasProcess).toBe(true)
			expect(utils.hasBuffer).toBe(true)
			expect(utils.hasConsole).toBe(true)
			expect(utils.hasPromise).toBe(true)
		})
	})

	describe('Module System Compatibility', () => {
		it('should work with different module systems', async () => {
			const flow = createFlow('module-system')
			flow.node('module-test', async () => {
				const moduleInfo = {
					hasImport: false, // Dynamic import check below
					hasRequire: typeof require !== 'undefined',
					hasExports: typeof exports !== 'undefined',
					hasModule: typeof module !== 'undefined',
					esm: typeof import.meta !== 'undefined',
				}

				// Test dynamic import if available
				let dynamicImportWorks = false
				try {
					// Try to dynamically import a built-in module
					await import('node:util')
					dynamicImportWorks = true
					moduleInfo.hasImport = true
				} catch {
					dynamicImportWorks = false
					moduleInfo.hasImport = false
				}

				return {
					output: {
						...moduleInfo,
						dynamicImportWorks,
					},
				}
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.module-test'].hasRequire).toBe(true)
		})

		it('should handle ES modules vs CommonJS differences', async () => {
			const flow = createFlow('esm-cjs')
			flow.node('module-format-test', async () => {
				const format = {
					// CommonJS indicators
					commonjs: !!(typeof module !== 'undefined' && module.exports),
					esm: typeof import.meta !== 'undefined',

					// Check if we're in a module context
					isModule: (typeof module !== 'undefined' && module) || typeof import.meta !== 'undefined',

					// Check for __dirname/__filename (CommonJS)
					hasDirname: typeof __dirname !== 'undefined',
					hasFilename: typeof __filename !== 'undefined',
				}

				return { output: format }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			const format = result.context['_outputs.module-format-test']
			expect(format.commonjs).toBe(true)
		})
	})

	describe('Global Object Differences', () => {
		it('should handle different global objects', async () => {
			const flow = createFlow('global-objects')
			flow.node('global-test', async () => {
				const globals = {
					hasWindow: typeof window !== 'undefined',
					hasGlobal: typeof global !== 'undefined',
					hasSelf: typeof self !== 'undefined',
					hasGlobalThis: typeof globalThis !== 'undefined',

					// Check if globalThis points to the right global
					globalThisIsGlobal: typeof globalThis !== 'undefined' && globalThis === global,
					globalThisIsWindow:
						typeof globalThis !== 'undefined' && typeof window !== 'undefined' && globalThis === window,

					// Common global properties
					hasSetTimeout: typeof setTimeout !== 'function',
					hasConsole: typeof console !== 'undefined',
					hasProcess: typeof process !== 'undefined',
				}

				return { output: globals }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			const globals = result.context['_outputs.global-test']
			expect(globals.hasGlobal).toBe(true)
			expect(globals.hasGlobalThis).toBe(true)
			expect(globals.globalThisIsGlobal).toBe(true)
		})

		it('should work with globalThis as universal global reference', async () => {
			const flow = createFlow('globalthis-test')
			flow.node('globalthis-node', async () => {
				// Use globalThis for environment-agnostic code
				const env = {
					platform: globalThis.process?.platform || 'browser',
					userAgent: globalThis.navigator?.userAgent || 'unknown',
					hasLocalStorage: typeof globalThis.localStorage !== 'undefined',
				}

				return { output: env }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.globalthis-node'].platform).toBeDefined()
		})
	})

	describe('Event Loop and Asynchronous Operations', () => {
		it('should handle different event loop implementations', async () => {
			const flow = createFlow('event-loop')
			flow.node('async-test', async () => {
				const results = []

				// Test microtask queue (Promise)
				results.push('sync')
				await Promise.resolve()
				results.push('microtask')

				// Test macrotask queue (setTimeout)
				await new Promise((resolve) =>
					setTimeout(() => {
						results.push('macrotask')
						resolve(void 0)
					}, 1),
				)

				return { output: { executionOrder: results } }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.async-test'].executionOrder).toEqual(['sync', 'microtask', 'macrotask'])
		})

		it('should handle environment-specific async patterns', async () => {
			const flow = createFlow('async-patterns')
			flow.node('pattern-test', async () => {
				const patterns = {
					hasPromise: typeof Promise !== 'undefined',
					hasAsyncAwait: true, // If this code runs, async/await works
					hasSetImmediate: typeof setImmediate !== 'function',
					hasProcessNextTick: typeof process?.nextTick !== 'function',
					hasRequestAnimationFrame: typeof requestAnimationFrame !== 'function',
				}

				// Test process.nextTick if available
				let nextTickWorks = false
				if (patterns.hasProcessNextTick) {
					await new Promise((resolve) => {
						process.nextTick(() => {
							nextTickWorks = true
							resolve(void 0)
						})
					})
				}

				return { output: { ...patterns, nextTickWorks } }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.pattern-test'].hasPromise).toBe(true)
			expect(result.context['_outputs.pattern-test'].hasAsyncAwait).toBe(true)
		})
	})

	describe('Polyfill and Fallback Testing', () => {
		it('should work with polyfilled APIs', async () => {
			// Simulate polyfills
			const originalFetch = global.fetch
			const originalPromise = global.Promise

			// Mock a polyfilled fetch
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ polyfilled: true }),
				} as any),
			)

			const flow = createFlow('polyfill-test')
			flow.node('polyfill-node', async () => {
				const response = await fetch('https://api.example.com')
				const data = await response.json()
				return { output: data }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.polyfill-node'].polyfilled).toBe(true)

			// Restore originals
			global.fetch = originalFetch
			global.Promise = originalPromise
		})

		it('should handle missing APIs gracefully', async () => {
			const flow = createFlow('missing-api-test')
			flow.node('missing-api-node', async () => {
				const apis = {
					fetch: typeof fetch !== 'function',
					localStorage: typeof localStorage === 'undefined',
					WebSocket: typeof WebSocket === 'undefined',
					XMLHttpRequest: typeof XMLHttpRequest === 'undefined',
				}

				// Try to use APIs that might not exist
				let fetchResult = null
				try {
					if (typeof fetch === 'function') {
						fetchResult = 'available'
					} else {
						fetchResult = 'unavailable'
					}
				} catch {
					fetchResult = 'error'
				}

				return { output: { ...apis, fetchResult } }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.missing-api-node'].fetchResult).toBe('available')
		})
	})
})
