import { complexControlFlow, nestedControlFlow } from './complex-control-flow'
import { mainFlow } from './main-flow'
import { complexParallelFlow, parallelFlow } from './parallel-flow'
import { simpleFlow } from './simple-flow'
import { simpleIfElseFlow } from './simple-if-else'
import { simpleParallelFlow } from './simple-parallel'
import { subFlow } from './sub-flow'

// Call them to ensure they are used
mainFlow(null)
simpleFlow(null)
subFlow(null)
parallelFlow(null)
complexParallelFlow(null)
simpleParallelFlow(null)
simpleIfElseFlow(null)
complexControlFlow(null)
nestedControlFlow(null)
