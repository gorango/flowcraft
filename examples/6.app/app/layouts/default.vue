<script setup lang="ts">
const { toggleColorMode } = useTheme()

const pages = [
	{ name: 'Basic', path: '/basic' },
	{ name: 'Translate', path: '/translate' },
	{ name: 'Research', path: '/research' },
	{ name: 'Declarative', path: '/declarative' },
	{ name: 'RAG', path: '/rag' },
	{ name: 'Simple Examples', path: '/simple-examples' },
]
</script>

<template>
	<header class="border-b">
		<nav class="max-w-6xl w-full mx-auto p-4 flex items-center gap-2">
			<Button
				v-for="page in pages"
				:key="page.path"
				variant="ghost"
				as-child
			>
				<NuxtLink :to="page.path">
					{{ page.name }}
				</NuxtLink>
			</Button>
			<span class="flex-auto" />
			<Button
				size="icon"
				variant="ghost"
				@click="toggleColorMode"
			>
				<Icon name="lucide:moon" />
			</Button>
		</nav>
	</header>
	<slot />
</template>
