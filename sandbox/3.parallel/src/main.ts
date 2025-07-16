import type { Context } from 'cascade'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { TypedContext } from 'cascade'
import dotenv from 'dotenv'
import { TranslateFlow, TranslateNode } from './nodes'

dotenv.config()

async function main() {
	const sourceReadmePath = path.resolve(process.cwd(), '../../README.md')
	const outputDir = path.resolve(process.cwd(), 'translations')
	await fs.mkdir(outputDir, { recursive: true })

	const text = await fs.readFile(sourceReadmePath, 'utf-8')
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

	const context: Context = new TypedContext([
		['text', text],
		['languages', languages],
		['output_dir', outputDir],
	])

	const flow = new TranslateFlow(new TranslateNode())
	console.log(`Starting parallel translation into ${languages.length} languages...`)
	const startTime = Date.now()

	await flow.run(context)

	const duration = (Date.now() - startTime) / 1000
	console.log(`\nTotal parallel translation time: ${duration.toFixed(2)} seconds`)
	console.log('\n=== Translation Complete ===')
}

main().catch(console.error)
