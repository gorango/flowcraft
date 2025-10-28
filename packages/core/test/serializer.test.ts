import { describe, expect, it, vi } from 'vitest'
import { JsonSerializer } from '../src/serializer'

describe('JsonSerializer', () => {
	it('should serialize simple data correctly', () => {
		const serializer = new JsonSerializer()
		const data = { key: 'value', number: 42 }
		const result = serializer.serialize(data)
		expect(result).toBe('{"key":"value","number":42}')
	})

	it('should deserialize simple data correctly', () => {
		const serializer = new JsonSerializer()
		const json = '{"key":"value","number":42}'
		const result = serializer.deserialize(json)
		expect(result).toEqual({ key: 'value', number: 42 })
	})

	it('should warn once when serializing data with Map', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const serializer = new JsonSerializer()
		const data = { map: new Map([['a', 1]]) }
		serializer.serialize(data)
		expect(warnSpy).toHaveBeenCalledTimes(1)
		expect(warnSpy).toHaveBeenCalledWith(
			'[Flowcraft] Warning: Default JsonSerializer does not support Map, Set, or Date types. Data may be lost. Consider providing a custom ISerializer (e.g., using superjson).',
		)
		warnSpy.mockRestore()
	})

	it('should warn once when serializing data with Set', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const serializer = new JsonSerializer()
		const data = { set: new Set([1, 2, 3]) }
		serializer.serialize(data)
		expect(warnSpy).toHaveBeenCalledTimes(1)
		warnSpy.mockRestore()
	})

	it('should warn once when serializing data with Date', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const serializer = new JsonSerializer()
		const data = { date: new Date() }
		serializer.serialize(data)
		expect(warnSpy).toHaveBeenCalledTimes(1)
		warnSpy.mockRestore()
	})

	it('should warn only once for multiple complex types in one serialize call', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const serializer = new JsonSerializer()
		const data = { map: new Map(), set: new Set(), date: new Date() }
		serializer.serialize(data)
		expect(warnSpy).toHaveBeenCalledTimes(1)
		warnSpy.mockRestore()
	})

	it('should not warn again after first warning', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const serializer = new JsonSerializer()
		const data1 = { map: new Map() }
		const data2 = { set: new Set() }
		serializer.serialize(data1)
		serializer.serialize(data2)
		expect(warnSpy).toHaveBeenCalledTimes(1)
		warnSpy.mockRestore()
	})

	it('should throw on invalid JSON in deserialize', () => {
		const serializer = new JsonSerializer()
		expect(() => serializer.deserialize('invalid json')).toThrow()
	})
})
