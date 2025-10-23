<script setup lang="ts">
import { TransitionPresets, useTransition } from '@vueuse/core'

type Status = 'pending' | 'completed' | 'failed' | 'idle'

const props = withDefaults(defineProps<{
	status?: Status
	progress?: number
	size?: number
}>(), {
	status: 'idle',
	progress: undefined,
	size: 16,
})

const DIAMETER = 24

const statusColors = {
	idle: 'stroke-foreground/20',
	pending: 'stroke-yellow-500',
	completed: 'stroke-green-500',
	failed: 'stroke-red-500',
}

const statusBgColors = {
	idle: 'fill-foreground/20',
	pending: 'fill-yellow-500',
	completed: 'fill-green-500',
	failed: 'fill-red-500',
}

const circumference = computed(() => 2 * Math.PI * (DIAMETER / 2))

const progressValue = computed(() => {
	if (props.progress !== undefined) {
		return circumference.value - (props.progress / 100) * circumference.value
	}
	if (props.status === 'idle') {
		return circumference.value
	}
	if (props.status === 'pending') {
		return circumference.value - 0.2 * circumference.value
	}
	return 0
})

const strokeDashoffset = useTransition(progressValue, {
	duration: 1000,
	transition: TransitionPresets.easeOutCubic,
})

const isSpinning = computed(() => props.status === 'pending')
</script>

<template>
	<div class="inline-flex items-center justify-center">
		<svg
			:width="size"
			:height="size"
			:viewBox="`0 0 ${DIAMETER} ${DIAMETER}`"
			class="transform -rotate-90" :class="[{ 'animate-spin': isSpinning }]"
		>
			<circle
				:cx="DIAMETER / 2"
				:cy="DIAMETER / 2"
				:r="DIAMETER / 2 - 8"
				:class="statusBgColors[status]"
				class="transition-colors duration-400"
			/>
			<circle
				:cx="DIAMETER / 2"
				:cy="DIAMETER / 2"
				:r="DIAMETER / 2 - 2"
				class="stroke-foreground/20"
				stroke-width="4"
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<circle
				v-if="status !== 'idle'"
				:cx="DIAMETER / 2"
				:cy="DIAMETER / 2"
				:r="DIAMETER / 2 - 2"
				:class="statusColors[status]"
				class="transition-colors duration-400"
				stroke-width="4"
				fill="none"
				stroke-linecap="round"
				:stroke-dasharray="circumference"
				:stroke-dashoffset="strokeDashoffset"
				stroke-linejoin="round"
			/>
		</svg>
	</div>
</template>
