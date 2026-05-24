<script setup lang="ts">
import { computed } from 'vue'
type Status = 'pending' | 'completed' | 'failed' | 'idle'

const props = withDefaults(
	defineProps<{
		status?: Status
		size?: number
	}>(),
	{
		status: 'idle',
		size: 14,
	},
)

const DIAMETER = 16
const RADIUS = 5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const fillColors: Record<Status, string> = {
	idle: 'rgba(107,114,128,0.15)',
	pending: 'rgba(234,179,8,0.5)',
	completed: 'rgba(34,197,94,0.5)',
	failed: 'rgba(239,68,68,0.5)',
}

const strokeColors: Record<Status, string> = {
	idle: 'transparent',
	pending: '#eab308',
	completed: '#22c55e',
	failed: '#ef4444',
}

const dashOffset = computed(() => {
	switch (props.status) {
		case 'idle':
			return CIRCUMFERENCE
		case 'pending':
			return CIRCUMFERENCE * 0.75
		case 'completed':
			return 0
		case 'failed':
			return 0
	}
})

const isSpinning = computed(() => props.status === 'pending')
</script>

<template>
	<div class="inline-flex items-center justify-center">
		<svg
			:width="size"
			:height="size"
			:viewBox="`0 0 ${DIAMETER} ${DIAMETER}`"
			class="transform -rotate-90"
			:class="[{ 'animate-spin': isSpinning }]"
		>
			<circle
				:cx="DIAMETER / 2"
				:cy="DIAMETER / 2"
				:r="RADIUS - 2"
				:fill="fillColors[status]"
				class="transition-colors duration-300"
			/>
			<circle
				:cx="DIAMETER / 2"
				:cy="DIAMETER / 2"
				:r="RADIUS"
				stroke="rgba(107,114,128,0.2)"
				stroke-width="2"
				fill="none"
			/>
			<circle
				v-if="status !== 'idle'"
				:cx="DIAMETER / 2"
				:cy="DIAMETER / 2"
				:r="RADIUS"
				:stroke="strokeColors[status]"
				stroke-width="2"
				fill="none"
				stroke-linecap="round"
				:stroke-dasharray="CIRCUMFERENCE"
				:stroke-dashoffset="dashOffset"
				class="transition-all duration-800 ease-out"
			/>
		</svg>
	</div>
</template>

<style scoped>
@keyframes spin {
	to {
		transform: rotate(270deg);
	}
}

.animate-spin {
	animation: spin 1.2s linear infinite;
}

.transition-all {
	transition-property: all;
}

.duration-800 {
	transition-duration: 800ms;
}

.ease-out {
	transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
</style>
