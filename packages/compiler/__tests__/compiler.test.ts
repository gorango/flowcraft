import { describe, it, expect } from 'vitest'
import { Compiler } from '../src/compiler'

describe('Compiler', () => {
	it('should compile a simple project', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['src/index.ts'])
		expect(result.blueprints).toBeDefined()
		expect(result.registry).toBeDefined()
		expect(result.diagnostics).toBeDefined()
	})
})
