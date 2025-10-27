import { describe, expect, it } from 'vitest'
import { Compiler } from '../src/compiler'

describe('Compiler', () => {
	it('should compile a simple project', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['src/index.ts'])
		expect(result.blueprints).toBeDefined()
		expect(result.registry).toBeDefined()
		expect(result.diagnostics).toBeDefined()
	})

	it('should compile all test fixtures', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/index.ts'])
		expect(result.blueprints).toMatchSnapshot()
		expect(result.registry).toMatchSnapshot()
		expect(result.manifestSource).toMatchSnapshot()
		expect(result.diagnostics).toMatchSnapshot()
	})
})
