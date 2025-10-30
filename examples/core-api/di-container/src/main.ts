import process from 'node:process'
import { runExample } from './example'
import { runAllTestingDemos } from './testing-demo'

async function main() {
	const args = process.argv.slice(2)

	try {
		if (args.includes('--test-demo')) {
			await runAllTestingDemos()
		} else {
			await runExample()
		}
	} catch (error) {
		console.error('Example failed:', error)
		process.exit(1)
	}
}

main()
