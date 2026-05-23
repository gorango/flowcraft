import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Editor } from 'tldraw'
import type { WorkflowBlueprint } from 'flowcraft'
import { FlowcraftSync } from '../../src/sync/FlowcraftSync'

const mockBlueprint: WorkflowBlueprint = {
	id: 'test',
	nodes: [],
	edges: [],
}

let triggerStoreListener: (() => void) | null = null

vi.mock('../../src/sync/blueprint-to-canvas', () => ({
	blueprintToCanvas: vi.fn(() => {
		triggerStoreListener?.()
	}),
}))
vi.mock('../../src/sync/canvas-to-blueprint', () => ({
	canvasToBlueprint: vi.fn(() => ({ ...mockBlueprint, positions: {} })),
}))

function createMockEditor() {
	let listener: (() => void) | null = null
	triggerStoreListener = () => listener?.()
	return {
		store: {
			listen: vi.fn((cb: () => void) => {
				listener = cb
				return () => {
					listener = null
				}
			}) as any,
		},
		getCurrentPageShapes: vi.fn(() => []),
		getBindingsFromShape: vi.fn(() => []),
	} as unknown as Editor
}

describe('FlowcraftSync', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('startListening calls editor.store.listen', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		sync.startListening()

		expect(editor.store.listen).toHaveBeenCalledTimes(1)
		expect(editor.store.listen).toHaveBeenCalledWith(expect.any(Function), {
			scope: 'document',
		})
	})

	it('does not start listening when onBlueprintChange is not provided', () => {
		const editor = createMockEditor()
		const sync = new FlowcraftSync(editor)

		sync.startListening()

		expect(editor.store.listen).not.toHaveBeenCalled()
	})

	it('calls onBlueprintChange after debounce delay on store change', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		sync.startListening()
		triggerStoreListener?.()

		expect(onBlueprintChange).not.toHaveBeenCalled()

		vi.advanceTimersByTime(150)

		expect(onBlueprintChange).toHaveBeenCalledTimes(1)
		expect(onBlueprintChange).toHaveBeenCalledWith({
			...mockBlueprint,
			positions: {},
		})
	})

	it('debounces multiple rapid store changes into a single callback', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		sync.startListening()

		triggerStoreListener?.()
		vi.advanceTimersByTime(50)
		triggerStoreListener?.()
		vi.advanceTimersByTime(50)
		triggerStoreListener?.()

		expect(onBlueprintChange).not.toHaveBeenCalled()

		vi.advanceTimersByTime(150)

		expect(onBlueprintChange).toHaveBeenCalledTimes(1)
	})

	it('does not fire onBlueprintChange when isApplyingBlueprint is true', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		sync.startListening()

		// blueprintToCanvas mock triggers a store change synchronously;
		// FlowcraftSync should skip it because isApplyingBlueprint is true
		sync.applyBlueprint(mockBlueprint)

		vi.advanceTimersByTime(150)

		expect(onBlueprintChange).not.toHaveBeenCalled()
	})

	it('stopListening removes the store listener', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		const unsubscribe = vi.fn()
		editor.store.listen = vi.fn(() => unsubscribe) as any

		sync.startListening()
		sync.stopListening()

		expect(unsubscribe).toHaveBeenCalledTimes(1)
	})

	it('dispose calls stopListening', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		const unsubscribe = vi.fn()
		editor.store.listen = vi.fn(() => unsubscribe) as any

		sync.startListening()
		sync.dispose()

		expect(unsubscribe).toHaveBeenCalledTimes(1)
	})

	it('is idempotent on repeated startListening calls', () => {
		const editor = createMockEditor()
		const onBlueprintChange = vi.fn()
		const sync = new FlowcraftSync(editor, onBlueprintChange)

		sync.startListening()
		sync.startListening()

		expect(editor.store.listen).toHaveBeenCalledTimes(1)
	})
})
