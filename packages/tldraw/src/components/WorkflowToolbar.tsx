import { useCallback, useState } from 'react'
import type { Editor } from 'tldraw'
import { createShapeId } from 'tldraw'
import { FLOWCRAFT_NODE } from '../shapes/types'
import { NodeTypePicker } from '../panels/NodeTypePicker'
import type { NodeTypeDefinition } from '../registry/nodeTypes'

export interface WorkflowToolbarProps {
	editor: Editor | null
	mode: 'select' | 'add-node'
	onModeChange: (mode: 'select' | 'add-node') => void
}

export function WorkflowToolbar({ editor, mode, onModeChange }: WorkflowToolbarProps) {
	const [showPicker, setShowPicker] = useState(false)

	const handleAddNodeClick = useCallback(() => {
		setShowPicker(true)
		onModeChange('add-node')
	}, [onModeChange])

	const handleTypeSelect = useCallback(
		(def: NodeTypeDefinition) => {
			setShowPicker(false)
			if (!editor) return

			const bounds = editor.getViewportPageBounds()
			const centerX = bounds.x + bounds.w / 2
			const centerY = bounds.y + bounds.h / 2
			const id = `${def.type}-${Date.now()}`
			editor.createShapes([
				{
					id: createShapeId(id),
					type: FLOWCRAFT_NODE,
					x: centerX - 110,
					y: centerY - 40,
					props: {
						nodeDef: {
							id,
							uses: def.type,
							params: { ...def.defaultParams },
							inputs:
								typeof def.defaultInputs === 'string'
									? def.defaultInputs
									: { ...def.defaultInputs },
						},
						status: 'idle',
						w: 220,
						h: 80,
					},
				},
			])
		},
		[editor],
	)

	return (
		<>
			<div style={toolbarStyle}>
				<button
					type="button"
					onClick={handleAddNodeClick}
					style={{
						...btnStyle,
						background: mode === 'add-node' ? '#3b82f6' : '#f3f4f6',
						color: mode === 'add-node' ? '#fff' : '#374151',
					}}
					title="Add Node"
				>
					+ Node
				</button>
			</div>

			{showPicker && (
				<NodeTypePicker
					onSelect={handleTypeSelect}
					onClose={() => {
						setShowPicker(false)
						onModeChange('select')
					}}
				/>
			)}
		</>
	)
}

const toolbarStyle: React.CSSProperties = {
	position: 'absolute',
	top: 50,
	left: 8,
	zIndex: 100,
	display: 'flex',
	alignItems: 'center',
	gap: 4,
	padding: '4px 6px',
	background: 'rgba(255,255,255,0.95)',
	border: '1px solid #e5e7eb',
	borderRadius: 8,
	boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
}

const btnStyle: React.CSSProperties = {
	padding: '4px 10px',
	fontSize: 12,
	fontWeight: 500,
	border: 'none',
	borderRadius: 4,
	cursor: 'pointer',
	fontFamily: 'ui-sans-serif, system-ui, sans-serif',
}
