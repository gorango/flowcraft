<script setup lang="ts">
</script>

<template>
	<div class="w-64 flex flex-col gap-2 p-2 rounded-lg bg-muted/80 backdrop-blur-sm">
		<slot />
	</div>
</template>

<style>
.flowcraft_node.selected,
.flowcraft_node.selected:hover {
	box-shadow: 0 0 0 0.5px var(--color-primary-foreground);
}

.flowcraft_node.selected,
.flowcraft_node:focus,
.flowcraft_node:focus-visible {
	outline: none;
	border: 1px solid var(--color-border);
}

.flowcraft_node.selectable:hover {
	box-shadow: 0 1px 4px 1px rgba(0, 0, 0, 0.08);
}

.flowcraft_node .vue-flow__handle {
	background: var(--color-muted-foreground);
}
</style>
