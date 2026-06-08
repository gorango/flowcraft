import { useState, useMemo } from 'react'
import type { WorkflowBlueprint } from 'flowcraft'
import { createFlow } from 'flowcraft'
import { FlowcraftCanvas, FlowcraftEditor } from '@flowcraft/tldraw'
import { getAllNodeTypeDefinitions } from '@flowcraft/tldraw'
import type { NodeTypeDefinition } from '@flowcraft/tldraw'
import './App.css'

const flow = createFlow('data-pipeline')
	.node('fetch-data', async () => {
		await new Promise((r) => setTimeout(r, 300))
		return { output: [1, 2, 3, 4, 5] }
	})
	.node('filter-even', async ({ input }) => {
		await new Promise((r) => setTimeout(r, 200))
		return { output: (input as number[]).filter((n) => n % 2 === 0) }
	})
	.node('double', async ({ input }) => {
		await new Promise((r) => setTimeout(r, 200))
		return { output: (input as number[]).map((n) => n * 2) }
	})
	.node('summarize', async ({ input }) => {
		await new Promise((r) => setTimeout(r, 200))
		return { output: (input as number[]).reduce((a, b) => a + b, 0) }
	})
	.edge('fetch-data', 'filter-even')
	.edge('filter-even', 'double')
	.edge('double', 'summarize')

const positions = {
	'fetch-data': { x: 0, y: 200 },
	'filter-even': { x: 350, y: 200 },
	double: { x: 700, y: 200 },
	summarize: { x: 1050, y: 200 },
}

type Mode = 'visualize' | 'edit' | 'crud-demo'

const initialBlueprint: WorkflowBlueprint = {
	id: 'editor-demo',
	nodes: [
		{ id: 'ingest', uses: 'load-file', inputs: {} },
		{ id: 'transform', uses: 'map-fn', inputs: {} },
		{ id: 'validate', uses: 'check-schema', inputs: {} },
	],
	edges: [
		{ source: 'ingest', target: 'transform' },
		{ source: 'transform', target: 'validate' },
	],
}

function NodeTypesSidebar() {
	const types = useMemo(() => getAllNodeTypeDefinitions(), [])
	const categories = useMemo(() => {
		const map = new Map<string, NodeTypeDefinition[]>()
		for (const t of types) {
			const existing = map.get(t.category) ?? []
			existing.push(t)
			map.set(t.category, existing)
		}
		return map
	}, [types])

	return (
		<aside id="node-types-sidebar">
			<h3>Node Types</h3>
			{Array.from(categories.entries()).map(([cat, defs]) => (
				<div key={cat} style={{ marginBottom: 12 }}>
					<div className="category-label">{cat}</div>
					{defs.map((def) => (
						<div key={def.type} className="type-item">
							<div className="type-name">{def.label}</div>
							<div className="type-desc">{def.description}</div>
							<div className="type-ports">
								Inputs: {def.inputs.map((p) => p.label).join(', ') || 'none'}
								&nbsp;|&nbsp; Outputs: {def.outputs.map((p) => p.label).join(', ') || 'none'}
							</div>
						</div>
					))}
				</div>
			))}
		</aside>
	)
}

export default function App() {
	const [mode, setMode] = useState<Mode>('visualize')
	const [blueprint, setBlueprint] = useState<WorkflowBlueprint>(initialBlueprint)

	return (
		<div id="app-root">
			<nav id="mode-nav">
				<h1>@flowcraft/tldraw</h1>
				<div id="tabs">
					<button
						type="button"
						className={mode === 'visualize' ? 'active' : ''}
						onClick={() => setMode('visualize')}
					>
						Visualize &amp; Run
					</button>
					<button
						type="button"
						className={mode === 'edit' ? 'active' : ''}
						onClick={() => setMode('edit')}
					>
						Editor
					</button>
					<button
						type="button"
						className={mode === 'crud-demo' ? 'active' : ''}
						onClick={() => setMode('crud-demo')}
					>
						CRUD Demo
					</button>
				</div>
			</nav>

			{mode === 'visualize' ? (
				<main id="canvas-container">
					<FlowcraftCanvas flow={flow} positions={positions} />
				</main>
			) : mode === 'edit' ? (
				<main id="editor-split">
					<div id="editor-canvas">
						<FlowcraftEditor blueprint={blueprint} onBlueprintChange={(bp) => setBlueprint(bp)} />
					</div>
					<aside id="editor-json">
						<pre>{JSON.stringify(blueprint, null, 2)}</pre>
					</aside>
				</main>
			) : (
				<main id="crud-split">
					<NodeTypesSidebar />
					<div id="crud-canvas">
						<FlowcraftEditor blueprint={blueprint} onBlueprintChange={(bp) => setBlueprint(bp)} />
					</div>
					<aside id="crud-info">
						<h3>Canvas Info</h3>
						<p>Nodes: {blueprint.nodes.length}</p>
						<p>Edges: {blueprint.edges.length}</p>
						<hr
							style={{
								border: 'none',
								borderTop: '1px solid #e5e7eb',
								margin: '8px 0',
							}}
						/>
						<h4>CRUD Operations</h4>
						<ul
							style={{
								fontSize: 11,
								color: '#6b7280',
								paddingLeft: 16,
								lineHeight: 1.6,
							}}
						>
							<li>
								<strong>Create</strong>: Use toolbar + Node button
							</li>
							<li>
								<strong>Read</strong>: Ports, status, and connection labels
							</li>
							<li>
								<strong>Update</strong>: Select a node or connection to edit
							</li>
							<li>
								<strong>Delete</strong>: Select + Delete key (cascade removes connections)
							</li>
						</ul>
						<hr
							style={{
								border: 'none',
								borderTop: '1px solid #e5e7eb',
								margin: '8px 0',
							}}
						/>
						<h4>Blueprint</h4>
						<pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
							{JSON.stringify(blueprint, null, 1)}
						</pre>
					</aside>
				</main>
			)}

			<footer id="status-bar">
				{mode === 'edit' && blueprint && (
					<span>
						Nodes: {blueprint.nodes.length} &middot; Edges: {blueprint.edges.length}
					</span>
				)}
				{mode === 'crud-demo' && (
					<span>
						CRUD Demo &mdash; Ports &middot; Connections &middot; Structured Editing &middot;
						Cascade Delete
					</span>
				)}
			</footer>
		</div>
	)
}
