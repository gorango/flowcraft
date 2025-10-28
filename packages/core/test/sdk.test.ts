import { describe, expect, it, vi } from 'vitest'
import { createWebhook, sleep, waitForEvent } from '../src/sdk'

describe('Flow SDK', () => {
	describe('sleep', () => {
		it('should return a promise that never resolves', async () => {
			const promise = sleep('5m')
			expect(promise).toBeInstanceOf(Promise)

			// The promise should not resolve immediately
			const spy = vi.fn()
			promise.then(spy)

			// Wait a tick
			await new Promise((resolve) => setImmediate(resolve))

			expect(spy).not.toHaveBeenCalled()
		})

		it('should warn when used outside compiled flow', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			sleep('5m')

			expect(consoleWarnSpy).toHaveBeenCalledWith(`'sleep' should only be used inside a compiled @flow function.`)

			consoleWarnSpy.mockRestore()
		})
	})

	describe('waitForEvent', () => {
		it('should return a promise that never resolves', async () => {
			const promise = waitForEvent('test-event')
			expect(promise).toBeInstanceOf(Promise)

			// The promise should not resolve immediately
			const spy = vi.fn()
			promise.then(spy)

			// Wait a tick
			await new Promise((resolve) => setImmediate(resolve))

			expect(spy).not.toHaveBeenCalled()
		})

		it('should warn when used outside compiled flow', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			waitForEvent('test-event')

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				`'waitForEvent' should only be used inside a compiled @flow function.`,
			)

			consoleWarnSpy.mockRestore()
		})
	})

	describe('createWebhook', () => {
		it('should return a promise that never resolves', async () => {
			const promise = createWebhook()
			expect(promise).toBeInstanceOf(Promise)

			// The promise should not resolve immediately
			const spy = vi.fn()
			promise.then(spy)

			// Wait a tick
			await new Promise((resolve) => setImmediate(resolve))

			expect(spy).not.toHaveBeenCalled()
		})

		it('should warn when used outside compiled flow', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			createWebhook()

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				`'createWebhook' should only be used inside a compiled @flow function.`,
			)

			consoleWarnSpy.mockRestore()
		})
	})
})
