<script lang="ts">
	import { getBezierPath, Position, type EdgeProps } from '@xyflow/svelte'

	let { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps = $props()

	let d = $derived(computePath())

	function computePath(): string {
		const pathType = (data as any)?.pathType
		if (pathType === 'bezier') {
			if (
				(sourcePosition === Position.Bottom && targetPosition === Position.Top) ||
				(sourcePosition === Position.Top && targetPosition === Position.Bottom)
			) {
				const radiusX = 60
				const radiusY = Math.abs(sourceY - targetY) || 80
				return `M ${sourceX} ${sourceY} A ${radiusX} ${radiusY} 0 1 0 ${targetX} ${targetY}`
			}
			const radiusX = Math.abs(sourceX - targetX) * 0.6 || 80
			const radiusY = 50
			return `M ${sourceX} ${sourceY} A ${radiusX} ${radiusY} 0 1 0 ${targetX} ${targetY}`
		}
		const [path] = getBezierPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition,
			targetPosition,
		})
		return path
	}
</script>

<path
	{d}
	fill="none"
	stroke="hsl(var(--muted-foreground))"
	stroke-width={1.5}
	stroke-dasharray="6 3"
	stroke-opacity={0.7}
	stroke-linecap="round"
/>
<path
	{d}
	fill="none"
	stroke="hsl(var(--primary))"
	stroke-width={1.5}
	stroke-dasharray="6 24"
	stroke-opacity={0.5}
	stroke-linecap="round"
	class="dash-anim"
/>

<style>
	.dash-anim {
		animation: loopback-dash 1.5s linear infinite;
	}

	@keyframes loopback-dash {
		to {
			stroke-dashoffset: -30;
		}
	}
</style>
