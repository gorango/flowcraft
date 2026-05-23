import type { Editor, TLShape } from 'tldraw'

export function createCascadeDeleteEffect(editor: Editor): () => void {
	const unsubscribe = editor.sideEffects.registerBeforeDeleteHandler(
		'shape',
		(shape: TLShape) => {
			const bindings = editor.getBindingsToShape(shape.id, 'arrow')
			if (!bindings || bindings.length === 0) return

			const arrowIds = bindings.map((b) => b.fromId)

			if (arrowIds.length > 0) {
				editor.deleteShapes(arrowIds as any)
			}
		},
	)

	if (unsubscribe) return unsubscribe

	return () => {}
}
