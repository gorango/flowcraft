export type NodeDataStatus = 'idle' | 'pending' | 'completed' | 'failed'

const DIAMETER = 16
const RADIUS = 5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const fillColors: Record<NodeDataStatus, string> = {
	idle: 'rgba(107,114,128,0.15)',
	pending: 'rgba(234,179,8,0.5)',
	completed: 'rgba(34,197,94,0.5)',
	failed: 'rgba(239,68,68,0.5)'
}

const strokeColors: Record<NodeDataStatus, string> = {
	idle: 'transparent',
	pending: '#eab308',
	completed: '#22c55e',
	failed: '#ef4444'
}

const dashOffset: Record<NodeDataStatus, number> = {
	idle: CIRCUMFERENCE,
	pending: CIRCUMFERENCE * 0.75,
	completed: 0,
	failed: 0
}

export function StatusIndicator({
	status = 'idle',
	size = 14
}: {
	status?: NodeDataStatus
	size?: number
}) {
	const cx = DIAMETER / 2
	const cy = DIAMETER / 2

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${DIAMETER} ${DIAMETER}`}
			style={{
				transform: 'rotate(-90deg)',
				flexShrink: 0,
				animation: status === 'pending' ? 'spin 1.2s linear infinite' : 'none'
			}}
		>
			<style>{`@keyframes spin { to { transform: rotate(270deg) } }`}</style>
			<circle
				cx={cx}
				cy={cy}
				r={RADIUS - 2}
				fill={fillColors[status]}
				style={{ transition: 'fill 0.3s' }}
			/>
			<circle
				cx={cx}
				cy={cy}
				r={RADIUS}
				stroke="rgba(107,114,128,0.2)"
				strokeWidth="2"
				fill="none"
			/>
			{status !== 'idle' && (
				<circle
					cx={cx}
					cy={cy}
					r={RADIUS}
					stroke={strokeColors[status]}
					strokeWidth="2"
					fill="none"
					strokeLinecap="round"
					strokeDasharray={CIRCUMFERENCE}
					strokeDashoffset={dashOffset[status]}
					style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.3s' }}
				/>
			)}
		</svg>
	)
}
