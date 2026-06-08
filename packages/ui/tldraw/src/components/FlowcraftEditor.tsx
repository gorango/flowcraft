'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tldraw, defaultShapeUtils } from 'tldraw'
import type { Editor, TLAnyShapeUtilConstructor } from 'tldraw'
import type { WorkflowBlueprint } from 'flowcraft'
import { FlowcraftNodeUtil } from '../shapes/FlowcraftNodeUtil'
import type { FlowcraftEditorProps } from '../shapes/types'
import { FlowcraftSync } from '../sync/FlowcraftSync'
import { WorkflowToolbar } from './WorkflowToolbar'

const shapeUtils: TLAnyShapeUtilConstructor[] = [FlowcraftNodeUtil, ...defaultShapeUtils]

export function FlowcraftEditor({ blueprint, onBlueprintChange, className }: FlowcraftEditorProps) {
	const syncRef = useRef<FlowcraftSync | null>(null)
	const [editor, setEditor] = useState<Editor | null>(null)
	const [toolMode, setToolMode] = useState<'select' | 'add-node'>('select')

	const handleMount = useCallback(
		(ed: Editor) => {
			setEditor(ed)

			const sync = new FlowcraftSync(ed, (bp: WorkflowBlueprint) => {
				onBlueprintChange?.(bp)
			})
			syncRef.current = sync

			if (blueprint) {
				sync.applyBlueprint(blueprint)
			}

			sync.startListening()
		},
		[blueprint, onBlueprintChange],
	)

	useEffect(() => {
		return () => {
			syncRef.current?.dispose()
			syncRef.current = null
		}
	}, [])

	return (
		<div style={{ position: 'relative', width: '100%', height: '100%' }} className={className}>
			<Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
			<WorkflowToolbar editor={editor} mode={toolMode} onModeChange={setToolMode} />
		</div>
	)
}
