import type { NodeMap } from './types'
import { describe, expect, it } from 'vitest'
import { createFlow } from './flow'

// Define test types
interface MyAppContext {
	userId: number
	userProfile: { name: string, email: string }
}

interface MyAppNodeMap extends NodeMap {
	'send-email': { template: 'welcome' | 'reminder' }
	'update-db': { table: string }
	'fetch-user': { userId: number }
}

// Test valid usage (should compile)
describe('Type-safe Flow Builder', () => {
	it('should allow creating a typed flow with defined context and node map', () => {
		const flow = createFlow<MyAppContext, MyAppNodeMap>('typed-workflow', {
			'send-email': { template: 'welcome' as const },
			'update-db': { table: '' },
			'fetch-user': { userId: 0 },
		})

		// This should compile
		expect(flow).toBeDefined()
	})

	it('should correctly infer the type of ctx.get() within a node function', () => {
		const flow = createFlow<MyAppContext, MyAppNodeMap>('test-flow')

		flow.node('fetchUser', async (ctx) => {
			// ctx.get('userId') should be of type 'number | undefined'
			const userId = ctx.context.get('userId')
			expect(typeof userId === 'number' || userId === undefined).toBe(true)

			// ctx.get('userProfile') should be of type '{ name: string; email: string } | undefined'
			const profile = ctx.context.get('userProfile')
			expect(typeof profile === 'object' || profile === undefined).toBe(true)

			return { output: { name: 'Alice', email: 'a@b.com' } }
		})
	})

	it('should accept a correctly typed params object for a registered node', () => {
		const flow = createFlow<MyAppContext, MyAppNodeMap>('test-flow')

		// This should compile without errors
		flow.node('sendWelcome', 'send-email', {
			template: 'welcome', // Autocompletes 'welcome' | 'reminder'
		})

		flow.node('updateUser', 'update-db', {
			table: 'users',
		})

		flow.node('fetchUser', 'fetch-user', {
			userId: 123,
		})
	})

	it('should execute a valid, fully-typed workflow successfully', async () => {
		const flow = createFlow<MyAppContext, MyAppNodeMap>('test-flow')

		flow
			.node('fetchUser', async (ctx) => {
				const userId = await ctx.context.get('userId')
				return { output: { name: 'Alice', email: 'alice@example.com', id: userId || 1 } }
			})
			.node('saveUser', async (ctx) => {
				await ctx.context.set('userProfile', ctx.input)
				return { output: null }
			})
			.node('sendWelcome', 'send-email', {
				template: 'welcome',
			})

		const blueprint = flow.toBlueprint()
		expect(blueprint.id).toBe('test-flow')
		expect(blueprint.nodes).toHaveLength(3)
		expect(blueprint.nodes[2].params).toEqual({ template: 'welcome' })
	})
})
