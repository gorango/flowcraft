'use client'

import { getBezierPath, Position, type EdgeProps } from '@xyflow/react'

/**
 * Custom edge that draws an arc for loopback connections (e.g. loop retries).
 *
 * Flowcraft marks these edges with `data.isLoopback = true` and
 * `data.pathType = 'bezier'` in the UIGraph output. The arc direction is
 * inferred from the source/target handle positions:
 *  - Top/Bottom handles → horizontal arc
 *  - Left/Right handles → vertical arc
 */
export function LoopbackEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data
}: EdgeProps) {
	let d: string

	const pathType = (data as any)?.pathType

	if (pathType === 'bezier') {
		if (
			(sourcePosition === Position.Bottom && targetPosition === Position.Top) ||
			(sourcePosition === Position.Top && targetPosition === Position.Bottom)
		) {
			const radiusX = 60
			const radiusY = Math.abs(sourceY - targetY) || 80
			d = `M ${sourceX} ${sourceY} A ${radiusX} ${radiusY} 0 1 0 ${targetX} ${targetY}`
		} else {
			// LR layout — arc curves around behind the node
			const radiusX = Math.abs(sourceX - targetX) * 0.6 || 80
			const radiusY = 50
			d = `M ${sourceX} ${sourceY} A ${radiusX} ${radiusY} 0 1 0 ${targetX} ${targetY}`
		}
	} else {
		const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
		d = path
	}

	return (
		<>
			<path
				id={id}
				d={d}
				fill="none"
				stroke="hsl(var(--muted-foreground))"
				strokeWidth={1.5}
				strokeDasharray="6 3"
				strokeOpacity={0.7}
				strokeLinecap="round"
			/>
			<path
				d={d}
				fill="none"
				stroke="hsl(var(--primary))"
				strokeWidth={1.5}
				strokeDasharray="6 24"
				strokeOpacity={0.5}
				strokeLinecap="round"
				style={{ animation: 'loopback-dash 1.5s linear infinite' }}
			/>
			<style>{`@keyframes loopback-dash { to { stroke-dashoffset: -30; } }`}</style>
		</>
	)
}
