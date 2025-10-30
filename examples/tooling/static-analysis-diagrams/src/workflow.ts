import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	workflow: any
	structure: any
	diagram: string
	validated: boolean
}

// ============================================================================
// STATIC ANALYSIS DIAGRAM NODES
// ============================================================================

async function analyzeStructure(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📊 Analyzing workflow structure...')
	const workflow = await context.get('workflow')
	const nodes = workflow.nodes
	const edges = workflow.edges

	// Simple analysis
	const analysis = {
		nodes: nodes.length,
		edges: edges.length,
		connectedNodes: new Set([...edges.map((e: any) => e.source), ...edges.map((e: any) => e.target)]).size,
		isolatedNodes: nodes.filter((n: any) => !edges.some((e: any) => e.source === n.id || e.target === n.id)).length,
	}

	await context.set('analysis', analysis)
	return { output: 'Structure analyzed' }
}

async function generateDiagram(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📈 Generating workflow diagram...')
	const workflow = await context.get('workflow')
	const analysis = await context.get('analysis')

	// Generate ASCII diagram
	let diagram = `Workflow: ${workflow.id}\n`
	diagram += `${'='.repeat(40)}\n\n`

	workflow.nodes.forEach((node: any, i: number) => {
		diagram += `${i + 1}. ${node.id}\n`
	})

	diagram += '\nConnections:\n'
	workflow.edges.forEach((edge: any) => {
		diagram += `  ${edge.source} --> ${edge.target}\n`
	})

	diagram += `\nStatistics:\n`
	diagram += `  Total nodes: ${analysis.nodes}\n`
	diagram += `  Total edges: ${analysis.edges}\n`
	diagram += `  Connected nodes: ${analysis.connectedNodes}\n`
	diagram += `  Isolated nodes: ${analysis.isolatedNodes}\n`

	await context.set('diagram', diagram)
	return { output: 'Diagram generated' }
}

async function validateDiagram(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('✅ Validating diagram...')
	const diagram = await context.get('diagram')
	if (!diagram || diagram.length < 10) {
		throw new Error('Invalid diagram generated')
	}
	await context.set('diagramValid', true)
	return { output: 'Diagram validated' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a static analysis diagrams workflow */
export function createStaticAnalysisDiagramsWorkflow() {
	return createFlow<WorkflowContext>('static-analysis-diagrams-workflow')
		.node('analyzeStructure', analyzeStructure)
		.node('generateDiagram', generateDiagram)
		.node('validateDiagram', validateDiagram)
		.edge('analyzeStructure', 'generateDiagram')
		.edge('generateDiagram', 'validateDiagram')
}
