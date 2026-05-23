import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import type { FlowcraftNodeShape } from '../shapes/types'
import { FLOWCRAFT_NODE } from '../shapes/types'
import { getNodeTypeDefinition } from '../registry/nodeTypes'
import type { FieldDefinition, FieldType } from '../registry/nodeTypes'
import { NodeTypePicker } from './NodeTypePicker'
import type { NodeTypeDefinition } from '../registry/nodeTypes'

export interface NodeConfigPanelProps {
	editor: Editor | null
	shapeId: string | null
	onClose: () => void
}

function FieldControl({
	field,
	value,
	onChange,
}: {
	field: FieldDefinition
	value: any
	onChange: (val: any) => void
}) {
	const fieldTypes: Record<FieldType, React.ReactNode> = {
		string: (
			<input
				value={value ?? field.defaultValue ?? ''}
				onChange={(e) => onChange(e.target.value)}
				style={inputStyle}
				placeholder={field.placeholder}
			/>
		),
		number: (
			<input
				type="number"
				value={value ?? field.defaultValue ?? 0}
				onChange={(e) => onChange(Number(e.target.value))}
				style={inputStyle}
			/>
		),
		boolean: (
			<input
				type="checkbox"
				checked={value ?? field.defaultValue ?? false}
				onChange={(e) => onChange(e.target.checked)}
				style={{ accentColor: '#3b82f6' }}
			/>
		),
		json: (
			<textarea
				value={
					typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : ''
				}
				onChange={(e) => {
					try {
						onChange(JSON.parse(e.target.value))
					} catch {
						onChange(e.target.value)
					}
				}}
				style={{ ...inputStyle, minHeight: 60, fontFamily: 'monospace', fontSize: 11 }}
			/>
		),
		select: (
			<select
				value={value ?? field.defaultValue ?? ''}
				onChange={(e) => onChange(e.target.value)}
				style={inputStyle}
			>
				{field.options?.map((opt) => (
					<option key={opt} value={opt}>
						{opt}
					</option>
				))}
			</select>
		),
	}

	return (
		<label style={labelStyle}>
			{field.label}
			{fieldTypes[field.type]}
		</label>
	)
}

