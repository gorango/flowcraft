<script>
export default {
	inheritAttrs: false,
}
</script>

<script setup>
import { computed } from 'vue'
import { getBezierPath, getSmoothStepPath, Position } from '@vue-flow/core'

const props = defineProps({
	id: {
		type: String,
		required: true,
	},
	sourceX: {
		type: Number,
		required: true,
	},
	sourceY: {
		type: Number,
		required: true,
	},
	targetX: {
		type: Number,
		required: true,
	},
	targetY: {
		type: Number,
		required: true,
	},
	sourcePosition: {
		type: String,
		required: true,
	},
	targetPosition: {
		type: String,
		required: true,
	},
	sourceNode: {
		type: Object,
		required: true,
	},
	targetNode: {
		type: Object,
		required: true,
	},
	data: {
		type: Object,
		required: true,
	},
})

const path = computed(() => {
	if (props.sourceNode && props.targetNode) {
		if (props.data.pathType === 'bezier') {
			if (
				(props.sourcePosition === Position.Bottom &&
					props.targetPosition === Position.Top) ||
				(props.sourcePosition === Position.Top && props.targetPosition === Position.Bottom)
			) {
				const radiusX = 60
				const radiusY = props.sourceY - props.targetY

				return [
					`M ${props.sourceX} ${props.sourceY} A ${radiusX} ${radiusY} 0 1 0 ${props.targetX} ${props.targetY}`,
				]
			} else if (
				(props.sourcePosition === Position.Left &&
					props.targetPosition === Position.Right) ||
				(props.sourcePosition === Position.Right && props.targetPosition === Position.Left)
			) {
				const radiusX = (props.sourceX - props.targetX) * 0.6
				const radiusY = 50

				return [
					`M ${props.sourceX} ${props.sourceY} A ${radiusX} ${radiusY} 0 1 0 ${props.targetX} ${props.targetY}`,
				]
			}
		} else if (props.data.pathType === 'smoothstep') {
			let centerX, centerY
			if (props.sourceNode === props.targetNode) {
				if (
					(props.sourcePosition === Position.Bottom &&
						props.targetPosition === Position.Top) ||
					(props.sourcePosition === Position.Top &&
						props.targetPosition === Position.Bottom)
				) {
					const source = props.sourceNode
					centerX = props.sourceX - 40 - source.dimensions.width / 2
					centerY = (props.sourceY + props.targetY) / 2
				} else if (
					(props.sourcePosition === Position.Left &&
						props.targetPosition === Position.Right) ||
					(props.sourcePosition === Position.Right &&
						props.targetPosition === Position.Left)
				) {
					const source = props.sourceNode
					centerX = (props.sourceX + props.targetX) / 2
					centerY = props.sourceY + 40 + source.dimensions.height / 2
				}
			}

			return getSmoothStepPath({
				sourcePosition: props.sourcePosition,
				targetPosition: props.targetPosition,
				centerX,
				centerY,
				...props,
			})
		}
	}

	return getBezierPath(props)
})
</script>

<template>
	<path
		class="vue-flow__connection-path"
		:d="path[0]"
		fill="none"
		stroke-width="1"
		stroke="black"
	/>
</template>
