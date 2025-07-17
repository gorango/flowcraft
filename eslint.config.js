import antfu from '@antfu/eslint-config'

export default antfu({
	stylistic: {
		indent: 'tab',
		quotes: 'single',
		semi: false,
	},
}, {
	rules: {
		'no-console': 'off',
		'unused-imports/no-unused-vars': 'off',
		'unused-imports/no-unused-imports': 'off',
		'ts/no-this-alias': 'off',
	},
})
