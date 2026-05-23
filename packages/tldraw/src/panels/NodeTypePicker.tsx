import { useMemo, useState } from 'react'
import { getCategoryDefinitions } from '../registry/nodeTypes'
import type { NodeTypeDefinition } from '../registry/nodeTypes'

export interface NodeTypePickerProps {
	onSelect: (def: NodeTypeDefinition) => void
	onClose: () => void
}

export function NodeTypePicker({ onSelect, onClose }: NodeTypePickerProps) {
	const categories = useMemo(() => getCategoryDefinitions(), [])
	const [search, setSearch] = useState('')

	const filtered = useMemo(() => {
		if (!search.trim()) return categories
		const filteredCategories = new Map<string, NodeTypeDefinition[]>()
		for (const [cat, types] of categories) {
			const matching = types.filter(
				(t) =>
					t.label.toLowerCase().includes(search.toLowerCase()) ||
					t.description.toLowerCase().includes(search.toLowerCase()),
			)
			if (matching.length > 0) {
				filteredCategories.set(cat, matching)
			}
		}
		return filteredCategories
	}, [search, categories])

	return (
		<div style={overlayStyle} onClick={onClose}>
			<div style={panelStyle} onClick={(e) => e.stopPropagation()}>
				<div style={headerStyle}>
					<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Add Node</h3>
					<button type="button" onClick={onClose} style={closeBtnStyle}>
						✕
					</button>
				</div>
				<input
					placeholder="Search nodes..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					style={searchStyle}
					autoFocus
				/>
				<div style={listStyle}>
					{Array.from(filtered.entries()).map(([category, types]) => (
						<div key={category}>
							<div style={categoryLabelStyle}>{category}</div>
							{types.map((def) => (
								<button
									key={def.type}
									type="button"
									style={itemStyle}
									onClick={() => onSelect(def)}
								>
									<div style={{ fontWeight: 500, fontSize: 12 }}>{def.label}</div>
									<div style={{ fontSize: 10, color: '#6b7280' }}>
										{def.description}
									</div>
								</button>
							))}
						</div>
					))}
					{Array.from(filtered.values()).every((v) => v.length === 0) && (
						<div style={{ fontSize: 12, color: '#9ca3af', padding: 8 }}>
							No matching nodes
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

const overlayStyle: React.CSSProperties = {
	position: 'fixed',
	inset: 0,
	zIndex: 1000,
	background: 'rgba(0,0,0,0.2)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
}

const panelStyle: React.CSSProperties = {
	background: '#fff',
	border: '1px solid #e5e7eb',
	borderRadius: 10,
	boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
	width: 320,
	maxHeight: '60vh',
	display: 'flex',
	flexDirection: 'column',
	fontFamily: 'ui-sans-serif, system-ui, sans-serif',
	overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	padding: '12px 14px',
	borderBottom: '1px solid #e5e7eb',
}

const searchStyle: React.CSSProperties = {
	margin: '8px 12px',
	padding: '6px 10px',
	border: '1px solid #d1d5db',
	borderRadius: 6,
	fontSize: 12,
	outline: 'none',
}

const listStyle: React.CSSProperties = {
	overflow: 'auto',
	padding: '4px 8px 12px',
	display: 'flex',
	flexDirection: 'column',
	gap: 2,
}

const categoryLabelStyle: React.CSSProperties = {
	fontSize: 10,
	fontWeight: 600,
	color: '#9ca3af',
	textTransform: 'uppercase',
	padding: '8px 4px 4px',
	letterSpacing: '0.05em',
}

const itemStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: 2,
	padding: '8px 10px',
	border: 'none',
	background: 'transparent',
	borderRadius: 6,
	cursor: 'pointer',
	textAlign: 'left',
	width: '100%',
	fontFamily: 'inherit',
}

const closeBtnStyle: React.CSSProperties = {
	border: 'none',
	background: 'none',
	cursor: 'pointer',
	fontSize: 16,
	color: '#6b7280',
	padding: '2px 4px',
}
