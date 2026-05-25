import { describe, expect, it } from 'vitest'
import { Compiler } from '../src/compiler'
import { compileCode } from '../src/index'
import { loadConfig } from '../src/config-loader'
import { buildFlows } from '../src/build'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
		const result = compiler.compileProject([
			'test/fixtures/simple-flow.ts',
			'test/fixtures/parallel-flow.ts',
			'test/fixtures/loop-control-flow.ts',
		])

		expect(result.blueprints).toBeDefined()
		expect(Object.keys(result.blueprints).length).toBeGreaterThan(0)

		expect(result.registry).toBeDefined()
		expect(Object.keys(result.registry).length).toBeGreaterThan(0)

		expect(result.diagnostics).toBeDefined()

		expect(result.manifestSource).toBeDefined()
		expect(result.manifestSource).toContain('export const registry')
		expect(result.manifestSource).toContain('export const blueprints')

		const blueprintNames = Object.keys(result.blueprints)
		expect(blueprintNames).toContain('simpleFlow')
		expect(blueprintNames).toContain('parallelFlow')
		expect(blueprintNames).toContain('whileLoopWithBreak')
	})

	it('should preserve source locations in blueprints', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		const simpleFlow = result.blueprints.simpleFlow
		expect(simpleFlow).toBeDefined()

		const fetchUser = simpleFlow.nodes.find((n) => n.id === 'fetchUser_1')
		expect(fetchUser).toBeDefined()
		if (!fetchUser) throw new Error('fetchUser not found')
		expect(fetchUser._sourceLocation).toBeDefined()
		if (!fetchUser._sourceLocation) throw new Error('sourceLocation not found')
		expect(fetchUser._sourceLocation.file).toContain('simple-flow.ts')
		expect(fetchUser._sourceLocation.line).toBe(3)
		expect(fetchUser._sourceLocation.column).toBe(2)
	})

	it('should handle conditional edges correctly', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-if-else.ts'])

		const ifElseFlow = result.blueprints.simpleIfElseFlow
		expect(ifElseFlow).toBeDefined()

		const conditionalEdges = ifElseFlow.edges.filter((e) => e.condition)
		expect(conditionalEdges.length).toBe(2)
	})

	it('should handle loop constructs correctly', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/loop-control-flow.ts'])

		const whileLoop = result.blueprints.whileLoopWithBreak
		expect(whileLoop).toBeDefined()

		const loopController = whileLoop.nodes.find((n) => n.uses === 'loop-controller')
		expect(loopController).toBeDefined()
		if (!loopController) throw new Error('loopController not found')
		expect(loopController.params?.condition).toBeDefined()

		const breakEdges = whileLoop.edges.filter((e) => e.action === 'break')
		expect(breakEdges.length).toBeGreaterThan(0)
	})

	it('should handle parallel execution correctly', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/parallel-flow.ts'])

		const parallelFlow = result.blueprints.parallelFlow
		expect(parallelFlow).toBeDefined()

		const parallelNodes = parallelFlow.nodes.filter((n) => n.id?.endsWith('_parallel_1'))
		expect(parallelNodes.length).toBe(3)

		const joinNode = parallelFlow.nodes.find(
			(n) => n.uses === 'aggregateData' && n.config?.joinStrategy === 'all',
		)
		expect(joinNode).toBeDefined()
	})

	it('should compile complex control flow with loops and error handling', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/complex-control-flow.ts'])

		expect(result.blueprints.complexControlFlow).toBeDefined()
		expect(result.blueprints.nestedControlFlow).toBeDefined()

		const complex = result.blueprints.complexControlFlow

		const loopController = complex.nodes.find((n) => n.uses === 'loop-controller')
		expect(loopController).toBeDefined()
		if (!loopController) throw new Error('loopController not found')
		expect(loopController.params?.condition).toContain('currentBatch')

		const fallbackNode = complex.nodes.find((n) => n.config?.fallback)
		expect(fallbackNode).toBeDefined()
		if (!fallbackNode?.config) throw new Error('fallbackNode config not found')
		expect(fallbackNode.config.fallback).toContain('handleBatchError')
	})

	it('should handle subflows correctly', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/main-flow.ts'])

		const mainFlow = result.blueprints.mainFlow
		expect(mainFlow).toBeDefined()

		const subflowNode = mainFlow.nodes.find((n) => n.uses === 'subflow')
		expect(subflowNode).toBeDefined()
		if (!subflowNode?.params) throw new Error('subflowNode params not found')
		expect(subflowNode.params.blueprintId).toBe('subFlow')
	})

	it('should handle for-of loops with break/continue', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/loop-control-flow.ts'])

		const forOfWithBreak = result.blueprints.forOfLoopWithBreak
		expect(forOfWithBreak).toBeDefined()

		const continueEdges = forOfWithBreak.edges.filter((e) => e.action === 'continue')
		expect(continueEdges.length).toBeGreaterThan(0)

		const forOfWithContinue = result.blueprints.forOfLoopWithContinue
		expect(forOfWithContinue).toBeDefined()
	})

	it('should handle while loops with continue', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/loop-control-flow.ts'])

		const whileContinue = result.blueprints.whileLoopWithContinue
		expect(whileContinue).toBeDefined()

		const continueEdges = whileContinue.edges.filter((e) => e.action === 'continue')
		expect(continueEdges.length).toBeGreaterThan(0)
	})

	it('should register all step functions in registry', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		expect(result.registry.fetchUser).toBeDefined()
		expect(result.registry.fetchUser.exportName).toBe('fetchUser')
		expect(result.registry.fetchUser.importPath).toContain('simple-flow.ts')

		expect(result.registry.processOrders).toBeDefined()
	})

	it('should generate valid manifest source code', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		expect(result.manifestSource).toContain('import { fetchUser }')
		expect(result.manifestSource).toContain('import { processOrders }')
		expect(result.manifestSource).toContain('export const registry')
		expect(result.manifestSource).toContain('export const blueprints')
	})

	it('should handle type mismatch errors in diagnostics', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/type-mismatch.ts'])

		expect(result.diagnostics.length).toBeGreaterThan(0)
		const typeError = result.diagnostics.find((d) => d.severity === 'error')
		expect(typeError).toBeDefined()
	})

	it('should handle invalid await errors', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/invalid-await.ts'])

		const awaitError = result.diagnostics.find((d) => d.severity === 'error')
		expect(awaitError).toBeDefined()
		if (!awaitError) throw new Error('awaitError not found')
		expect(awaitError.message).toContain('await')
	})
})

