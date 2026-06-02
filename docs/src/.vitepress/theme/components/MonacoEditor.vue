<script setup lang="ts">
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

if (typeof self !== 'undefined') {
	self.MonacoEnvironment = {
		getWorker(_: string, label: string) {
			if (label === 'typescript' || label === 'javascript') return new tsWorker()
			return new editorWorker()
		},
	}
}

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLDivElement>()
let editor: any = null

onMounted(async () => {
	const monaco = await import('monaco-editor')

	monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
		experimentalDecorators: true,
		strict: true,
		target: monaco.languages.typescript.ScriptTarget.ESNext,
		moduleResolution: monaco.languages.typescript.ModuleResolutionKind.Bundler,
	})

	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
		diagnosticCodesToIgnore: [1206],
	})

	monaco.languages.typescript.typescriptDefaults.addExtraLib(
		[
			'declare function flow(target: any, context: any): any',
			'declare function step(params?: Record<string, unknown>): any',
		].join('\n'),
		'ts:flowcraft-decorators.d.ts',
	)

	monaco.languages.typescript.typescriptDefaults.addExtraLib(
		[
			'declare module "flowcraft" {',
			'  export interface NodeContext<TInput = any> {',
			'    context: IAsyncContext',
			'    input?: TInput',
			'    params: Record<string, any>',
			'    signal?: AbortSignal',
			'  }',
			'  export interface IAsyncContext {',
			'    get<T>(key: string): Promise<T | undefined>',
			'    set(key: string, value: any): Promise<void>',
			'  }',
			'}',
		].join('\n'),
		'ts:flowcraft-types.d.ts',
	)

	const uri = monaco.Uri.parse('file:///input.ts')
	const model = monaco.editor.createModel(props.modelValue, 'typescript', uri)
	editor = monaco.editor.create(container.value!, {
		model,
		theme: 'vs-dark',
		minimap: { enabled: false },
		fontSize: 13,
		lineNumbers: 'on',
		scrollBeyondLastLine: false,
		automaticLayout: true,
		tabSize: 2,
		wordWrap: 'off',
	})

	editor.onDidChangeModelContent(() => {
		emit('update:modelValue', editor.getValue())
	})
})

watch(
	() => props.modelValue,
	(val) => {
		if (editor && val !== editor.getValue()) {
			const model = editor.getModel()
			if (model) {
				model.setValue(val)
			}
		}
	},
)

onBeforeUnmount(() => {
	editor?.dispose()
})
</script>

<template>
	<div ref="container" class="flex-auto h-full min-h-0 overflow-hidden" />
</template>
