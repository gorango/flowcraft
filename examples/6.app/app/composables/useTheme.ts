import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

export const useTheme = createSharedComposable(() => {
	const screen = useBreakpoints(breakpointsTailwind)
	const colorMode = useColorMode()

	function toggleColorMode() {
		colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
	}

	return {
		colorMode,
		toggleColorMode,
		breakpoints: breakpointsTailwind,
		screen,
	}
})
