<script setup lang="ts">
const {
	isRunning,
	executionResult,
	executionError,
	addWorkflowNode,
	runWorkflow,
	clearWorkflow,
} = useWorkflow()

function addStartNode() {
	addWorkflowNode({
		type: 'input',
		position: { x: 100, y: 100 },
		data: { label: 'Start', type: 'start' },
	})
}

function addProcessNode() {
	addWorkflowNode({
		type: 'process',
		position: { x: 300, y: 100 },
		data: { label: 'Process', type: 'process' },
	})
}

function addEndNode() {
	addWorkflowNode({
		type: 'output',
		position: { x: 500, y: 100 },
		data: { label: 'End', type: 'end' },
	})
}
</script>

<template>
	<div class="container mx-auto p-4">
		<Card>
			<CardHeader>
				<CardTitle>Workflow Builder</CardTitle>
			</CardHeader>

			<CardContent>
				<div class="mb-4 flex gap-2">
					<Button @click="addStartNode">
						Add Start Node
					</Button>
					<Button @click="addProcessNode">
						Add Process Node
					</Button>
					<Button @click="addEndNode">
						Add End Node
					</Button>
					<Button :disabled="isRunning" @click="runWorkflow">
						{{ isRunning ? 'Running...' : 'Run Workflow' }}
					</Button>
					<Button variant="outline" @click="clearWorkflow">
						Clear
					</Button>
				</div>

				<Flow />

				<div v-if="executionResult" class="mt-4 p-4 bg-green-100 rounded">
					<h3 class="font-bold">
						Execution Result:
					</h3>
					<pre>{{ JSON.stringify(executionResult, null, 2) }}</pre>
				</div>

				<div v-if="executionError" class="mt-4 p-4 bg-red-100 rounded">
					<h3 class="font-bold">
						Execution Error:
					</h3>
					<p>{{ executionError }}</p>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
