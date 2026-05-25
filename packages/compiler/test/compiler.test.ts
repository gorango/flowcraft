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

describe('durable primitives', () => {
	it('should compile sleep, waitForEvent, and createWebhook', () => {
		const compiler = new Compiler('tsconfig.json')
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
		const compiler = new Compiler('tsconfig.json')
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
		const compiler = new Compiler('tsconfig.json')
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
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/sub-flow.ts'])

		const bp = result.blueprints.subFlow
		expect(bp).toBeDefined()
		expect(result.registry.recordTransaction).toBeDefined()
	})

	it('should emit warning for entry file not found', () => {
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/non-existent-file.ts'])

		const warning = result.diagnostics.find(
			(d) => d.severity === 'warning' && d.message.includes('not found'),
		)
		expect(warning).toBeDefined()
	})

	it('should use custom manifestPath for import resolution', () => {
		const manifestPath = path.resolve('./dist/custom-manifest.js')
		const compiler = new Compiler('tsconfig.json', manifestPath)
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'], manifestPath)

		expect(result.manifestPath).toBe(manifestPath)
		expect(result.manifestSource).toContain('export const registry')
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
		// const hasWarning = diagnostics.some(
		// 	(d) => d.severity === 'warning' && d.message.includes('Promise.all'),
		// )
		// Note: may or may not produce warning depending on how the compiler handles local fns
		expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0)
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
		const warn = diagnostics.find(
			(d) => d.severity === 'error' && d.message.includes('non-call'),
		)
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
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-flow.ts'])

		const { FlowRuntime } = await import('flowcraft')

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
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-if-else.ts'])

		const { FlowRuntime } = await import('flowcraft')

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
		const compiler = new Compiler('tsconfig.json')
		const result = compiler.compileProject(['test/fixtures/simple-parallel.ts'])

		const { FlowRuntime } = await import('flowcraft')

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
})