describe('compileCode', () => {
	it('should compile a JSDoc-style flow from code string', () => {
		const code = `
/** @step */
export async function greet(params: { name: string }) {
  return { message: 'hello ' + params.name }
}

/** @flow */
export async function myFlow(context: any) {
  const result = await greet({ name: 'world' })
  return result
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) throw new Error('blueprint is null')
		expect(blueprint.nodes.length).toBeGreaterThan(0)
		const greetNode = blueprint.nodes.find(
			(n) => n.uses === 'process' && n.params?.uses === 'greet',
		)
		expect(greetNode).toBeDefined()
	})

	it('should compile decorator-style flow from code string', () => {
		const code = `
@step
export async function compute(params: { value: number }) {
  return { doubled: params.value * 2 }
}

@flow
export async function computeFlow(context: any) {
  const result = await compute({ value: 21 })
  return result
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
	})

	it('should apply step decorator metadata to compiled nodes', () => {
		const code = `
@step({ label: "Custom Greeting", description: "Says hello to the user" })
export async function greet(params: { name: string }) {
  return { message: "hello " + params.name }
}

@flow
export async function myFlow(context: any) {
  const result = await greet({ name: "world" })
  return result
}
`
		const { blueprint } = compileCode(code, { id: 'customFlow' })
		expect(blueprint).not.toBeNull()
		if (!blueprint) throw new Error('blueprint is null')
		expect(blueprint.id).toBe('customFlow')
		const greetNode = blueprint.nodes.find((n) => n.uses === 'process')
		expect(greetNode).toBeDefined()
		if (!greetNode?.params) throw new Error('greetNode params not found')
		expect(greetNode.params.label).toBe('Custom Greeting')
		expect(greetNode.params.description).toBe('Says hello to the user')
	})

	it('should detect type errors in compileCode', () => {
		const code = `
/** @step */
export async function processNumber(params: { value: number }) {
  return params.value * 2
}

/** @flow */
export async function badFlow(context: any) {
  const result = await processNumber({ value: 'not a number' })
  return result
}
`
		const { diagnostics } = compileCode(code)
		const typeErrors = diagnostics.filter((d) => d.severity === 'error')
		expect(typeErrors.length).toBeGreaterThan(0)
	})

	it('should detect invalid await in compileCode', () => {
		const code = `
export async function helper() {
  return 'not a step'
}

/** @flow */
export async function badFlow(context: any) {
  await helper()
}
`
		const { diagnostics } = compileCode(code)
		const awaitError = diagnostics.find(
			(d) => d.severity === 'error' && d.message.includes('await'),
		)
		expect(awaitError).toBeDefined()
	})
})

describe('loadConfig', () => {
	it('should return empty object when no config file exists', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-test-'))
		try {
			const config = await loadConfig(tmpDir)
			expect(config).toEqual({})
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})

	it('should load a JS config file', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-test-'))
		try {
			const configContent = `
export default {
  entryPoints: ['./src/workflows/index.ts'],
  manifestPath: './dist/flowcraft.manifest.js',
  tsConfigPath: './tsconfig.workflows.json',
}
`
			fs.writeFileSync(path.join(tmpDir, 'flowcraft.config.js'), configContent)
			const config = await loadConfig(tmpDir)
			expect(config.entryPoints).toEqual(['./src/workflows/index.ts'])
			expect(config.manifestPath).toBe('./dist/flowcraft.manifest.js')
			expect(config.tsConfigPath).toBe('./tsconfig.workflows.json')
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})

	it('should load a TS config file', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-test-'))
		try {
			const configContent = `
import type { FlowcraftConfig } from '@flowcraft/compiler/types'

const config: FlowcraftConfig = {
  entryPoints: ['./src/flows/index.ts'],
  manifestPath: './out/manifest.js',
  tsConfigPath: './tsconfig.json',
}

export default config
`
			fs.writeFileSync(path.join(tmpDir, 'flowcraft.config.ts'), configContent)
			const config = await loadConfig(tmpDir)
			expect(config.entryPoints).toEqual(['./src/flows/index.ts'])
			expect(config.manifestPath).toBe('./out/manifest.js')
			expect(config.tsConfigPath).toBe('./tsconfig.json')
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})
})

describe('buildFlows', () => {
	it('should write manifest when valid entry points are provided', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-test-'))
		const originalCwd = process.cwd()
		try {
			const srcDir = path.join(tmpDir, 'src')
			fs.mkdirSync(srcDir, { recursive: true })
			const distDir = path.join(tmpDir, 'dist')
			fs.mkdirSync(distDir, { recursive: true })

			fs.writeFileSync(
				path.join(srcDir, 'workflow.ts'),
				`
/** @step */
export async function myStep(params: { input: string }) {
  return { output: params.input }
}

/** @flow */
export async function myFlow(context: any) {
  const result = await myStep({ input: 'test' })
  return result
}
`,
			)

			fs.writeFileSync(
				path.join(tmpDir, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'bundler',
						strict: true,
						lib: ['ESNext'],
					},
					include: ['src'],
				}),
			)

			process.chdir(tmpDir)
			await buildFlows({
				entryPoints: [path.join(srcDir, 'workflow.ts')],
				tsConfigPath: path.join(tmpDir, 'tsconfig.json'),
				manifestPath: path.join(distDir, 'flowcraft.manifest.js'),
			})

			const manifestPath = path.join(distDir, 'flowcraft.manifest.js')
			expect(fs.existsSync(manifestPath)).toBe(true)
			const content = fs.readFileSync(manifestPath, 'utf-8')
			expect(content).toContain('export const registry')
			expect(content).toContain('export const blueprints')
			expect(content).toContain('myStep')
		} finally {
			process.chdir(originalCwd)
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})
})
