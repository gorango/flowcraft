import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import {
	createCircuitBreakerWorkflow,
	createExponentialBackoffRetryWorkflow,
	createFixedDelayRetryWorkflow,
} from './workflow.js'

class FixedDelayRetryMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const maxRetries = 3
		const delay = 200 // Fixed 200ms delay
		let attempts = 0

		while (attempts < maxRetries) {
			try {
				console.log(`[FIXED-RETRY] Attempting ${nodeId} (attempt ${attempts + 1}/${maxRetries})`)
				const result = await next()
				console.log(`[FIXED-RETRY] ${nodeId} succeeded on attempt ${attempts + 1}`)
				return result
			} catch (error: any) {
				attempts++
				if (attempts < maxRetries) {
					console.log(`[FIXED-RETRY] ${nodeId} failed: ${error.message} - retrying in ${delay}ms...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				} else {
					console.log(`[FIXED-RETRY] ${nodeId} failed permanently after ${maxRetries} attempts`)
					throw error
				}
			}
		}
		throw new Error('Unexpected retry loop exit')
	}
}

class ExponentialBackoffRetryMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const maxRetries = 3
		const baseDelay = 100 // Base delay 100ms
		let attempts = 0

		while (attempts < maxRetries) {
			try {
				console.log(`[EXPO-RETRY] Attempting ${nodeId} (attempt ${attempts + 1}/${maxRetries})`)
				const result = await next()
				console.log(`[EXPO-RETRY] ${nodeId} succeeded on attempt ${attempts + 1}`)
				return result
			} catch (error: any) {
				attempts++
				if (attempts < maxRetries) {
					const delay = baseDelay * 2 ** (attempts - 1) // Exponential backoff
					console.log(`[EXPO-RETRY] ${nodeId} failed: ${error.message} - retrying in ${delay}ms...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				} else {
					console.log(`[EXPO-RETRY] ${nodeId} failed permanently after ${maxRetries} attempts`)
					throw error
				}
			}
		}
		throw new Error('Unexpected retry loop exit')
	}
}

class CircuitBreakerMiddleware implements Middleware {
	private failureCount = 0
	private lastFailureTime = 0
	private readonly failureThreshold = 2
	private readonly timeout = 2000 // 2 seconds

	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const now = Date.now()

		// Check if circuit breaker is open
		if (this.failureCount >= this.failureThreshold && now - this.lastFailureTime < this.timeout) {
			console.log(`[CIRCUIT] Circuit breaker OPEN for ${nodeId} - failing fast`)
			throw new Error('Circuit breaker is open')
		}

		try {
			console.log(`[CIRCUIT] Executing ${nodeId} (failures: ${this.failureCount})`)
			const result = await next()
			// Success - reset failure count
			this.failureCount = 0
			console.log(`[CIRCUIT] ${nodeId} succeeded - circuit breaker reset`)
			return result
		} catch (error: any) {
			this.failureCount++
			this.lastFailureTime = now
			console.log(`[CIRCUIT] ${nodeId} failed (${this.failureCount}/${this.failureThreshold}): ${error.message}`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Retry Patterns Example\n')

	// ============================================================================
	// FIXED DELAY RETRY PATTERN
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔄 FIXED DELAY RETRY PATTERN')
	console.log('='.repeat(60))

	const fixedDelayRuntime = new FlowRuntime({
		middleware: [new FixedDelayRetryMiddleware()],
	})

	for (let i = 1; i <= 3; i++) {
		console.log(`\n--- Fixed Delay Run ${i} ---`)
		try {
			const workflow = createFixedDelayRetryWorkflow()
			const _result = await fixedDelayRuntime.run(
				workflow.toBlueprint(),
				{},
				{ functionRegistry: workflow.getFunctionRegistry() },
			)
			console.log(`✅ Fixed delay run ${i} completed successfully`)
		} catch (error) {
			console.log(`❌ Fixed delay run ${i} failed: ${(error as Error).message}`)
		}
	}

	// ============================================================================
	// EXPONENTIAL BACKOFF RETRY PATTERN
	// ============================================================================
	console.log(`\n${'='.repeat(60)}`)
	console.log('📈 EXPONENTIAL BACKOFF RETRY PATTERN')
	console.log('='.repeat(60))

	const expoRuntime = new FlowRuntime({
		middleware: [new ExponentialBackoffRetryMiddleware()],
	})

	for (let i = 1; i <= 3; i++) {
		console.log(`\n--- Exponential Backoff Run ${i} ---`)
		try {
			const workflow = createExponentialBackoffRetryWorkflow()
			const _result = await expoRuntime.run(
				workflow.toBlueprint(),
				{},
				{ functionRegistry: workflow.getFunctionRegistry() },
			)
			console.log(`✅ Exponential backoff run ${i} completed successfully`)
		} catch (error) {
			console.log(`❌ Exponential backoff run ${i} failed: ${(error as Error).message}`)
		}
	}

	// ============================================================================
	// CIRCUIT BREAKER PATTERN
	// ============================================================================
	console.log(`\n${'='.repeat(60)}`)
	console.log('🔌 CIRCUIT BREAKER PATTERN')
	console.log('='.repeat(60))

	const circuitRuntime = new FlowRuntime({
		middleware: [new CircuitBreakerMiddleware()],
	})

	for (let i = 1; i <= 5; i++) {
		console.log(`\n--- Circuit Breaker Run ${i} ---`)
		try {
			const workflow = createCircuitBreakerWorkflow()
			const _result = await circuitRuntime.run(
				workflow.toBlueprint(),
				{},
				{ functionRegistry: workflow.getFunctionRegistry() },
			)
			console.log(`✅ Circuit breaker run ${i} completed successfully`)
		} catch (error) {
			console.log(`❌ Circuit breaker run ${i} failed: ${(error as Error).message}`)
		}
	}

	console.log('\n🎉 Retry patterns example completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})
