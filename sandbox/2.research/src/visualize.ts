import { DEFAULT_ACTION, Flow, generateMermaidGraph, Node } from 'flowcraft'

// Re-create the Research Agent flow from the README
class DecideActionNode extends Node {
	async post() {
		// Simulate a decision
		const decision = Math.random() > 0.5 ? 'search' : 'answer'
		console.log(`Decision: ${decision}`)
		return decision
	}
}

class SearchWebNode extends Node { }
class AnswerQuestionNode extends Node { }

const decideNode = new DecideActionNode()
const searchNode = new SearchWebNode()
const answerNode = new AnswerQuestionNode()

// Wire the graph
decideNode.next(searchNode, 'search')
decideNode.next(answerNode, 'answer')
searchNode.next(decideNode, DEFAULT_ACTION) // Loop back

const researchAgentFlow = new Flow(decideNode)

// Generate and print the Mermaid syntax
const mermaidGraph = generateMermaidGraph(researchAgentFlow)
console.log(mermaidGraph)
