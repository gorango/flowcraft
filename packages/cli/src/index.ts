#!/usr/bin/env node

import { Command } from 'commander'
import { inspectCommand } from './commands/inspect.js'

const program = new Command()

program.name('flowcraft').description('Flowcraft CLI - Workflow observability and debugging').version('0.1.0')
program.addCommand(inspectCommand)
program.parse()
