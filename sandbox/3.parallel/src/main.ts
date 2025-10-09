import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { FlowcraftRuntime } from 'flowcraft'
import { createTranslateFlow } from './flow.js'

dotenv.config()

async function main() {
	const sourceReadmePath = path.resolve(process.cwd(), '../../README.md')
	const outputDir = path.resolve(process.cwd(), 'translations')
	await fs.mkdir(outputDir, { recursive: true })

	const text = (await fs.readFile(sourceReadmePath, 'utf-8'))
		.split('##')
		.slice(0, 2)
		.join('##')

	const languages = [
		'Chinese',
		'Spanish',
		'Japanese',
		'German',
		// 'Russian',
		// 'Portuguese',
		// 'French',
		// 'Korean',
	]

	const translateFlow = createTranslateFlow()
	const blueprint = translateFlow.toBlueprint()
	const functionRegistry = translateFlow.getFunctionRegistry()

	const runtime = new FlowcraftRuntime({ registry: {} })

	console.log(`Starting parallel translation into ${languages.length} languages...`)
	const startTime = Date.now()

	await runtime.run(
		blueprint,
		{ text, languages, output_dir: outputDir },
		functionRegistry,
	)

	const duration = (Date.now() - startTime) / 1000
	console.log(`\nTotal parallel translation time: ${duration.toFixed(2)} seconds`)
	console.log('\n=== Translation Complete ===')
}

main().catch(console.error)
