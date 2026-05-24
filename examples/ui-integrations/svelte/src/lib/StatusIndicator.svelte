<script lang="ts">
	type NodeDataStatus = 'idle' | 'pending' | 'completed' | 'failed'

	let { status = 'idle', size = 14 }: { status?: NodeDataStatus; size?: number } = $props()

	const DIAMETER = 16
	const RADIUS = 5
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS

	const fillColors: Record<NodeDataStatus, string> = {
		idle: 'rgba(107,114,128,0.15)',
		pending: 'rgba(234,179,8,0.5)',
		completed: 'rgba(34,197,94,0.5)',
		failed: 'rgba(239,68,68,0.5)',
	}

	const strokeColors: Record<NodeDataStatus, string> = {
		idle: 'transparent',
		pending: '#eab308',
		completed: '#22c55e',
		failed: '#ef4444',
	}

	const dashOffset: Record<NodeDataStatus, number> = {
		idle: CIRCUMFERENCE,
		pending: CIRCUMFERENCE * 0.75,
		completed: 0,
		failed: 0,
	}

	const cx = DIAMETER / 2
	const cy = DIAMETER / 2
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 {DIAMETER} {DIAMETER}"
	class="indicator"
	style={status === 'pending' ? 'animation: spin 1.2s linear infinite' : ''}
>
	<circle {cx} {cy} r={RADIUS - 2} fill={fillColors[status]} style="transition: fill 0.3s" />
	<circle {cx} {cy} r={RADIUS} stroke="rgba(107,114,128,0.2)" stroke-width="2" fill="none" />
	{#if status !== 'idle'}
		<circle
			{cx}
			{cy}
			r={RADIUS}
			stroke={strokeColors[status]}
			stroke-width="2"
			fill="none"
			stroke-linecap="round"
			stroke-dasharray={CIRCUMFERENCE}
			stroke-dashoffset={dashOffset[status]}
			style="transition: stroke-dashoffset 0.8s ease-out, stroke 0.3s"
		/>
	{/if}
</svg>

<style>
	.indicator {
		transform: rotate(-90deg);
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(270deg);
		}
	}
</style>
