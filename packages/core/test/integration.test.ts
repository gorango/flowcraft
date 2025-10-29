import { describe, expect, it } from 'vitest'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'
import { InMemoryEventLogger } from '../src/testing'

describe('Integration Tests - End-to-End Workflow Scenarios', () => {
	describe('E-commerce Order Processing', () => {
		it('should process a complete order workflow', async () => {
			const flow = createFlow('order-processing')

			// Order validation
			flow.node('validate-order', async ({ context }) => {
				const order = await context.get('order')
				if (!order.items || order.items.length === 0) {
					throw new Error('Order must have items')
				}
				if (order.total <= 0) {
					throw new Error('Invalid order total')
				}
				return { output: { ...order, validated: true } }
			})

			// Inventory check
			flow.node('check-inventory', async ({ context }) => {
				const order = await context.get('order')
				let allAvailable = true
				const inventoryIssues: string[] = []

				for (const item of order.items) {
					const stock = (await context.get(`inventory_${item.id}`)) || 0
					if (stock < item.quantity) {
						allAvailable = false
						inventoryIssues.push(`Insufficient stock for ${item.name}`)
					}
				}

				return {
					output: { available: allAvailable, issues: inventoryIssues },
					action: allAvailable ? 'inventory-ok' : 'inventory-issue',
				}
			})

			// Payment processing
			flow.node('process-payment', async ({ context }) => {
				const order = await context.get('order')
				// Simulate payment processing
				await new Promise((resolve) => setTimeout(resolve, 10))

				await context.set('payment_id', `pay_${Date.now()}`)
				return { output: { status: 'paid', amount: order.total } }
			})

			// Update inventory
			flow.node('update-inventory', async ({ context }) => {
				const order = await context.get('order')
				for (const item of order.items) {
					const currentStock = (await context.get(`inventory_${item.id}`)) || 0
					await context.set(`inventory_${item.id}`, currentStock - item.quantity)
				}
				return { output: 'inventory_updated' }
			})

			// Send confirmation
			flow.node('send-confirmation', async ({ context }) => {
				const order = await context.get('order')
				const paymentId = await context.get('payment_id')
				// Simulate email sending
				await new Promise((resolve) => setTimeout(resolve, 5))
				return {
					output: {
						orderId: order.id,
						paymentId,
						status: 'confirmed',
						estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
					},
				}
			})

			// Define workflow edges
			flow.edge('validate-order', 'check-inventory')
			flow.edge('check-inventory', 'process-payment', { action: 'inventory-ok' })
			flow.edge('check-inventory', 'send-confirmation', { action: 'inventory-issue' }) // Send notification of unavailability
			flow.edge('process-payment', 'update-inventory')
			flow.edge('update-inventory', 'send-confirmation')

			const runtime = new FlowRuntime({})

			const testOrder = {
				id: 'order_123',
				items: [
					{ id: 'item1', name: 'Widget A', quantity: 2, price: 10 },
					{ id: 'item2', name: 'Widget B', quantity: 1, price: 20 },
				],
				total: 40,
			}

			const initialContext = {
				order: testOrder,
				inventory_item1: 10,
				inventory_item2: 5,
			}

			const result = await runtime.run(flow.toBlueprint(), initialContext, {
				functionRegistry: flow.getFunctionRegistry(),
			})

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.send-confirmation']).toBeDefined()
			expect(result.context.payment_id).toBeDefined()
			// Inventory should be reduced
			expect(result.context.inventory_item1).toBe(8)
			expect(result.context.inventory_item2).toBe(4)
		})
	})

	describe('User Registration and Onboarding', () => {
		it('should handle complete user registration workflow', async () => {
			const flow = createFlow('user-registration')

			// Validate user data
			flow.node('validate-user-data', async ({ context }) => {
				const user = await context.get('user')
				if (!user.email || !user.email.includes('@')) {
					throw new Error('Invalid email')
				}
				if (!user.password || user.password.length < 8) {
					throw new Error('Password too short')
				}
				return { output: { ...user, validated: true } }
			})

			// Check if user exists
			flow.node('check-user-exists', async ({ input, context }) => {
				const user = input as any
				const existingUser = await context.get(`user_${user.email}`)
				return {
					output: { exists: !!existingUser },
					action: existingUser ? 'user-exists' : 'user-new',
				}
			})

			// Create user account
			flow.node('create-account', async ({ input, context }) => {
				const user = input as any
				const userId = `user_${Date.now()}`
				await context.set(`user_${user.email}`, {
					id: userId,
					email: user.email,
					created: new Date().toISOString(),
					status: 'pending_verification',
				})
				await context.set('current_user_id', userId)
				return { output: { userId, status: 'created' } }
			})

			// Send verification email
			flow.node('send-verification-email', async ({ context }) => {
				const userId = await context.get('current_user_id')
				// Simulate email sending
				await new Promise((resolve) => setTimeout(resolve, 5))
				const verificationToken = `token_${Math.random()}`
				await context.set(`verification_${userId}`, verificationToken)
				return { output: { emailSent: true, token: verificationToken } }
			})

			// Setup user preferences
			flow.node('setup-preferences', async ({ context }) => {
				const userId = await context.get('current_user_id')
				const defaultPrefs = {
					theme: 'light',
					notifications: true,
					language: 'en',
				}
				await context.set(`prefs_${userId}`, defaultPrefs)
				return { output: defaultPrefs }
			})

			// Send welcome email
			flow.node('send-welcome-email', async ({ context }) => {
				const userId = await context.get('current_user_id')
				// Simulate welcome email
				await new Promise((resolve) => setTimeout(resolve, 5))
				return { output: { welcomeSent: true, userId } }
			})

			// Handle existing user
			flow.node('handle-existing-user', async ({ input }) => {
				const user = input as any
				return { output: { error: 'User already exists', email: user.email } }
			})

			// Define workflow edges
			flow.edge('validate-user-data', 'check-user-exists')
			flow.edge('check-user-exists', 'create-account', { action: 'user-new' })
			flow.edge('check-user-exists', 'handle-existing-user', { action: 'user-exists' })
			flow.edge('create-account', 'send-verification-email')
			flow.edge('create-account', 'setup-preferences')
			flow.edge('send-verification-email', 'send-welcome-email')
			flow.edge('setup-preferences', 'send-welcome-email')

			const runtime = new FlowRuntime({})

			const testUser = {
				email: 'test@example.com',
				password: 'securepassword123',
				name: 'Test User',
			}

			const result = await runtime.run(
				flow.toBlueprint(),
				{ user: testUser },
				{
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context.current_user_id).toBeDefined()
			expect(result.context['_outputs.send-welcome-email'].welcomeSent).toBe(true)
			expect(result.context[`prefs_${result.context.current_user_id}`]).toBeDefined()
		})
	})

	describe('Data Processing Pipeline', () => {
		it('should process data through a complex ETL pipeline', async () => {
			const flow = createFlow('data-pipeline')

			// Extract data
			flow.node('extract-data', async () => {
				// Simulate data extraction
				const rawData = [
					{ id: 1, name: 'Alice', age: 25, city: 'NYC' },
					{ id: 2, name: 'Bob', age: 30, city: 'LA' },
					{ id: 3, name: 'Charlie', age: 35, city: 'NYC' },
					{ id: 4, name: 'Diana', age: null, city: 'Chicago' }, // Invalid data
				]
				return { output: rawData }
			})

			// Validate data
			flow.node('validate-data', async ({ input }) => {
				const data = input as any[]
				const validData = []
				const invalidData = []

				for (const record of data) {
					if (record.age && record.age >= 18 && record.name && record.city) {
						validData.push(record)
					} else {
						invalidData.push(record)
					}
				}

				return {
					output: { valid: validData, invalid: invalidData },
					action: invalidData.length > 0 ? 'has-invalid' : 'all-valid',
				}
			})

			// Transform data
			flow.node('transform-data', async ({ input, context }) => {
				const validData = input.valid as any[]
				const transformed = validData.map((record) => ({
					...record,
					fullName: `${record.name} (${record.age})`,
					cityCode: record.city.substring(0, 2).toUpperCase(),
					processedAt: new Date().toISOString(),
				}))

				await context.set('processed_count', transformed.length)
				return { output: transformed }
			})

			// Load to database
			flow.node('load-to-database', async ({ input, context }) => {
				const data = input as any[]
				// Simulate database insertion
				await new Promise((resolve) => setTimeout(resolve, 10))

				const insertedIds = data.map((_, index) => `db_id_${index + 1}`)
				await context.set('inserted_ids', insertedIds)
				return { output: { inserted: insertedIds.length, success: true } }
			})

			// Generate report
			flow.node('generate-report', async ({ context }) => {
				const processedCount = (await context.get('processed_count')) || 0
				const insertedIds = (await context.get('inserted_ids')) || []

				return {
					output: {
						totalProcessed: processedCount,
						totalInserted: insertedIds.length,
						successRate: insertedIds.length / processedCount,
						reportGenerated: true,
					},
				}
			})

			// Handle invalid data
			flow.node('handle-invalid-data', async ({ input, context }) => {
				const invalidData = input.invalid as any[]
				await context.set('invalid_records', invalidData)
				// Log invalid records for manual review
				return { output: { logged: invalidData.length, needsReview: true } }
			})

			// Define workflow edges
			flow.edge('extract-data', 'validate-data')
			flow.edge('validate-data', 'transform-data', { action: 'all-valid' })
			flow.edge('validate-data', 'transform-data', { action: 'has-invalid' })
			flow.edge('validate-data', 'handle-invalid-data', { action: 'has-invalid' })
			flow.edge('transform-data', 'load-to-database')
			flow.edge('load-to-database', 'generate-report')
			flow.edge('handle-invalid-data', 'generate-report')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context.processed_count).toBe(3) // 3 valid records
			expect(result.context.invalid_records).toHaveLength(1) // 1 invalid record
			expect(result.context['_outputs.generate-report'].totalProcessed).toBe(3)
			expect(result.context['_outputs.generate-report'].successRate).toBe(1)
		})
	})

	describe('Error Recovery and Compensation', () => {
		it('should handle failures and execute compensation logic', async () => {
			const flow = createFlow('compensation-test')

			let _bookingsCreated = 0
			let bookingsCancelled = 0

			// Book flight
			flow.node('book-flight', async ({ context }) => {
				_bookingsCreated++
				await context.set('flight_booked', true)
				await context.set('flight_id', 'flight_123')
				return { output: { bookingId: 'flight_123', status: 'booked' } }
			})

			// Book hotel
			flow.node('book-hotel', async ({ context }) => {
				_bookingsCreated++
				await context.set('hotel_booked', true)
				await context.set('hotel_id', 'hotel_456')
				return { output: { bookingId: 'hotel_456', status: 'booked' } }
			})

			// Book car
			flow.node('book-car', async () => {
				// This will fail
				return { action: 'failed' }
			})

			// Process payment
			flow.node('process-payment', async ({ context }) => {
				await context.set('payment_processed', true)
				return { output: { paymentId: 'pay_789', amount: 1500 } }
			})

			// Cancel bookings (compensation)
			flow.node('cancel-bookings', async ({ context }) => {
				const flightBooked = await context.get('flight_booked')
				const hotelBooked = await context.get('hotel_booked')

				if (flightBooked) {
					bookingsCancelled++
					await context.set('flight_cancelled', true)
				}
				if (hotelBooked) {
					bookingsCancelled++
					await context.set('hotel_cancelled', true)
				}

				return { output: { cancelled: bookingsCancelled, compensation: true } }
			})

			// Confirm booking
			flow.node('confirm-booking', async ({ context }) => {
				const flightId = await context.get('flight_id')
				const hotelId = await context.get('hotel_id')
				const paymentId = await context.get('payment_id')

				return {
					output: {
						confirmed: true,
						flightId,
						hotelId,
						paymentId,
						totalAmount: 1500,
					},
				}
			})

			// Define workflow edges
			flow.edge('book-flight', 'book-hotel')
			flow.edge('book-hotel', 'book-car')
			flow.edge('book-car', 'process-payment', { action: 'success' })
			flow.edge('book-car', 'cancel-bookings', { action: 'failed' })
			flow.edge('process-payment', 'confirm-booking')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context.flight_booked).toBe(true)
			expect(result.context.hotel_booked).toBe(true)
			expect(result.context.flight_cancelled).toBe(true)
			expect(result.context.hotel_cancelled).toBe(true)
			expect(result.context.payment_processed).toBeUndefined() // Payment not processed due to failure
			expect(result.context['_outputs.cancel-bookings'].compensation).toBe(true)
		})
	})

	describe('Long-Running Workflow with Time Travel Debugging', () => {
		it('should support debugging complex workflow execution', async () => {
			const eventLogger = new InMemoryEventLogger()
			const flow = createFlow('debug-workflow')

			// Simulate a complex workflow with multiple steps
			flow.node('init', async ({ context }) => {
				await context.set('step', 1)
				await context.set('data', { value: 0 })
				return { output: 'initialized' }
			})

			flow.node('process-1', async ({ context }) => {
				const data = (await context.get('data')) as any
				data.value += 10
				await context.set('data', data)
				await context.set('step', 2)
				return { output: data.value }
			})

			flow.node('process-2', async ({ context }) => {
				const data = (await context.get('data')) as any
				data.value *= 2
				await context.set('data', data)
				await context.set('step', 3)
				return { output: data.value }
			})

			flow.node('process-3', async ({ context }) => {
				const data = (await context.get('data')) as any
				data.value -= 5
				await context.set('data', data)
				await context.set('step', 4)
				return { output: data.value }
			})

			flow.node('finalize', async ({ context }) => {
				const data = (await context.get('data')) as any
				const step = await context.get('step')
				return { output: { finalValue: data.value, finalStep: step } }
			})

			// Define linear workflow
			flow.edge('init', 'process-1')
			flow.edge('process-1', 'process-2')
			flow.edge('process-2', 'process-3')
			flow.edge('process-3', 'finalize')

			const runtime = new FlowRuntime({ eventBus: eventLogger })
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.finalize'].finalValue).toBe(15) // ((0 + 10) * 2) - 5 = 15
			expect(result.context['_outputs.finalize'].finalStep).toBe(4)

			// Verify event logging for debugging
			const events = eventLogger.events
			expect(events.some((e) => e.type === 'workflow:start')).toBe(true)
			expect(events.some((e) => e.type === 'workflow:finish')).toBe(true)
			expect(events.filter((e) => e.type === 'node:finish').length).toBe(5) // 5 nodes

			// Test replay functionality
			// const replayResult = await runtime.replay(flow.toBlueprint(), events)
			// expect(replayResult.status).toBe('completed')
			// expect(replayResult.context['_outputs.finalize'].finalValue).toBe(15)
		})
	})

	describe('Complex Conditional Logic', () => {
		it('should handle complex decision trees and conditional routing', async () => {
			const flow = createFlow('decision-tree')

			// Evaluate application
			flow.node('evaluate-application', async ({ context }) => {
				const app = await context.get('application')
				let score = 0
				if (app.experience > 5) score += 30
				else if (app.experience > 2) score += 20
				else score += 10

				if (app.skills.length > 3) score += 30
				else if (app.skills.length > 1) score += 20
				else score += 10

				if (app.education === 'masters') score += 25
				else if (app.education === 'bachelors') score += 20
				else score += 10

				return {
					output: { ...app, score },
					action: score >= 75 ? 'high-score' : score >= 50 ? 'medium-score' : 'low-score',
				}
			})

			// High score path
			flow.node('fast-track-interview', async ({ input }) => {
				const app = input as any
				return { output: { ...app, path: 'fast-track', nextStep: 'technical-interview' } }
			})

			// Medium score path
			flow.node('standard-interview', async ({ input }) => {
				const app = input as any
				return { output: { ...app, path: 'standard', nextStep: 'phone-screen' } }
			})

			// Low score path
			flow.node('review-application', async ({ input }) => {
				const app = input as any
				return { output: { ...app, path: 'review', nextStep: 'manual-review' } }
			})

			// Technical interview
			flow.node('technical-interview', async ({ input }) => {
				const app = input as any
				const pass = true // Always pass for test
				return {
					output: { ...app, technicalResult: pass ? 'pass' : 'fail' },
					action: pass ? 'technical-pass' : 'technical-fail',
				}
			})

			// Phone screen
			flow.node('phone-screen', async ({ input }) => {
				const app = input as any
				const pass = true // Always pass for test
				return {
					output: { ...app, phoneResult: pass ? 'pass' : 'fail' },
					action: pass ? 'phone-pass' : 'phone-fail',
				}
			})

			// Final decision
			flow.node('make-decision', async ({ input }) => {
				const app = input as any
				const decision = app.technicalResult === 'pass' || app.phoneResult === 'pass' ? 'hire' : 'reject'
				return { output: { ...app, finalDecision: decision } }
			})

			// Define workflow edges with complex routing
			flow.edge('evaluate-application', 'fast-track-interview', { action: 'high-score' })
			flow.edge('evaluate-application', 'standard-interview', { action: 'medium-score' })
			flow.edge('evaluate-application', 'review-application', { action: 'low-score' })

			flow.edge('fast-track-interview', 'technical-interview')
			flow.edge('standard-interview', 'phone-screen')

			flow.edge('phone-screen', 'make-decision', { action: 'phone-pass' }) // Manual review leads to decision

			const runtime = new FlowRuntime({})

			const testApplication = {
				name: 'John Doe',
				experience: 4,
				skills: ['javascript', 'react', 'node'],
				education: 'bachelors',
			}

			const result = await runtime.run(
				flow.toBlueprint(),
				{ application: testApplication },
				{
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.make-decision']).toBeDefined()
			expect(['hire', 'reject']).toContain(result.context['_outputs.make-decision'].finalDecision)
		})
	})
})
