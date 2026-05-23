import type { Editor } from 'tldraw'
import type { WorkflowBlueprint } from 'flowcraft'
import { blueprintToCanvas } from './blueprint-to-canvas'
import { canvasToBlueprint } from './canvas-to-blueprint'

/**
 * Orchestrates bidirectional sync between the tldraw canvas and a
 * Flowcraft WorkflowBlueprint.
 *
 * In **editor mode** (`onBlueprintChange` provided), a store listener watches
 * for user-driven changes and rebuilds the blueprint.
 *
 * In **visualization mode** the listener is not started; the canvas is a
 * static rendering of the blueprint.
 */
export class FlowcraftSync {
	private editor: Editor
	private onBlueprintChange?: (blueprint: WorkflowBlueprint) => void
	private unsubscribe?: () => void
	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private isApplyingBlueprint = false

	constructor(editor: Editor, onBlueprintChange?: (blueprint: WorkflowBlueprint) => void) {
		this.editor = editor
		this.onBlueprintChange = onBlueprintChange
	}

	applyBlueprint(
		blueprint: WorkflowBlueprint,
		positions?: Record<string, { x: number; y: number }>,
	): void {
		this.isApplyingBlueprint = true
		try {
			blueprintToCanvas(this.editor, blueprint, { positions })
		} finally {
			this.isApplyingBlueprint = false
		}
	}

	readBlueprint(): WorkflowBlueprint & { positions: Record<string, { x: number; y: number }> } {
		return canvasToBlueprint(this.editor)
	}

	startListening(): void {
		if (this.unsubscribe || !this.onBlueprintChange) return

		this.unsubscribe = this.editor.store.listen(
			() => {
				if (this.isApplyingBlueprint) return

				if (this.debounceTimer) {
					clearTimeout(this.debounceTimer)
				}

				this.debounceTimer = setTimeout(() => {
					if (!this.onBlueprintChange) return
					const blueprint = this.readBlueprint()
					this.onBlueprintChange(blueprint)
				}, 150)
			},
			{ scope: 'document' },
		)
	}

	stopListening(): void {
		if (this.unsubscribe) {
			this.unsubscribe()
			this.unsubscribe = undefined
		}
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
	}

	dispose(): void {
		this.stopListening()
	}
}
