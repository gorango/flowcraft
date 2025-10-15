import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger, NullLogger } from '../src/logger'

describe('ConsoleLogger', () => {
	it('should log debug messages to console', () => {
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
		const logger = new ConsoleLogger()
		logger.debug('test message', { key: 'value' })
		expect(debugSpy).toHaveBeenCalledWith('[DEBUG] test message', { key: 'value' })
		debugSpy.mockRestore()
	})

	it('should log info messages to console', () => {
		const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
		const logger = new ConsoleLogger()
		logger.info('test message', { key: 'value' })
		expect(infoSpy).toHaveBeenCalledWith('[INFO] test message', { key: 'value' })
		infoSpy.mockRestore()
	})

	it('should log warn messages to console', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const logger = new ConsoleLogger()
		logger.warn('test message', { key: 'value' })
		expect(warnSpy).toHaveBeenCalledWith('[WARN] test message', { key: 'value' })
		warnSpy.mockRestore()
	})

	it('should log error messages to console', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const logger = new ConsoleLogger()
		logger.error('test message', { key: 'value' })
		expect(errorSpy).toHaveBeenCalledWith('[ERROR] test message', { key: 'value' })
		errorSpy.mockRestore()
	})

	it('should handle undefined meta', () => {
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
		const logger = new ConsoleLogger()
		logger.debug('test message')
		expect(debugSpy).toHaveBeenCalledWith('[DEBUG] test message', '')
		debugSpy.mockRestore()
	})
})

describe('NullLogger', () => {
	it('should do nothing on debug', () => {
		const logger = new NullLogger()
		expect(() => logger.debug('test')).not.toThrow()
	})

	it('should do nothing on info', () => {
		const logger = new NullLogger()
		expect(() => logger.info('test')).not.toThrow()
	})

	it('should do nothing on warn', () => {
		const logger = new NullLogger()
		expect(() => logger.warn('test')).not.toThrow()
	})

	it('should do nothing on error', () => {
		const logger = new NullLogger()
		expect(() => logger.error('test')).not.toThrow()
	})
})