export function NodeConfigPanel({ editor, shapeId, onClose }: NodeConfigPanelProps) {
	const shape = shapeId ? editor?.getShape(shapeId as TLShapeId) : undefined
	const nodeDef = (shape as FlowcraftNodeShape | undefined)?.props?.nodeDef

	const nodeTypeDef = useMemo(
		() => (nodeDef?.uses ? getNodeTypeDefinition(nodeDef.uses) : undefined),
		[nodeDef?.uses],
	)

	const [id, setId] = useState(nodeDef?.id ?? '')
	const [uses, setUses] = useState(nodeDef?.uses ?? '')
	const [paramsState, setParamsState] = useState<Record<string, any>>(nodeDef?.params ?? {})
	const [inputsState, setInputsState] = useState<string | Record<string, string>>(
		nodeDef?.inputs ?? '',
	)
	const [showTypePicker, setShowTypePicker] = useState(false)
	const [rawJsonMode, setRawJsonMode] = useState(!nodeTypeDef)

	useEffect(() => {
		setRawJsonMode(!nodeTypeDef)
	}, [nodeTypeDef])

	const [rawParams, setRawParams] = useState(
		nodeDef?.params ? JSON.stringify(nodeDef.params, null, 2) : '',
	)
	const [rawInputs, setRawInputs] = useState(
		typeof nodeDef?.inputs === 'string'
			? nodeDef.inputs
			: nodeDef?.inputs
				? JSON.stringify(nodeDef.inputs, null, 2)
				: '',
	)

	const save = useCallback(() => {
		if (!editor || !shapeId) return

		if (nodeTypeDef && !rawJsonMode) {
			editor.updateShape<FlowcraftNodeShape>({
				id: shapeId as TLShapeId,
				type: FLOWCRAFT_NODE,
				props: {
					nodeDef: {
						id,
						uses,
						params: paramsState,
						inputs: inputsState,
						config: nodeDef?.config,
					},
				},
			})
		} else {
			let parsedParams: Record<string, any> | undefined
			let parsedInputs: string | Record<string, string> | undefined
			try {
				parsedParams = rawParams.trim() ? JSON.parse(rawParams) : undefined
			} catch {
				parsedParams = nodeDef?.params
			}
			try {
				parsedInputs = rawInputs.trim() ? JSON.parse(rawInputs) : undefined
			} catch {
				parsedInputs = rawInputs.trim() || undefined
			}

			editor.updateShape<FlowcraftNodeShape>({
				id: shapeId as TLShapeId,
				type: FLOWCRAFT_NODE,
				props: {
					nodeDef: {
						id,
						uses,
						params: parsedParams,
						inputs: parsedInputs,
						config: nodeDef?.config,
					},
				},
			})
		}
		onClose()
	}, [
		editor,
		shapeId,
		id,
		uses,
		paramsState,
		inputsState,
		nodeDef,
		onClose,
		nodeTypeDef,
		rawJsonMode,
		rawParams,
		rawInputs,
	])

	const handleTypeSelect = useCallback((def: NodeTypeDefinition) => {
		setUses(def.type)
		setParamsState({ ...def.defaultParams })
		setInputsState(
			typeof def.defaultInputs === 'string' ? def.defaultInputs : { ...def.defaultInputs },
		)
		setRawJsonMode(false)
		setShowTypePicker(false)
	}, [])

	const handleParamChange = useCallback((key: string, value: any) => {
		setParamsState((prev) => ({ ...prev, [key]: value }))
	}, [])

	if (!shapeId || !shape) {
		return (
			<div style={panelStyle}>
				<p style={{ fontSize: 12, color: '#9ca3af' }}>Select a node to edit</p>
			</div>
		)
	}

	return (
		<>
			<div style={panelStyle}>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						marginBottom: 8,
					}}
				>
					<h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
						{nodeTypeDef?.label ?? 'Node Config'}
					</h3>
					<div style={{ display: 'flex', gap: 4 }}>
						{nodeTypeDef && (
							<button
								type="button"
								onClick={() => setRawJsonMode((v) => !v)}
								style={{
									...miniBtnStyle,
									background: rawJsonMode ? '#3b82f6' : 'transparent',
									color: rawJsonMode ? '#fff' : '#6b7280',
								}}
							>
								JSON
							</button>
						)}
						<button type="button" onClick={onClose} style={closeBtnStyle}>
							✕
						</button>
					</div>
				</div>

				<label style={labelStyle}>
					ID
					<input value={id} onChange={(e) => setId(e.target.value)} style={inputStyle} />
				</label>

				{!nodeTypeDef || rawJsonMode ? (
					<>
						<label style={labelStyle}>
							uses
							<div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
								<input
									value={uses}
									onChange={(e) => setUses(e.target.value)}
									style={{ ...inputStyle, flex: 1 }}
								/>
								<button
									type="button"
									onClick={() => setShowTypePicker(true)}
									style={pickerBtnStyle}
								>
									Browse
								</button>
							</div>
						</label>
						<label style={labelStyle}>
							params (JSON)
							<textarea
								value={rawParams}
								onChange={(e) => setRawParams(e.target.value)}
								style={{
									...inputStyle,
									minHeight: 60,
									fontFamily: 'monospace',
									fontSize: 11,
								}}
							/>
						</label>
						<label style={labelStyle}>
							inputs
							<textarea
								value={rawInputs}
								onChange={(e) => setRawInputs(e.target.value)}
								style={{
									...inputStyle,
									minHeight: 40,
									fontFamily: 'monospace',
									fontSize: 11,
								}}
							/>
						</label>
					</>
				) : (
					<>
						<div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>
							Type: {nodeTypeDef.label}
						</div>
						{Object.entries(nodeTypeDef.schema).map(([key, field]) => (
							<FieldControl
								key={key}
								field={field}
								value={paramsState[key]}
								onChange={(val) => handleParamChange(key, val)}
							/>
						))}
						<label style={labelStyle}>
							inputs (JSON)
							<textarea
								value={
									typeof inputsState === 'string'
										? inputsState
										: JSON.stringify(inputsState, null, 2)
								}
								onChange={(e) => {
									try {
										setInputsState(JSON.parse(e.target.value))
									} catch {
										setInputsState(e.target.value)
									}
								}}
								style={{
									...inputStyle,
									minHeight: 40,
									fontFamily: 'monospace',
									fontSize: 11,
								}}
							/>
						</label>
						<button
							type="button"
							onClick={() => setShowTypePicker(true)}
							style={{
								...miniBtnStyle,
								background: 'transparent',
								color: '#3b82f6',
								border: '1px solid #3b82f6',
								padding: '4px 8px',
								width: '100%',
							}}
						>
							Change Type
						</button>
					</>
				)}

				<button type="button" onClick={save} style={saveBtnStyle}>
					Save
				</button>
			</div>

			{showTypePicker && (
				<NodeTypePicker
					onSelect={handleTypeSelect}
					onClose={() => setShowTypePicker(false)}
				/>
			)}
		</>
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

const miniBtnStyle: React.CSSProperties = {
	border: 'none',
	borderRadius: 4,
	fontSize: 10,
	fontWeight: 500,
	cursor: 'pointer',
	padding: '2px 6px',
}

const pickerBtnStyle: React.CSSProperties = {
	padding: '4px 8px',
	background: '#f3f4f6',
	border: '1px solid #d1d5db',
	borderRadius: 4,
	fontSize: 11,
	cursor: 'pointer',
	whiteSpace: 'nowrap',
}
