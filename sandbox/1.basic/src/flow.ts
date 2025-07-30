import { Flow } from 'flowcraft'
import {
	ApplyStyleNode,
	AssembleDraftNode,
	GenerateOutlineNode,
	WriteContentNode,
} from './nodes'

export function createArticleFlow(): Flow {
	const outlineNode = new GenerateOutlineNode()
	const writeContentFlow = new WriteContentNode()
	const assembleNode = new AssembleDraftNode()
	const styleNode = new ApplyStyleNode()

	outlineNode.next(writeContentFlow)
	writeContentFlow.next(assembleNode, null)
	assembleNode.next(styleNode)

	return new Flow(outlineNode)
}
