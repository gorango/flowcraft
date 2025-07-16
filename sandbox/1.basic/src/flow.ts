import { Flow } from 'cascade'
import {
	ApplyStyleNode,
	GenerateOutlineNode,
	WriteContentNode,
	WriteSingleSectionNode,
} from './nodes'

export function createArticleFlow(): Flow {
	const outlineNode = new GenerateOutlineNode()
	const writeContentFlow = new WriteContentNode(new WriteSingleSectionNode())
	const styleNode = new ApplyStyleNode()

	outlineNode.next(writeContentFlow)
	writeContentFlow.next(styleNode)

	return new Flow(outlineNode)
}
