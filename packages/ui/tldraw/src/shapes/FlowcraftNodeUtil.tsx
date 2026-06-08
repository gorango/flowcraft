import { HTMLContainer, Rectangle2d, ShapeUtil } from 'tldraw'
import { T } from '@tldraw/validate'
import { StatusIndicator } from './StatusIndicator'
import type { FlowcraftNodeShape } from './types'
import { FLOWCRAFT_NODE } from './types'

export class FlowcraftNodeUtil extends ShapeUtil<FlowcraftNodeShape> {
	static override type = FLOWCRAFT_NODE

	static override props = {
		w: T.number,
		h: T.number,
		nodeDef: T.any,
		status: T.string,
		nodeData: T.any,
	}

	getDefaultProps(): FlowcraftNodeShape['props'] {
		return {
			w: 220,
			h: 80,
			nodeDef: { id: 'new-node', uses: 'custom' },
			status: 'idle',
		}
	}

	getGeometry(shape: FlowcraftNodeShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	component(shape: FlowcraftNodeShape) {
		const { nodeDef, status, nodeData } = shape.props
		const label = nodeDef.id
			.split('-')
			.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ')
		const hasInputs = nodeData?.inputs !== undefined && nodeData?.inputs !== null
		const hasOutputs = nodeData?.outputs !== undefined && nodeData?.outputs !== null

		const contentH = 80 + (hasInputs ? 62 : 0) + (hasOutputs ? 62 : 0)

		if (shape.props.h < contentH) {
			queueMicrotask(() => {
				const editor = this.editor
				if (!editor) return
				const current = editor.getShape<FlowcraftNodeShape>(shape.id)
				if (current && current.props.h < contentH) {
					editor.updateShape<FlowcraftNodeShape>({
						id: shape.id,
						type: FLOWCRAFT_NODE,
						props: { h: contentH },
					})
				}
			})
		}

		return (
			<HTMLContainer
				style={{
					width: shape.props.w,
					height: shape.props.h,
					fontFamily: 'ui-sans-serif, system-ui, sans-serif',
				}}
			>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
						padding: '6px 10px',
						width: shape.props.w,
						height: shape.props.h,
						background:
							status === 'failed' ? '#fef2f2' : status === 'pending' ? '#fefce8' : '#ffffff',
						border: `1.5px solid ${status === 'failed' ? '#ef4444' : status === 'completed' ? '#22c55e' : status === 'pending' ? '#eab308' : '#e5e7eb'}`,
						borderRadius: 8,
						boxSizing: 'border-box',
						boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
						<StatusIndicator status={status} size={12} />
						<span
							style={{
								fontWeight: 600,
								fontSize: 13,
								lineHeight: '18px',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{label}
						</span>
					</div>
					<div style={{ fontSize: 11, color: '#6b7280', lineHeight: '14px' }}>
						uses: {nodeDef.uses}
					</div>
					{hasInputs && (
						<div style={{ fontSize: 10, color: '#374151' }}>
							<div style={{ fontWeight: 500, color: '#9ca3af', marginBottom: 2 }}>Inputs</div>
							<pre
								style={{
									margin: 0,
									maxHeight: 40,
									overflow: 'auto',
									fontSize: 9,
									lineHeight: '12px',
									whiteSpace: 'pre-wrap',
									wordBreak: 'break-all',
								}}
							>
								{JSON.stringify(nodeData!.inputs, null, 1)}
							</pre>
						</div>
					)}
					{hasOutputs && (
						<div style={{ fontSize: 10, color: '#374151' }}>
							<div style={{ fontWeight: 500, color: '#9ca3af', marginBottom: 2 }}>Outputs</div>
							<pre
								style={{
									margin: 0,
									maxHeight: 40,
									overflow: 'auto',
									fontSize: 9,
									lineHeight: '12px',
									whiteSpace: 'pre-wrap',
									wordBreak: 'break-all',
								}}
							>
								{JSON.stringify(nodeData!.outputs, null, 1)}
							</pre>
						</div>
					)}
				</div>
			</HTMLContainer>
		)
	}

	indicator(shape: FlowcraftNodeShape) {
		return (
			<rect
				width={shape.props.w}
				height={shape.props.h}
				rx={8}
				fill="none"
				stroke="#3b82f6"
				strokeWidth={1.5}
			/>
		)
	}

	getIndicatorPath(shape: FlowcraftNodeShape) {
		const { w, h } = shape.props
		return new Path2D(`M0,${h} L0,0 L${w},0 L${w},${h} Z`)
	}

	override canBind() {
		return true
	}

	override hideSelectionBoundsFg = (_shape: FlowcraftNodeShape) => false
	override hideSelectionBoundsBg = (_shape: FlowcraftNodeShape) => false
	override canEdit = () => false
	override canResize = () => true
	override canSnap = () => true
	override isAspectRatioLocked = () => false
}
