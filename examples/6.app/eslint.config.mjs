// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
	{
		stylistic: {
			indent: 'tab',
			quotes: 'single',
			semi: false,
		},
		ignores: [
			'**/*.md',
			'**/*.d.ts',
		],
	},
	{
		rules: {
			'no-console': 'off',
			'unused-imports/no-unused-vars': 'off',
			'unused-imports/no-unused-imports': 'off',
			'test/prefer-lowercase-title': 'off',
		},
	},
)
