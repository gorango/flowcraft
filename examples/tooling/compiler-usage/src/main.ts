import * as path from 'node:path'
import { compileProject } from '@flowcraft/compiler'
import { FlowRuntime } from 'flowcraft'

async function main() {
	console.log('🚀 Flowcraft Compiler Usage Example\n')
	console.log('Starting...')

	try {
		const projectRoot = path.resolve('.')
		const flowFiles = [
			path.join(projectRoot, 'src/flows/steps.ts'),
			path.join(projectRoot, 'src/flows/parallel-flow.ts'),
			path.join(projectRoot, 'src/flows/sleep-flow.ts'),
			path.join(projectRoot, 'src/flows/wait-flow.ts'),
			path.join(projectRoot, 'src/flows/subflow-example.ts'),
		]
		const tsConfigPath = path.join(projectRoot, 'tsconfig.json')

		console.log('🔨 Compiling workflows...')
		const { blueprints, registry } = compileProject(flowFiles, tsConfigPath)
		console.log('✅ Compilation successful!')
		console.log(`   📊 Found ${Object.keys(blueprints).length} blueprint(s)`)
		console.log(`   🔧 Functions: ${Object.keys(registry).length}`)

		console.log('▶️  Running the compiled workflows...')

		const functionRegistry: Record<string, any> = {}
		for (const [uses, { importPath, exportName }] of Object.entries(registry)) {
			const mod = await import(importPath)
			functionRegistry[uses] = mod[exportName]
		}
		functionRegistry.start = async (context: any) => {
			return { output: context.input }
		}

		const runtime = new FlowRuntime({
			blueprints,
			registry: functionRegistry,
		})

		const workflowsToRun = [
			{ name: 'Parallel Flow', blueprint: blueprints.parallelFlow, input: { userId: 123 } },
			{ name: 'Sleep Flow', blueprint: blueprints.sleepFlow, input: {} },
			{
				name: 'Subflow Example',
				blueprint: blueprints.subflowExample,
				input: { userId: 456 },
			},
			{ name: 'Wait Flow', blueprint: blueprints.waitFlow, input: {} },
		]

		for (const { name, blueprint, input } of workflowsToRun) {
			console.log(`\n--- Running ${name} ---`)
			try {
				const startTime = Date.now()
				const result = await runtime.run(blueprint, input)
				const duration = Date.now() - startTime
				console.log(`${name} completed with status: ${result.status} (${duration}ms)`)
				if (result.status === 'completed') {
					console.log('Final context:', JSON.stringify(result.context, null, 2))
				} else if (result.status === 'failed' && result.errors) {
					console.log('Error details:', result.errors.map((e) => e.message).join(', '))
				}
			} catch (error) {
				console.log(`${name} failed:`, (error as Error).message)
			}
		}

		console.log('\n✅ All workflow executions completed!')
		console.log('Example completed')
	} catch (error) {
		console.error('❌ Error:', (error as Error).message)
	}
}

main()
