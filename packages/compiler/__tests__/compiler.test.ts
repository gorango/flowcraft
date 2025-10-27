import { describe, it, expect } from 'vitest'
import { Compiler } from '../src/compiler'
import * as path from 'path'

describe('Compiler', () => {
	it('should compile a simple project', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['src/index.ts'])
		expect(result.blueprints).toBeDefined()
		expect(result.registry).toBeDefined()
		expect(result.diagnostics).toBeDefined()
	})

	it('should compile fixture with subflow', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['__tests__/fixtures/main-flow.ts'])
		expect(result.blueprints).toMatchSnapshot()
		expect(result.registry).toMatchSnapshot()
		expect(result.manifestSource).toMatchSnapshot()
	})
})
