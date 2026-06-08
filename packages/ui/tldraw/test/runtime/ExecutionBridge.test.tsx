// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from 'tldraw'
import type { FlowcraftEvent } from 'flowcraft'
import { useExecutionBridge } from '../../src/runtime/ExecutionBridge'
import { EventBus } from '../../src/sync/EventBus'

function createMockEditor(): Editor & { shape: any } {
	const shape = {
		id: 'shape:test-node' as any,
		type: 'flowcraft-node',
		props: { nodeDef: { id: 'test-node' }, nodeData: {} },
	}
	return {
		getShape: vi.fn(() => shape),
		updateShape: vi.fn(),
		shape,
	} as unknown as Editor & { shape: any }
}

interface HarnessProps {
	editor: Editor | null
	eventBus: EventBus | null
}

function Harness({ editor, eventBus }: HarnessProps) {
	useExecutionBridge(editor, eventBus)
	return null
}

describe('useExecutionBridge', () => {
	let editor: Editor & { shape: any }
	let bus: EventBus

	beforeEach(() => {
		editor = createMockEditor()
		bus = new EventBus()
	})

	function mount() {
		const container = document.createElement('div')
		const root = createRoot(container)
		act(() => {
			root.render(createElement(Harness, { editor, eventBus: bus }))
		})
		return { container, root }
	}

	it('registers event listeners on mount', () => {
		const onSpy = vi.spyOn(bus, 'on' as any)
		const { root } = mount()

		expect(onSpy).toHaveBeenCalledWith('node:start', expect.any(Function))
		expect(onSpy).toHaveBeenCalledWith('node:finish', expect.any(Function))
		expect(onSpy).toHaveBeenCalledWith('node:error', expect.any(Function))
		expect(onSpy).toHaveBeenCalledWith('context:change', expect.any(Function))
		expect(onSpy).toHaveBeenCalledWith('batch:start', expect.any(Function))
		expect(onSpy).toHaveBeenCalledWith('batch:finish', expect.any(Function))
		expect(onSpy).toHaveBeenCalledTimes(6)

		root.unmount()
	})

	it('does nothing when editor or eventBus is null', () => {
		const onSpy = vi.spyOn(bus, 'on' as any)
		const container = document.createElement('div')
		const root = createRoot(container)

		act(() => {
			root.render(createElement(Harness, { editor: null, eventBus: null }))
		})
		expect(onSpy).not.toHaveBeenCalled()

		root.unmount()
	})

	it('does nothing when editor is null', () => {
		const onSpy = vi.spyOn(bus, 'on' as any)
		const container = document.createElement('div')
		const root = createRoot(container)

		act(() => {
			root.render(createElement(Harness, { editor: null, eventBus: bus }))
		})
		expect(onSpy).not.toHaveBeenCalled()

		root.unmount()
	})

	it('does nothing when eventBus is null', () => {
		const onSpy = vi.spyOn(bus, 'on' as any)
		const container = document.createElement('div')
		const root = createRoot(container)

		act(() => {
			root.render(createElement(Harness, { editor, eventBus: null }))
		})
		expect(onSpy).not.toHaveBeenCalled()

		root.unmount()
	})

	it('node:start sets status to pending and stores inputs', () => {
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'node:start',
				payload: {
					nodeId: 'test-node',
					executionId: 'e1',
					input: { url: 'http://example.com' },
					blueprintId: 'bp1',
				},
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:test-node',
			type: 'flowcraft-node',
			props: { status: 'pending', nodeData: { inputs: { url: 'http://example.com' } } },
		})

		root.unmount()
	})

	it('node:finish sets status to completed and stores outputs', () => {
		const { root } = mount()

		editor.shape.props.nodeData = { inputs: { url: 'http://example.com' } }

		act(() => {
			bus.emit({
				type: 'node:finish',
				payload: {
					nodeId: 'test-node',
					result: { output: { data: 'ok' } },
					executionId: 'e1',
					blueprintId: 'bp1',
				},
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:test-node',
			type: 'flowcraft-node',
			props: {
				status: 'completed',
				nodeData: { inputs: { url: 'http://example.com' }, outputs: { data: 'ok' } },
			},
		})

		root.unmount()
	})

	it('node:error sets status to failed and stores error message', () => {
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'node:error',
				payload: {
					nodeId: 'test-node',
					error: new Error('Something broke'),
					executionId: 'e1',
					blueprintId: 'bp1',
				},
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:test-node',
			type: 'flowcraft-node',
			props: { status: 'failed', nodeData: { error: 'Something broke' } },
		})

		root.unmount()
	})

	it('node:error with no message stores fallback string', () => {
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'node:error',
				payload: {
					nodeId: 'test-node',
					error: { something: true } as any,
					executionId: 'e1',
					blueprintId: 'bp1',
				},
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith(
			expect.objectContaining({
				props: expect.objectContaining({
					nodeData: expect.objectContaining({ error: 'Unknown error' }),
				}),
			}),
		)

		root.unmount()
	})

	it('context:change updates shape with contextChanges', () => {
		editor.shape.props.nodeData = { existingKey: 'val' }
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'context:change',
				payload: {
					sourceNode: 'test-node',
					key: 'myKey',
					op: 'set',
					value: 'myValue',
					executionId: 'e1',
				},
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:test-node',
			type: 'flowcraft-node',
			props: {
				status: 'completed',
				nodeData: {
					existingKey: 'val',
					contextChanges: { myKey: 'myValue' },
				},
			},
		})

		root.unmount()
	})

	it('batch:start sets status to pending', () => {
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'batch:start',
				payload: { batchId: 'test-node', scatterNodeId: 'scatter', workerNodeIds: ['w1'] },
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:test-node',
			type: 'flowcraft-node',
			props: { status: 'pending', nodeData: {} },
		})

		root.unmount()
	})

	it('batch:finish sets status to completed and stores results', () => {
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'batch:finish',
				payload: { batchId: 'test-node', gatherNodeId: 'gather', results: [{ x: 1 }] },
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalledWith({
			id: 'shape:test-node',
			type: 'flowcraft-node',
			props: { status: 'completed', nodeData: { outputs: [{ x: 1 }] } },
		})

		root.unmount()
	})

	it('skips update when shape is not found', () => {
		editor.getShape = vi.fn(() => undefined as any)
		const { root } = mount()

		act(() => {
			bus.emit({
				type: 'node:start',
				payload: {
					nodeId: 'missing-node',
					executionId: 'e1',
					input: {},
					blueprintId: 'bp1',
				},
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).not.toHaveBeenCalled()

		root.unmount()
	})

	it('unsubscribes all listeners on unmount', () => {
		const handler = vi.fn()
		const unsub1 = bus.on('node:start', handler)

		const { root } = mount()

		unsub1()
		// After mount, the hook should have re-registered its own handler
		act(() => {
			bus.emit({
				type: 'node:start',
				payload: { nodeId: 'test-node', executionId: 'e1', input: {}, blueprintId: 'bp1' },
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).toHaveBeenCalled()

		;(editor.updateShape as any).mockClear()

		// After unmount, emitting should not trigger the handler
		act(() => {
			root.unmount()
		})

		act(() => {
			bus.emit({
				type: 'node:start',
				payload: { nodeId: 'test-node', executionId: 'e1', input: {}, blueprintId: 'bp1' },
			} as FlowcraftEvent)
		})

		expect(editor.updateShape).not.toHaveBeenCalled()
	})
})
