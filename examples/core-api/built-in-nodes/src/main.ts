import { FlowRuntime, UnsafeEvaluator } from 'flowcraft'
import {
	createBatchProcessingWorkflow,
	createEnrichmentSubflow,
	createLoopProcessingWorkflow,
	createSubflowWorkflow,
	createValidationSubflow,
	createWaitWorkflow,
} from './workflow.js'

async function main() {
	console.log('🚀 Flowcraft Built-in Nodes Examples\n')

	// Create subflow blueprints first
	const validationFlow = createValidationSubflow()
	const validationBlueprint = validationFlow.toBlueprint()
	const validationRegistry = validationFlow.getFunctionRegistry()
	const enrichmentFlow = createEnrichmentSubflow()
	const enrichmentBlueprint = enrichmentFlow.toBlueprint()
	const enrichmentRegistry = enrichmentFlow.getFunctionRegistry()

	const runtime = new FlowRuntime({
		evaluator: new UnsafeEvaluator(),
		blueprints: {
			[validationBlueprint.id]: validationBlueprint,
			[enrichmentBlueprint.id]: enrichmentBlueprint,
		},
	})

	// Start scheduler for timer-based nodes
	runtime.startScheduler()

	// ============================================================================
	// BATCH PROCESSING EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('📦 BATCH PROCESSING EXAMPLE')
	console.log('='.repeat(60))

	try {
		const batchWorkflow = createBatchProcessingWorkflow()
		const batchResult = await runtime.run(
			batchWorkflow.toBlueprint(),
			{},
			{
				functionRegistry: batchWorkflow.getFunctionRegistry(),
			},
		)

		console.log('\n📊 Batch Processing Results:')
		const batchStats = batchResult.context.batchStats
		const processedItems = batchResult.context.processedItems

		console.log(`   Total items processed: ${batchStats.totalItems}`)
		console.log(`   High-value items: ${batchStats.highValueItems}`)
		console.log(`   Total value: ${batchStats.totalValue}`)
		console.log(`   Premium quality items: ${batchStats.premiumItems}`)
		console.log(`   Sample processed items:`)
		processedItems.slice(0, 3).forEach((item: any, index: number) => {
			console.log(`     ${index + 1}. ${item.name} (${item.status}) - ${item.metadata.quality}`)
		})

		console.log('✅ Batch processing completed successfully\n')
	} catch (error) {
		console.error('❌ Batch processing failed:', error)
	}

	// ============================================================================
	// LOOP PROCESSING EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔄 LOOP PROCESSING EXAMPLE')
	console.log('='.repeat(60))

	try {
		const loopWorkflow = createLoopProcessingWorkflow()
		const loopResult = await runtime.run(
			loopWorkflow.toBlueprint(),
			{},
			{
				functionRegistry: loopWorkflow.getFunctionRegistry(),
			},
		)

		console.log('\n📈 Loop Processing Results:')
		const loopSummary = loopResult.context.loopSummary

		console.log(`   Total iterations: ${loopSummary.totalIterations}`)
		console.log(`   All iterations completed successfully`)
		console.log(`   Sample results:`)
		loopSummary.allResults.slice(0, 3).forEach((result: string, index: number) => {
			console.log(`     ${index + 1}. ${result}`)
		})

		console.log('✅ Loop processing completed successfully\n')
	} catch (error) {
		console.error('❌ Loop processing failed:', error)
	}

	// ============================================================================
	// WAIT/SLEEP EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('⏳ WAIT/SLEEP EXAMPLE')
	console.log('='.repeat(60))

	try {
		const waitWorkflow = createWaitWorkflow()
		const waitResult = await runtime.run(
			waitWorkflow.toBlueprint(),
			{},
			{
				functionRegistry: waitWorkflow.getFunctionRegistry(),
			},
		)

		console.log(`   Status: ${waitResult.status}`)
		console.log('\n⏰ Wait Processing Results:')
		console.log('Context keys:', Object.keys(waitResult.context))
		const waitResults = waitResult.context.waitResults

		if (waitResults) {
			console.log(`   Wait started: ${waitResults.startTime}`)
			console.log(`   Wait ended: ${waitResults.endTime}`)
			console.log(`   Duration: ${waitResults.durationMs}ms`)
		} else {
			console.log('   Wait results not found in context')
			console.log('   _outputs.processAfterWait:', waitResult.context._outputs?.processAfterWait)
		}

		console.log('✅ Wait processing completed successfully\n')
	} catch (error) {
		console.error('❌ Wait processing failed:', error)
	}

	// ============================================================================
	// SUBFLOW EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔗 SUBFLOW EXAMPLE')
	console.log('='.repeat(60))

	try {
		const { blueprint: subflowBlueprint, functionRegistry: subflowRegistry } = createSubflowWorkflow()

		const combinedRegistry = new Map([...subflowRegistry, ...validationRegistry, ...enrichmentRegistry])

		const subflowResult = await runtime.run(
			subflowBlueprint,
			{
				inputData: {
					name: 'John Doe',
					email: 'john.doe@example.com',
					age: 30,
				},
			},
			{
				functionRegistry: combinedRegistry,
			},
		)

		console.log(`   Status: ${subflowResult.status}`)
		if (subflowResult.errors && subflowResult.errors.length > 0) {
			console.log('   Errors:', JSON.stringify(subflowResult.errors, null, 2))
		}
		console.log('\n🎯 Subflow Processing Results:')
		console.log('Context keys:', Object.keys(subflowResult.context))
		const finalResult = subflowResult.context.finalResult

		if (finalResult) {
			console.log(`   Original data: ${finalResult.originalData.name} (${finalResult.originalData.email})`)
			console.log(`   Validation score: ${finalResult.validation.score}/3`)
			console.log(`   Age group: ${finalResult.enriched.insights.ageGroup}`)
			console.log(`   Email domain: ${finalResult.enriched.insights.emailDomain}`)
			console.log(`   Processing completed: ${finalResult.completedAt}`)
		} else {
			console.log('   Final result not found in context')
			console.log('   _outputs.processResults:', subflowResult.context._outputs?.processResults)
		}

		console.log('✅ Subflow processing completed successfully\n')
	} catch (error) {
		console.error('❌ Subflow processing failed:', error)
	}

	console.log('🎉 All built-in nodes examples completed!')
}

// Handle errors and run the main function
main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})
