import { Flow } from 'cascade'
import {
	ApplyStyleNode,
	GenerateOutlineNode,
	WriteContentNode,
} from './nodes'

export function createArticleFlow(): Flow {
	const outlineNode = new GenerateOutlineNode()
	const writeContentFlow = new WriteContentNode()
	const styleNode = new ApplyStyleNode()

	outlineNode.next(writeContentFlow)
	writeContentFlow.next(styleNode)

	return new Flow(outlineNode)
}
