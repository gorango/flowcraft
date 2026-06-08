import ts from 'typescript'
import type { FlowAnalyzer } from '../flow-analyzer'

export function handleTryStatement(analyzer: FlowAnalyzer, node: ts.TryStatement): string | null {
	// scan catch block to find fallback node
	let fallbackNodeId: string | null = null
	if (node.catchClause) {
		const savedUsageCounts = new Map(analyzer.state.getUsageCounts())
		const nodesBeforeCatch = analyzer.state.getNodes().length
		const edgesBeforeCatch = analyzer.state.getEdges().length
		analyzer.state.pushScope({ variables: new Map() })

		// register catch variable (e.g., `catch (error)`)
		if (
			node.catchClause.variableDeclaration &&
			ts.isIdentifier(node.catchClause.variableDeclaration.name)
		) {
			const varName = node.catchClause.variableDeclaration.name.text
			// special variable pointing to failed node's error details
			const currentScope = analyzer.state.getScopes()[analyzer.state.getScopes().length - 1]
			currentScope.variables.set(varName, {
				nodeId: '_catch_error',
				type: analyzer.typeChecker.getTypeAtLocation(node.catchClause.variableDeclaration),
				variableType: 'normal',
			})
		}

		// push null fallback scope to isolate catch block from outer fallback
		const savedFallback = analyzer.state.getFallbackScope()
		analyzer.state.setFallbackScope(null)
		analyzer.traverse(node.catchClause.block)
		analyzer.state.setFallbackScope(savedFallback)

		fallbackNodeId =
			analyzer.state.getNodes().length > nodesBeforeCatch
				? analyzer.state.getNodes()[nodesBeforeCatch].id
				: null
		analyzer.state.getNodes().splice(nodesBeforeCatch)
		analyzer.state.getEdges().splice(edgesBeforeCatch)
		analyzer.state.setCursor(null)
		analyzer.state.setUsageCounts(savedUsageCounts)
		analyzer.state.popScope()
	}

	analyzer.state.setFallbackScope(fallbackNodeId)

	const lastInTry = analyzer.traverse(node.tryBlock)

	analyzer.state.setFallbackScope(null)

	let lastInCatch: string | null = null
	if (node.catchClause) {
		analyzer.state.pushScope({ variables: new Map() })

		// register catch variable again for real traversal
		if (
			node.catchClause.variableDeclaration &&
			ts.isIdentifier(node.catchClause.variableDeclaration.name)
		) {
			const varName = node.catchClause.variableDeclaration.name.text
			const currentScope = analyzer.state.getScopes()[analyzer.state.getScopes().length - 1]
			currentScope.variables.set(varName, {
				nodeId: '_catch_error',
				type: analyzer.typeChecker.getTypeAtLocation(node.catchClause.variableDeclaration),
				variableType: 'normal',
			})
		}

		// clear fallback inside catch to prevent infinite loops
		const savedFallback = analyzer.state.getFallbackScope()
		analyzer.state.setFallbackScope(null)
		lastInCatch = analyzer.traverse(node.catchClause.block)
		analyzer.state.setFallbackScope(savedFallback)

		analyzer.state.popScope()
	}

	const ends: (string | null)[] = [lastInTry]
	if (lastInCatch) ends.push(lastInCatch)

	// finally block: route both try and catch exits through finally
	if (node.finallyBlock) {
		analyzer.state.pushScope({ variables: new Map() })
		analyzer.state.setPendingBranches({
			ends: ends.filter((e): e is string => e !== null),
			joinStrategy: 'any',
		})
		const lastInFinally = analyzer.traverse(node.finallyBlock)
		analyzer.state.popScope()
		analyzer.state.setPendingBranches({
			ends: lastInFinally ? [lastInFinally] : ends.filter((e): e is string => e !== null),
			joinStrategy: 'any',
		})
		return null
	}

	analyzer.state.setPendingBranches({
		ends: ends.filter((e): e is string => e !== null),
		joinStrategy: 'any',
	})

	return null
}
