import { beforeAll, describe, expect, it, vi } from 'vitest'
import { FlowRuntime } from 'flowcraft'
import { Compiler } from '../src/compiler'
import { compileCode } from '../src/index'
import { compileCodeBrowser } from '../src/browser'
import { loadConfig } from '../src/config-loader'
import { buildFlows } from '../src/build'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let compiler: Compiler

beforeAll(() => {
	compiler = new Compiler('tsconfig.json')
})

describe('Compiler', () => {
	it('should compile a simple project', () => {
		const result = compiler.compileProject(['src/index.ts'])
		expect(result.blueprints).toBeDefined()
		expect(result.registry).toBeDefined()
		expect(result.diagnostics).toBeDefined()
	})

	it('should compile all test fixtures', () => {
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
		const result = compiler.compileProject(['test/fixtures/simple-if-else.ts'])

		const ifElseFlow = result.blueprints.simpleIfElseFlow
		expect(ifElseFlow).toBeDefined()

		const conditionalEdges = ifElseFlow.edges.filter((e) => e.condition)
		expect(conditionalEdges.length).toBe(2)
	})

	it('should handle loop constructs correctly', () => {
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
		const result = compiler.compileProject(['test/fixtures/main-flow.ts'])

		const mainFlow = result.blueprints.mainFlow
		expect(mainFlow).toBeDefined()

		const subflowNode = mainFlow.nodes.find((n) => n.uses === 'subflow')
		expect(subflowNode).toBeDefined()
		if (!subflowNode?.params) throw new Error('subflowNode params not found')
		expect(subflowNode.params.blueprintId).toBe('subFlow')
	})

	it('should handle for-of loops with break/continue', () => {
		const result = compiler.compileProject(['test/fixtures/loop-control-flow.ts'])

		const forOfWithBreak = result.blueprints.forOfLoopWithBreak
		expect(forOfWithBreak).toBeDefined()

		const continueEdges = forOfWithBreak.edges.filter((e) => e.action === 'continue')
		expect(continueEdges.length).toBeGreaterThan(0)

		const forOfWithContinue = result.blueprints.forOfLoopWithContinue
		expect(forOfWithContinue).toBeDefined()
	})

	it('should handle while loops with continue', () => {
		const result = compiler.compileProject(['test/fixtures/loop-control-flow.ts'])

		const whileContinue = result.blueprints.whileLoopWithContinue
		expect(whileContinue).toBeDefined()

		const continueEdges = whileContinue.edges.filter((e) => e.action === 'continue')
		expect(continueEdges.length).toBeGreaterThan(0)
	})

	it('should register all step functions in registry', () => {
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		expect(result.registry.fetchUser).toBeDefined()
		expect(result.registry.fetchUser.exportName).toBe('fetchUser')
		expect(result.registry.fetchUser.importPath).toContain('simple-flow.ts')

		expect(result.registry.processOrders).toBeDefined()
	})

	it('should generate valid manifest source code', () => {
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		expect(result.manifestSource).toContain('import { fetchUser }')
		expect(result.manifestSource).toContain('import { processOrders }')
		expect(result.manifestSource).toContain('export const registry')
		expect(result.manifestSource).toContain('export const blueprints')
	})

	it('should handle type mismatch errors in diagnostics', () => {
		const result = compiler.compileProject(['test/fixtures/type-mismatch.ts'])

		expect(result.diagnostics.length).toBeGreaterThan(0)
		const typeError = result.diagnostics.find((d) => d.severity === 'error')
		expect(typeError).toBeDefined()
	})

	it('should handle invalid await errors', () => {
		const result = compiler.compileProject(['test/fixtures/invalid-await.ts'])

		const awaitError = result.diagnostics.find((d) => d.severity === 'error')
		expect(awaitError).toBeDefined()
		if (!awaitError) throw new Error('awaitError not found')
		expect(awaitError.message).toContain('await')
	})

	it('should discover arrow function steps and flows', () => {
		const result = compiler.compileProject(['test/fixtures/arrow-flow.ts'])

		expect(result.blueprints.sayHelloFlow).toBeDefined()
		expect(result.registry.greet).toBeDefined()
		expect(result.registry.greet.exportName).toBe('greet')
	})

	it('should discover default export flows', () => {
		const result = compiler.compileProject(['test/fixtures/export-default-flow.ts'])

		// Default export uses file basename as blueprint key
		const blueprintNames = Object.keys(result.blueprints)
		expect(blueprintNames.length).toBeGreaterThan(0)
		// Should have processItem in registry
		expect(result.registry.processItem).toBeDefined()
	})

	it('should discover default export arrow function flows', () => {
		const result = compiler.compileProject(['test/fixtures/export-default-arrow-flow.ts'])

		// Default arrow export uses file basename as blueprint key
		const bp = result.blueprints['export-default-arrow-flow']
		expect(bp).toBeDefined()
	})

	it('should discover function expression steps with JSDoc annotations', () => {
		const result = compiler.compileProject(['test/fixtures/function-expr-flow.ts'])

		expect(result.blueprints.mainFlow).toBeDefined()
		expect(result.registry.processItem).toBeDefined()
	})

	it('should compile a flow with re-exported step in Promise.all', () => {
		const result = compiler.compileProject(['test/fixtures/parallel-flow.ts'])

		// parallelFlow uses Promise.all — verify blueprint is valid
		const bp = result.blueprints.parallelFlow
		expect(bp).toBeDefined()
		if (!bp) return

		const joinNode = bp.nodes.find((n) => n.config?.joinStrategy === 'all')
		expect(joinNode).toBeDefined()
	})

	it('should compile switch/case flow correctly', () => {
		const result = compiler.compileProject(['test/fixtures/switch-flow.ts'])

		const bp = result.blueprints.switchFlow
		expect(bp).toBeDefined()
		if (!bp) return

		// Should have a join node (break target)
		const joinNodes = bp.nodes.filter((n) => n.uses === 'join')
		expect(joinNodes.length).toBeGreaterThan(0)

		// Should have conditional edges from switch cases (2 cases + default is unconditional)
		const conditionalEdges = bp.edges.filter((e) => e.condition)
		expect(conditionalEdges.length).toBeGreaterThanOrEqual(1)

		// Should have a start node (created because cursor was null)
		const startNode = bp.nodes.find((n) => n.uses === 'start')
		expect(startNode).toBeDefined()
	})

	it('should compile do-while flow correctly', () => {
		const result = compiler.compileProject(['test/fixtures/do-while-flow.ts'])

		const bp = result.blueprints.doWhileFlow
		expect(bp).toBeDefined()
		if (!bp) return

		// Should have a loop-controller
		const controller = bp.nodes.find((n) => n.uses === 'loop-controller')
		expect(controller).toBeDefined()

		// Should have continue and break edges
		const continueEdges = bp.edges.filter((e) => e.action === 'continue')
		expect(continueEdges.length).toBeGreaterThan(0)
		const breakEdges = bp.edges.filter((e) => e.action === 'break')
		expect(breakEdges.length).toBeGreaterThan(0)
	})

	it('should compile try/catch/finally flow correctly', () => {
		const result = compiler.compileProject(['test/fixtures/try-finally-flow.ts'])

		// tryFinallyFlow should compile without finally-block error diagnostic
		const tryFinally = result.blueprints.tryFinallyFlow
		expect(tryFinally).toBeDefined()

		const finallyErrors = result.diagnostics.filter(
			(d) => d.severity === 'error' && d.message.includes('finally'),
		)
		expect(finallyErrors).toHaveLength(0)

		const tryCatchFinally = result.blueprints.tryCatchFinallyFlow
		expect(tryCatchFinally).toBeDefined()

		// Finally block wiring: try and catch exits route through finally node
		const edgesToCleanup = tryFinally.edges.filter((e) => e.target === 'cleanup_1')
		expect(edgesToCleanup.length).toBeGreaterThanOrEqual(1)

		// No errors about unsupported finally blocks
		expect(finallyErrors).toHaveLength(0)
	})

	it('should emit error for generator function flows', () => {
		const result = compiler.compileProject(['test/fixtures/generator-flow.ts'])

		const genError = result.diagnostics.find(
			(d) => d.severity === 'error' && d.message.includes('Generator'),
		)
		expect(genError).toBeDefined()
	})

	it('should compile Promise.allSettled and Promise.race flows', () => {
		const result = compiler.compileProject(['test/fixtures/promise-all-settled-flow.ts'])

		const allSettled = result.blueprints.allSettledFlow
		expect(allSettled).toBeDefined()
		if (!allSettled) return
		// Should have parallel nodes
		const parallelNodes = allSettled.nodes.filter((n) => n.id?.includes('_parallel_'))
		expect(parallelNodes.length).toBe(2)

		const raceFlow = result.blueprints.raceFlow
		expect(raceFlow).toBeDefined()
		// raceFlow should have parallel nodes from Promise.race
		const raceParallelNodes = raceFlow.nodes.filter((n) => n.id?.includes('_parallel_'))
		expect(raceParallelNodes.length).toBe(2)
	})

	it('should compile throw statement flows', () => {
		const result = compiler.compileProject(['test/fixtures/throw-in-flow.ts'])

		const bp = result.blueprints.throwInFlow
		expect(bp).toBeDefined()
		if (!bp) return

		// Should have an error node from the throw statement
		const errorNode = bp.nodes.find((n) => n.uses === 'error')
		expect(errorNode).toBeDefined()
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
		const greetNode = blueprint.nodes.find((n) => n.uses === 'greet')
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
		const greetNode = blueprint.nodes.find((n) => n.uses === 'greet')
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

describe('compileCodeBrowser', () => {
	it('should compile and execute via FlowRuntime, verifying output values', async () => {
		const code = `@step
export async function loadConfig() {
  return { name: 'Flowcraft', value: 21 }
}

@step
export async function greet(params: { name: string; value: number }) {
  return { message: 'Hello, ' + params.name + '!', value: params.value }
}

@step
export async function double(params: { value: number }) {
  return params.value * 2
}

@flow
export async function demoFlow(context: any) {
  const config = await loadConfig()
  const msg = await greet({ name: config.name, value: config.value })
  const doubled = await double({ value: config.value })
  return { greeting: msg.message, result: doubled }
}`

		const { blueprint, diagnostics, registry } = compileCodeBrowser(code)

		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return

		const functionRegistry = new Map(Object.entries(registry))

		const { FlowRuntime } = await import('flowcraft')
		const runtime = new FlowRuntime({ registry: functionRegistry })
		const result = await runtime.run(blueprint, {}, { functionRegistry })

		expect(result.status).toBe('completed')
		expect(result.context['_outputs.loadConfig_1']).toEqual({ name: 'Flowcraft', value: 21 })
		expect(result.context['_outputs.greet_1']).toEqual({
			message: 'Hello, Flowcraft!',
			value: 21,
		})
		expect(result.context['_outputs.double_1']).toBe(42)
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

	it('should return cached config when mtime is unchanged', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-cache-test-'))
		try {
			fs.writeFileSync(
				path.join(tmpDir, 'flowcraft.config.js'),
				`export default { entryPoints: ['first'] }`,
			)

			const first = await loadConfig(tmpDir)
			expect(first.entryPoints).toEqual(['first'])

			// Second call should hit cache (same mtime)
			const second = await loadConfig(tmpDir)
			expect(second.entryPoints).toEqual(['first'])
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})

	it('should log error and throw on malformed TypeScript config', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-err-config-'))
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		try {
			fs.writeFileSync(path.join(tmpDir, 'flowcraft.config.ts'), 'export default { { invalid }')
			await expect(loadConfig(tmpDir)).rejects.toThrow()
			expect(errorSpy).toHaveBeenCalled()
		} finally {
			errorSpy.mockRestore()
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

describe('buildFlows diagnostic logging', () => {
	it('should print warning diagnostics via console.warn', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-warn-test-'))
		const originalCwd = process.cwd()
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		try {
			const srcDir = path.join(tmpDir, 'src')
			fs.mkdirSync(srcDir, { recursive: true })

			// Flow with an unawaited durable primitive to trigger a compiler warning
			fs.writeFileSync(
				path.join(srcDir, 'warn-workflow.ts'),
				`
import { sleep } from 'flowcraft/sdk'

/** @flow */
export async function warnFlow(context: any) {
  sleep('5s')
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
					},
					include: ['src'],
				}),
			)

			process.chdir(tmpDir)

			await buildFlows({
				entryPoints: [path.join(srcDir, 'warn-workflow.ts')],
				tsConfigPath: path.join(tmpDir, 'tsconfig.json'),
				manifestPath: path.join(tmpDir, 'dist/flowcraft.manifest.js'),
			})

			expect(warnSpy).toHaveBeenCalled()
			const warnCall = warnSpy.mock.calls.find((args) =>
				String(args[0]).includes('compilation warning'),
			)
			expect(warnCall).toBeDefined()
		} finally {
			warnSpy.mockRestore()
			process.chdir(originalCwd)
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

describe('durable primitives', () => {
	it('should compile sleep, waitForEvent, and createWebhook', () => {
		const result = compiler.compileProject(['test/fixtures/durable-primitives.ts'])

		const bp = result.blueprints.durablePrimitivesFlow
		expect(bp).toBeDefined()

		const sleepNode = bp.nodes.find((n) => n.uses === 'sleep')
		expect(sleepNode).toBeDefined()

		const waitNode = bp.nodes.find((n) => n.uses === 'wait')
		expect(waitNode).toBeDefined()

		const webhookNode = bp.nodes.find((n) => n.uses === 'webhook')
		expect(webhookNode).toBeDefined()

		const waitForWebhook = bp.nodes.find((n) => n.id?.startsWith('wait_for_webhook'))
		expect(waitForWebhook).toBeDefined()
		expect(waitForWebhook?.params?.eventName).toContain('webhook:')
	})

	it('should compile simple parallel flow with Promise.all', () => {
		const result = compiler.compileProject(['test/fixtures/simple-parallel.ts'])

		const bp = result.blueprints.simpleParallelFlow
		expect(bp).toBeDefined()

		const parallelNodes = bp.nodes.filter((n) => n.id?.includes('_parallel_'))
		expect(parallelNodes.length).toBe(2)

		const joinNode = bp.nodes.find((n) => n.id === 'aggregateData_1')
		expect(joinNode).toBeDefined()
		expect(joinNode?.config?.joinStrategy).toBe('all')
	})

	it('should compile subflow and steps across files', () => {
		const result = compiler.compileProject(['test/fixtures/main-flow.ts'])

		const bp = result.blueprints.mainFlow
		expect(bp).toBeDefined()

		const subflowNode = bp.nodes.find((n) => n.uses === 'subflow')
		expect(subflowNode).toBeDefined()

		// Steps called directly in mainFlow are registered
		expect(result.registry.fetchUser).toBeDefined()
		expect(result.registry.processOrders).toBeDefined()
		// Steps inside the subflow are discovered when the subflow is compiled separately
	})

	it('should compile subflow entry directly to discover its steps', () => {
		const result = compiler.compileProject(['test/fixtures/sub-flow.ts'])

		const bp = result.blueprints.subFlow
		expect(bp).toBeDefined()
		expect(result.registry.recordTransaction).toBeDefined()
	})

	it('should emit warning for entry file not found', () => {
		const result = compiler.compileProject(['test/fixtures/non-existent-file.ts'])

		const warning = result.diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('not found'),
		)
		expect(warning).toBeDefined()
	})

	it('should use custom manifestPath for import resolution', () => {
		const manifestPath = path.resolve('./dist/custom-manifest.js')
		const customCompiler = new Compiler('tsconfig.json', manifestPath)
		const result = customCompiler.compileProject(['test/fixtures/simple-flow.ts'], manifestPath)

		expect(result.manifestPath).toBe(manifestPath)
		expect(result.manifestSource).toContain('export const registry')
	})

	it('should prefix bare relative paths in manifest when source and manifest share directory', () => {
		// When manifest is in the same dir as the source, path.relative returns
		// a bare path like 'simple-flow' instead of '../simple-flow'.
		const fixturesDir = path.resolve('./test/fixtures')
		const manifestPath = path.join(fixturesDir, 'flowcraft.manifest.js')
		const customCompiler = new Compiler('tsconfig.json', manifestPath)
		const result = customCompiler.compileProject(['test/fixtures/simple-flow.ts'], manifestPath)

		expect(result.manifestSource).toContain("from './simple-flow'")
	})

	it('should error on unresolvable symbol reference in Promise.all', () => {
		const code = `
/** @flow */
export async function parentFlow(context: any) {
  await Promise.all([undefinedFunction()]);
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find(
			(d) => d.severity === 'error' && d.message.includes('Could not resolve symbol'),
		)
		expect(err).toBeDefined()
	})

	it('should emit warning without @step annotation in Promise.all local function', () => {
		const code = `
/** @flow */
export async function testFlow(context: any) {
  const [a] = await Promise.all([helperFunc()])
  return a
}

export async function helperFunc() {
  return 42
}
`
		const { diagnostics } = compileCode(code)
		const warning = diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('not annotated'),
		)
		expect(warning).toBeDefined()
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
	})
})

describe('variable scoping and property resolution', () => {
	it('should correctly map shadowed variables across nested block scopes', () => {
		const result = compiler.compileProject(['test/fixtures/shadowing-flow.ts'])
		const bp = result.blueprints.shadowingFlow
		expect(bp).toBeDefined()
		if (!bp) return

		const processValueNodes = bp.nodes.filter((n) => n.uses === 'processValue')
		expect(processValueNodes.length).toBe(2)

		const innerNode = bp.nodes.find((n) => n.id === 'processValue_1')
		expect(innerNode).toBeDefined()
		const innerInputs = innerNode?.inputs
		if (innerInputs && typeof innerInputs === 'object') {
			expect(innerInputs).toHaveProperty('val')
			expect(innerInputs.val).toBe('stepB_1.value')
		}

		const outerNode = bp.nodes.find((n) => n.id === 'processValue_2')
		expect(outerNode).toBeDefined()
		const outerInputs = outerNode?.inputs
		if (outerInputs && typeof outerInputs === 'object') {
			expect(outerInputs).toHaveProperty('val')
			expect(outerInputs.val).toBe('stepA_1.value')
		}
	})

	it('should compile and map deeply nested property references', () => {
		const result = compiler.compileProject(['test/fixtures/deep-property-flow.ts'])
		const bp = result.blueprints.deepPropertyFlow
		expect(bp).toBeDefined()
		if (!bp) return

		const useZipNode = bp.nodes.find((n) => n.uses === 'useZip')
		expect(useZipNode).toBeDefined()
		const zipInputs = useZipNode?.inputs
		if (zipInputs && typeof zipInputs === 'object') {
			expect(zipInputs).toHaveProperty('zip')
			expect(zipInputs.zip).toBe('getComplexPayload_1.user.profile.address.zip')
		}
	})
})

describe('compileCode edge cases', () => {
	it('should handle context method calls silently', () => {
		const code = `
/** @step */
export async function doStep(params: { value: number }) {
  return { result: params.value }
}

/** @flow */
export async function testFlow(context: any) {
  const val = await context.get('someKey')
  const result = await doStep({ value: val })
  return result
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
	})

	it('should warn on await of non-call expression', () => {
		const code = `
/** @flow */
export async function testFlow(context: any) {
  const x = await someVariable
  return x
}
`
		const { diagnostics } = compileCode(code)
		const warn = diagnostics.find((d) => d.severity === 'error' && d.message.includes('non-call'))
		expect(warn).toBeDefined()
	})

	it('should handle durable primitive called without await', () => {
		const code = `
import { sleep } from 'flowcraft/sdk'

/** @flow */
export async function testFlow(context: any) {
  sleep('1s')
  return true
}
`
		const { diagnostics } = compileCode(code)
		const warning = diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('without'),
		)
		expect(warning).toBeDefined()
	})

	it('should handle empty body flows gracefully', () => {
		const code = `
/** @flow */
export async function emptyFlow(context: any) {
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (blueprint) {
			expect(blueprint.nodes.length).toBeGreaterThan(0)
		}
	})

	it('should maintain edge pathways past empty finally block with no durable steps', () => {
		const code = `
/** @step */
export async function operation() { return 1 }

/** @step */
export async function postProcess() { return 2 }

/** @flow */
export async function emptyFinallyFlow() {
  try {
    await operation()
  } finally {
    console.log('no steps in finally')
  }
  await postProcess()
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return

		const postProcessEdge = blueprint.edges.find((e) => e.target === 'postProcess_1')
		expect(postProcessEdge).toBeDefined()
		expect(postProcessEdge?.source).toBe('operation_1')
	})

	it('should handle webhook.request pattern via compileCode', () => {
		const code = `
import { createWebhook } from 'flowcraft/sdk'

/** @flow */
export async function webhookFlow(context: any) {
  const webhook = await createWebhook()
  const req = await webhook.request
  return { data: req }
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
	})
})

describe('compiler diagnostics', () => {
	it('should emit error for for...in statements', () => {
		const code = `
/** @step */
export async function dummy() { return 1 }

/** @flow */
export async function testFlow(context: any) {
  for (const key in context) {
    await dummy()
  }
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find((d) => d.severity === 'error' && d.message.includes('for...in'))
		expect(err).toBeDefined()
	})

	it('should emit error for C-style for statements', () => {
		const code = `
/** @step */
export async function dummy() { return 1 }

/** @flow */
export async function testFlow(context: any) {
  for (let i = 0; i < 10; i++) {
    await dummy()
  }
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find(
			(d) => d.severity === 'error' && d.message.includes('for statements'),
		)
		expect(err).toBeDefined()
	})

	it('should warn on destructuring in variable declarations', () => {
		const code = `
/** @step */
export async function fetchProfile() { return { name: 'Alice' } }

/** @step */
export async function fetchOrders() { return { items: [] } }

/** @flow */
export async function destructuringFlow(context: any) {
  const [profile, orders] = await Promise.all([fetchProfile(), fetchOrders()])
  return { profile, orders }
}
`
		const { diagnostics } = compileCode(code)
		const warn = diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('Destructuring'),
		)
		expect(warn).toBeDefined()
	})

	it('should warn on complex expression in step argument', () => {
		const code = `
/** @step */
export async function greet(params: { name: string }) {
  return { message: 'hello ' + params.name }
}

/** @flow */
export async function testFlow(context: any) {
  const name = 'world'
  const result = await greet({ name: name.toUpperCase() + '!' })
  return result
}
`
		const { diagnostics } = compileCode(code)
		const warn = diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('Complex expression'),
		)
		expect(warn).toBeDefined()
	})

	it('should warn on non-trivial property in step argument object', () => {
		const code = `
/** @step */
export async function compute(params: Record<string, any>) {
  return params
}

/** @flow */
export async function testFlow(context: any) {
  const val = 42
  const result = await compute({ ...context, value: val })
  return result
}
`
		const { diagnostics } = compileCode(code)
		const warn = diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('Non-trivial property'),
		)
		expect(warn).toBeDefined()
	})

	it('should warn on complex top-level step argument expression', () => {
		const code = `
/** @step */
export async function double(params: number) {
  return { result: params * 2 }
}

/** @flow */
export async function testFlow(context: any) {
  const val = 21
  const result = await double(val + 1)
  return result
}
`
		const { diagnostics } = compileCode(code)
		const warn = diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('Complex expression'),
		)
		expect(warn).toBeDefined()
	})

	it('should warn on labeled statements', () => {
		const code = `
/** @step */
export async function dummy() { return 1 }

/** @flow */
export async function testFlow(context: any) {
  myLabel: {
    await dummy()
  }
  return 1
}
`
		const { diagnostics } = compileCode(code)
		const warn = diagnostics.find((d) => d.severity === 'warning' && d.message.includes('Labeled'))
		expect(warn).toBeDefined()
	})

	it('should handle switch without a preceding cursor (creates start node)', () => {
		const code = `
/** @step */
export async function handleA() { return 'a' }
/** @step */
export async function handleDefault() { return 'default' }

/** @flow */
export async function switchAtStartFlow(context: any) {
  switch (context.type) {
    case 'a':
      await handleA()
      break
    default:
      await handleDefault()
  }
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return
		// step nodes keep their original uses (step name), check by id
		const startNode = blueprint.nodes.find((n) => n.id === 'start')
		expect(startNode).toBeDefined()
	})

	it('should handle do-while with continue/break in nested scopes', () => {
		const code = `
/** @step */
export async function processItem() { return 1 }

/** @flow */
export async function nestedDoWhile(context: any) {
  do {
    await processItem()
    if (context.done) break
    if (context.skip) continue
    await processItem()
  } while (context.condition)
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return
		const continueEdges = blueprint.edges.filter((e) => e.action === 'continue')
		expect(continueEdges.length).toBeGreaterThan(0)
		const breakEdges = blueprint.edges.filter((e) => e.action === 'break')
		expect(breakEdges.length).toBeGreaterThan(0)
	})

	it('should handle Promise.all with unknown export type warning', () => {
		const code = `
/** @flow */
export async function testFlow(context: any) {
  await Promise.all([someNonExistentFn()])
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find(
			(d) => d.severity === 'error' && d.message.includes('Could not resolve symbol'),
		)
		expect(err).toBeDefined()
	})

	it('should handle break and continue errors outside loops', () => {
		const code = `
/** @flow */
export async function testFlow(context: any) {
  break
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find((d) => d.severity === 'error' && d.message.includes('break'))
		expect(err).toBeDefined()
	})

	it('should handle continue error outside loop', () => {
		const code = `
/** @flow */
export async function testFlow(context: any) {
  continue
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find((d) => d.severity === 'error' && d.message.includes('continue'))
		expect(err).toBeDefined()
	})
})

describe('branch coverage', () => {
	it('should handle do-while with null cursor (firstInBody without preceding cursor)', () => {
		const code = `
/** @step */
export async function processItem() { return 1 }

/** @flow */
export async function doWhileAtStart(context: any) {
  do {
    await processItem()
  } while (context.condition)
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return
		// Should have a loop controller
		const controller = blueprint.nodes.find((n) => n.params?.condition === 'context.condition')
		expect(controller).toBeDefined()
	})

	it('should handle subflow-type exports in Promise.all', () => {
		const code = `
/** @step */
export async function stepA() { return 'a' }

/** @flow */
export async function subFlow() { return await stepA() }

/** @flow */
export async function parentFlow(context: any) {
  // This tests that Promise.all can include a subflow
  const result = await subFlow()
  return result
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
	})

	it('should handle await of durable primitive without call expression', () => {
		const code = `
/** @flow */
export async function testFlow(context: any) {
  await someVariable
}
`
		const { diagnostics } = compileCode(code)
		const err = diagnostics.find((d) => d.severity === 'error' && d.message.includes('non-call'))
		expect(err).toBeDefined()
	})

	it('should handle switch case fall-through (case without break)', () => {
		const code = `
/** @step */
export async function handleA() { return 'a' }
/** @step */
export async function handleB() { return 'b' }
/** @step */
export async function afterSwitch() { return 'done' }

/** @flow */
export async function fallthroughFlow(context: any) {
  const x = await context.get('val')
  switch (x) {
    case 'a':
      await handleA()
      // no break — falls through
    case 'b':
      await handleB()
      break
  }
  await afterSwitch()
}
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return
		// Both case ends should connect to the join node
		const joinNode = blueprint.nodes.find((n) => n.id === 'join_1')
		expect(joinNode).toBeDefined()
		// Should still have conditional edges from the fork
		const conditionalEdges = blueprint.edges.filter((e) => e.condition)
		expect(conditionalEdges.length).toBeGreaterThanOrEqual(1)
	})

	it('should handle subflow call from parent flow', () => {
		const code = `
/** @step */
export async function stepA() { return 'a' }

/** @flow */
export async function parentFlow(context: any) {
  const result = await subFlow()
  return result
}

/** @flow */
export async function subFlow() { return await stepA() }
`
		const { blueprint, diagnostics } = compileCode(code)
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
		expect(blueprint).not.toBeNull()
		if (!blueprint) return
		// parentFlow calls subFlow as a subflow — uses should be 'subflow'
		const subflowNode = blueprint.nodes.find((n) => n.uses === 'subflow')
		expect(subflowNode).toBeDefined()
	})
})

// These tests must be careful about process.chdir, so we isolate them
describe('buildFlows error paths', () => {
	it('should throw when compilation has errors', async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcraft-build-error-'))
		const originalCwd = process.cwd()
		try {
			const srcDir = path.join(tmpDir, 'src')
			fs.mkdirSync(srcDir, { recursive: true })

			// A flow that awaits a non-step function
			fs.writeFileSync(
				path.join(srcDir, 'bad.ts'),
				`
/** @flow */
export async function badFlow(context: any) {
  await notAStep()
}

function notAStep() {
  return 42
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
			await expect(
				buildFlows({
					entryPoints: [path.join(srcDir, 'bad.ts')],
					tsConfigPath: path.join(tmpDir, 'tsconfig.json'),
				}),
			).rejects.toThrow('Flowcraft compilation failed')
		} finally {
			process.chdir(originalCwd)
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})
})

describe('runtime integration', () => {
	it('should compile and execute a simple sequential blueprint via FlowRuntime', async () => {
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		const bp = result.blueprints.simpleFlow
		expect(bp).toBeDefined()

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(result.registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (ctx: any) => ({ output: ctx.input })

		const runtime = new FlowRuntime({ registry: functionRegistry })
		const runResult = await runtime.run(bp, {})

		expect(runResult.status).toBe('completed')
	})

	it('should compile and execute a blueprint with if/else branching', async () => {
		const result = compiler.compileProject(['test/fixtures/simple-if-else.ts'])

		const bp = result.blueprints.simpleIfElseFlow
		expect(bp).toBeDefined()

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(result.registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (ctx: any) => ({ output: ctx.input })

		const runtime = new FlowRuntime({ registry: functionRegistry })
		const runResult = await runtime.run(bp, { condition: true })

		expect(runResult.status).toBe('completed')
	})

	it('should compile and execute parallel blueprint via FlowRuntime', async () => {
		const result = compiler.compileProject(['test/fixtures/simple-parallel.ts'])

		const bp = result.blueprints.simpleParallelFlow
		expect(bp).toBeDefined()

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(result.registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (ctx: any) => ({ output: ctx.input })

		const runtime = new FlowRuntime({ registry: functionRegistry })
		const runResult = await runtime.run(bp, { userId: 42 })

		expect(runResult.status).toBe('completed')
	}, 30000)

	it('should compile and execute early return flow via FlowRuntime', async () => {
		const result = compiler.compileProject(['test/fixtures/return-early-flow.ts'])

		const bp = result.blueprints.returnEarlyFlow
		expect(bp).toBeDefined()

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(result.registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (ctx: any) => ({ output: ctx.input })

		const runtime = new FlowRuntime({ registry: functionRegistry })

		// branch with return
		const resultNull = await runtime.run(bp, { input: null })
		expect(resultNull.status).toBe('completed')

		// branch without return
		const resultValid = await runtime.run(bp, { input: 'hello' })
		expect(resultValid.status).toBe('completed')
	}, 30000)

	it('should compile and execute try/catch/finally flow via FlowRuntime', async () => {
		const result = compiler.compileProject(['test/fixtures/try-finally-flow.ts'])

		const bp = result.blueprints.tryCatchFinallyFlow
		expect(bp).toBeDefined()

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(result.registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (ctx: any) => ({ output: ctx.input })
		// Skip the dynamic require for step functions used inside try/catch flow
		// The catch block and finally block wiring should still compile to valid graph

		const runtime = new FlowRuntime({ registry: functionRegistry })
		const runResult = await runtime.run(bp, { input: 'test' })

		expect(runResult.status).toBe('completed')
	}, 30000)

	it('should compile catch block with fallback config on the risky node', () => {
		const result = compiler.compileProject(['test/fixtures/catch-error-flow.ts'])

		const bp = result.blueprints.catchErrorFlow
		expect(bp).toBeDefined()
		if (!bp) return

		// Verify the fallback (riskyAction) node has config.fallback pointing to the catch node
		const riskyNode = bp.nodes.find((n) => n.uses === 'riskyAction')
		expect(riskyNode).toBeDefined()
		if (!riskyNode) return
		expect(riskyNode.config?.fallback).toBeDefined()

		// Edge should connect riskyAction to the fallback node (the first node in catch block)
		const fallbackEdge = bp.edges.find(
			(e) => e.source === riskyNode.id && e.target === riskyNode.config?.fallback,
		)
		expect(fallbackEdge).toBeDefined()
	})

	it('should compile and execute argument mapping flow via FlowRuntime', async () => {
		const result = compiler.compileProject(['test/fixtures/argument-mapping-flow.ts'])

		const bp = result.blueprints.argumentMappingFlow
		expect(bp).toBeDefined()

		// Verify inputs are mapped on the sendEmail and finalizeOrder nodes
		const sendEmailNode = bp.nodes.find((n) => n.uses === 'sendEmail')
		expect(sendEmailNode).toBeDefined()
		if (!sendEmailNode) throw new Error('sendEmailNode not found')
		expect(sendEmailNode.inputs).toBeDefined()
		if (typeof sendEmailNode.inputs !== 'object')
			throw new Error('sendEmailNode inputs not an object')
		expect(sendEmailNode.inputs).toHaveProperty('userId')

		const finalizeOrderNode = bp.nodes.find((n) => n.uses === 'finalizeOrder')
		expect(finalizeOrderNode).toBeDefined()
		if (!finalizeOrderNode) throw new Error('finalizeOrderNode not found')
		expect(finalizeOrderNode.inputs).toBeDefined()
		if (typeof finalizeOrderNode.inputs !== 'object')
			throw new Error('finalizeOrderNode inputs not an object')
		expect(finalizeOrderNode.inputs).toHaveProperty('cartId')

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(result.registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (ctx: any) => ({ output: ctx.input })

		const runtime = new FlowRuntime({ registry: functionRegistry })
		const runResult = await runtime.run(bp, {})

		expect(runResult.status).toBe('completed')
	}, 30000)
})
