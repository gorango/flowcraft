import { Flow } from 'cascade'
import { AnswerQuestionNode, DecideActionNode, SearchWebNode } from './nodes.js'

export function createAgentFlow(): Flow {
	const decideNode = new DecideActionNode()
	const searchNode = new SearchWebNode()
	const answerNode = new AnswerQuestionNode()

	decideNode.next(searchNode, 'search')
	decideNode.next(answerNode, 'answer')
	searchNode.next(decideNode, 'decide')

	return new Flow(decideNode)
}
