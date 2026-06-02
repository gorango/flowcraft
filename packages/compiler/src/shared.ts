import type { NodeDefinition } from 'flowcraft'

export function extractStepMetas(code: string): Map<string, Record<string, unknown>> {
	const metas = new Map<string, Record<string, unknown>>()
	const regex =
		/@step[ \t]*\(\s*({[^}]*})\s*\)[ \t]*\r?\n(?:export\s+)?(?:async\s+)?function\s+(\w+)/g
	let m: RegExpExecArray | null
	m = regex.exec(code)
	while (m) {
		try {
			const params = JSON.parse(m[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'))
			metas.set(m[2], params)
		} catch {
			// ignore malformed JSON in step decorator
		}
		m = regex.exec(code)
	}
	return metas
}

export function preprocessCode(code: string): string {
	return code
		.replace(/^@flow[ \t]*$/gm, '/** @flow */')
		.replace(/^@step(\s*\([^)]*\))?[ \t]*$/gm, '/** @step */')
		.replace(/(\/\*\* @(?:flow|step) \*\/)\s*\n(?!export\s)/g, '$1\nexport ')
}

export function remapNode(
	node: NodeDefinition,
	stepMetas: Map<string, Record<string, unknown>>,
): NodeDefinition {
	const knownTypes = new Set(['sleep', 'wait', 'webhook', 'subflow', 'loop-controller'])
	if (knownTypes.has(node.uses)) {
		return node
	}

	const stepMeta = stepMetas.get(node.uses)
	if (!stepMeta) {
		return node
	}

	return {
		...node,
		params: {
			label: (stepMeta.label as string) ?? node.uses,
			...(stepMeta.description ? { description: stepMeta.description as string } : {}),
			...node.params,
		},
	}
}
