<script lang="ts">
	import StatusIndicator from '../StatusIndicator.svelte'

	export interface NodeData {
		inputs?: any
		outputs?: any
		contextChanges?: Record<string, any>
		status?: 'idle' | 'pending' | 'completed' | 'failed'
	}

	let { label, nodeData }: { label: string; nodeData: NodeData } = $props()

	const hasInputs = $derived(nodeData.inputs !== undefined && nodeData.inputs !== null)
	const hasOutputs = $derived(nodeData.outputs !== undefined && nodeData.outputs !== null)
</script>

<div class="node-card">
	<div class="header">
		<StatusIndicator status={nodeData.status || 'idle'} />
		<span class="label">{label}</span>
	</div>

	{#if hasInputs}
		<div class="section">
			<div class="section-title">Inputs</div>
			<div class="code-block">
				<pre class="code">{JSON.stringify(nodeData.inputs, null, 1)}</pre>
			</div>
		</div>
	{/if}

	{#if hasOutputs}
		<div class="section">
			<div class="section-title">Outputs</div>
			<div class="code-block">
				<pre class="code">{JSON.stringify(nodeData.outputs, null, 1)}</pre>
			</div>
		</div>
	{/if}

	{#if !hasInputs && !hasOutputs}
		<div class="waiting">Waiting for data...</div>
	{/if}
</div>

<style>
	.node-card {
		width: 12rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: var(--radius-lg);
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.label {
		font-weight: 600;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.section {
		font-size: 0.75rem;
	}

	.section-title {
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.25rem;
	}

	.code-block {
		background: hsl(var(--muted));
		border-radius: 0.25rem;
		padding: 0.375rem;
	}

	.code {
		max-height: 5rem;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 0.625rem;
		line-height: 1.25;
		margin: 0;
		user-select: text;
		cursor: text;
	}

	.code::-webkit-scrollbar {
		width: 4px;
		height: 4px;
	}

	.code::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 2px;
	}

	.waiting {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}
</style>
