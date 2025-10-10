import { describe, it } from 'vitest'

describe('BaseNode Lifecycle', () => {
	it('should call `prep`, `exec`, and `post` in order for a successful execution', () => { })
	it('should call `prep` only once, even if `exec` fails', () => { })
	it('should not call `post` if `exec` fails and there is no fallback', () => { })
	it('should call `fallback` if `exec` fails after all retries', () => { })
	it('should call `post` with the result of `fallback` if it succeeds', () => { })
	it('should re-throw the original error from fallback by default', () => { })
	it('should receive correct `params` in the constructor', () => { })
	it('should receive the result of `prep` as the first argument to `exec`', () => { })
})
