#!/usr/bin/env node
import { cp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillsDir = __dirname
const agentsDir = join(process.cwd(), '.agents/skills/flowcraft')

async function main() {
	await mkdir(agentsDir, { recursive: true })

	const entries = await readdir(skillsDir, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name === 'package.json' || entry.name === 'install.mjs') continue
		const src = join(skillsDir, entry.name)
		const dest = join(agentsDir, entry.name)
		await rm(dest, { recursive: true, force: true })
		await cp(src, dest, { recursive: true })
	}

	// Convert README.md → SKILL.md
	const readmeDest = join(agentsDir, 'README.md')
	const skillDest = join(agentsDir, 'SKILL.md')
	let content = await readFile(readmeDest, 'utf-8')
	// Remove ## Installation block (from its heading to the next ## heading)
	content = content.replace(/^## Installation[\s\S]*?(?=^## )/m, '').trimStart()
	// Replace heading + intro with frontmatter
	content = content.replace(
		/^# @flowcraft\/skills\n\n(.+?)\n\n/,
		(_match, desc) => `---\nname: flowcraft\ndescription: ${desc}\n---\n\n`,
	)
	// Truncate at ## Usage
	const usageIndex = content.indexOf('## Usage')
	const truncated = usageIndex !== -1 ? content.slice(0, usageIndex).trimEnd() + '\n' : content
	await writeFile(skillDest, truncated, 'utf-8')
	await rm(readmeDest)
}

main().catch((err) => {
	console.error('Install failed:', err)
	process.exit(1)
})
