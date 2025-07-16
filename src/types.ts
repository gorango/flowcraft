import type { Context } from './context'
import type { Logger } from './logger'
import type { AbstractNode } from './workflow'

export type Params = Record<string, any>
export const DEFAULT_ACTION = 'default'

export interface NodeArgs<PrepRes = any, ExecRes = any> {
	ctx: Context
	params: Params
	signal?: AbortSignal
	logger: Logger
	prepRes: PrepRes
	execRes: ExecRes
	error?: Error
}

export interface NodeOptions {
	maxRetries?: number
	wait?: number
}

export interface RunOptions {
	controller?: AbortController
	logger?: Logger
}
