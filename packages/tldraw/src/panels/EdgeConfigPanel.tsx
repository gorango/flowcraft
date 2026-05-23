import { useCallback, useState, useEffect } from 'react'
import type { Editor, TLShapeId } from 'tldraw'

export interface EdgeConfigPanelProps {
	editor: Editor | null
	shapeId: string | null
	onClose: () => void
}

export function EdgeConfigPanel({ editor, shapeId, onClose }: EdgeConfigPanelProps) {
	const shape = shapeId ? editor?.getShape(shapeId as TLShapeId) : undefined
	const isArrow = shape?.type === 'arrow'

	const edgeDef = (shape?.meta as Record<string, any>)?.edgeDef ?? {}

	const [action, setAction] = useState(String(edgeDef.action ?? ''))
	const [condition, setCondition] = useState(String(edgeDef.condition ?? ''))
	const [transform, setTransform] = useState(String(edgeDef.transform ?? ''))

	useEffect(() => {
		setAction(String(edgeDef.action ?? ''))
		setCondition(String(edgeDef.condition ?? ''))
		setTransform(String(edgeDef.transform ?? ''))
	}, [edgeDef.action, edgeDef.condition, edgeDef.transform])

	const save = useCallback(() => {
		if (!editor || !shapeId || !isArrow) return

		const newMeta: Record<string, string | undefined> = {}
		if (action.trim()) newMeta.action = action.trim()
		if (condition.trim()) newMeta.condition = condition.trim()
		if (transform.trim()) newMeta.transform = transform.trim()
		editor.updateShape({
			id: shapeId as TLShapeId,
			type: 'arrow',
			meta: { edgeDef: newMeta },
		})

		onClose()
	}, [editor, shapeId, action, condition, transform, isArrow, onClose])

	if (!shapeId || !shape || !isArrow) {
		return (
			<div style={panelStyle}>
				<p style={{ fontSize: 12, color: '#9ca3af' }}>Select an edge to edit</p>
			</div>
		)
	}

	return (
		<div style={panelStyle}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: 8,
				}}
			>
				<h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Edge Config</h3>
				<button type="button" onClick={onClose} style={closeBtnStyle}>
					✕
				</button>
			</div>

			<label style={labelStyle}>
				Action
				<input
					value={action}
					onChange={(e) => setAction(e.target.value)}
					style={inputStyle}
					placeholder='e.g. "approved"'
				/>
			</label>

			<label style={labelStyle}>
				Condition
				<input
					value={condition}
					onChange={(e) => setCondition(e.target.value)}
					style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
					placeholder='e.g. "context.total > 500"'
				/>
			</label>

			<label style={labelStyle}>
				Transform
				<input
					value={transform}
					onChange={(e) => setTransform(e.target.value)}
					style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
					placeholder='e.g. "context[`_outputs.nodeId`]"'
				/>
			</label>

			<button type="button" onClick={save} style={saveBtnStyle}>
				Save
			</button>
		</div>
	)
}

const panelStyle: React.CSSProperties = {
	position: 'absolute',
	top: 8,
	right: 8,
	zIndex: 100,
	width: 240,
	padding: 12,
	background: '#fff',
	border: '1px solid #e5e7eb',
	borderRadius: 8,
	boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
	fontFamily: 'ui-sans-serif, system-ui, sans-serif',
	fontSize: 12,
	display: 'flex',
	flexDirection: 'column',
	gap: 8,
}

const labelStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: 2,
	fontSize: 11,
	fontWeight: 500,
	color: '#374151',
}

const inputStyle: React.CSSProperties = {
	padding: '4px 6px',
	border: '1px solid #d1d5db',
	borderRadius: 4,
	fontSize: 12,
	outline: 'none',
}

const closeBtnStyle: React.CSSProperties = {
	border: 'none',
	background: 'none',
	cursor: 'pointer',
	fontSize: 14,
	color: '#6b7280',
	padding: '2px 4px',
}

const saveBtnStyle: React.CSSProperties = {
	padding: '6px 12px',
	background: '#3b82f6',
	color: '#fff',
	border: 'none',
	borderRadius: 4,
	fontSize: 12,
	fontWeight: 500,
	cursor: 'pointer',
	marginTop: 4,
}
