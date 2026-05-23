// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { FlowcraftNodeUtil } from '../../src/shapes/FlowcraftNodeUtil'

vi.mock('tldraw', () => ({
	HTMLContainer: ({ children }: any) => {
		const div = document.createElement('div')
		if (typeof children === 'string') {
			div.textContent = children
		}
		return div
	},
	Rectangle2d: class {
		config: any
		constructor(config: any) {
			this.config = config
		}
	},
	ShapeUtil: class {
		editor: any
		constructor(editor: any) {
			this.editor = editor
		}
	},
}))

vi.mock('../../src/shapes/StatusIndicator', () => ({
	StatusIndicator: ({ status, size }: any) => {
		const el = document.createElement('span')
		el.setAttribute('data-status', status)
		el.setAttribute('data-size', String(size))
		return el
	},
}))

function createMockEditor() {
	return { getShape: vi.fn(() => null), updateShape: vi.fn() } as any
}

describe('FlowcraftNodeUtil', () => {
	it('getDefaultProps returns expected defaults', () => {
		const util = new FlowcraftNodeUtil(createMockEditor())

		const props = util.getDefaultProps()

		expect(props).toEqual({
			w: 220,
			h: 80,
			nodeDef: { id: 'new-node', uses: 'custom' },
			status: 'idle',
		})
	})

	it('getGeometry returns Rectangle2d with correct dimensions', () => {
		const util = new FlowcraftNodeUtil(createMockEditor())

		const shape = {
			type: 'flowcraft-node',
			props: { w: 300, h: 100, nodeDef: { id: 't', uses: 'a' }, status: 'idle' },
		} as any
		const geometry = util.getGeometry(shape)

		expect(geometry).toBeInstanceOf(Object)
		expect((geometry as any).config).toEqual({
			width: 300,
			height: 100,
			isFilled: true,
		})
	})
})
