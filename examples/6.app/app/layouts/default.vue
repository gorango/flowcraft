<script setup lang="ts">
const { toggleColorMode } = useTheme()
</script>

<template>
	<Button
		class="fixed top-4 right-4 z-50"
		size="icon"
		@click="toggleColorMode"
	>
		<Icon name="lucide:moon" />
	</Button>
	<slot />
</template>
