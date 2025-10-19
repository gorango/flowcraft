import { agentNodeRegistry, blueprints, config } from '@flowcraft/example-declarative-shared-logic'
import { FlowRuntime } from 'flowcraft'

type UseCase = keyof typeof config

const ACTIVE_USE_CASE: UseCase = '3.customer-review' // Change this to test other scenarios

async function main() {
	console.log(`--- Running Use-Case (Data-First): ${ACTIVE_USE_CASE} ---\n`)

	const runtime = new FlowRuntime({
		registry: agentNodeRegistry,
		blueprints,
	})

	const entryWorkflowId = config[ACTIVE_USE_CASE].entryWorkflowId
	const mainBlueprint = blueprints[entryWorkflowId]

	if (!mainBlueprint) throw new Error(`Main workflow blueprint with ID '${entryWorkflowId}' was not found.`)

	const { initialContext } = config[ACTIVE_USE_CASE]

	const result = await runtime.run(mainBlueprint, initialContext)

	console.log('\n--- Workflow Complete ---\n')
	console.log('Final Output:\n')
	console.log(result.context.final_output)
	console.log('\n--- Final Context State ---')
	console.dir(result.context, { depth: null })
}

main().catch(console.error)
