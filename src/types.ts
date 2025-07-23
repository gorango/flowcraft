import type { Context } from './context'
import type { IExecutor } from './executor'
import type { Logger } from './logger'

export type Params = Record<string, any>
export const DEFAULT_ACTION = Symbol('default')
export const FILTER_FAILED = Symbol('filter_failed')

export interface NodeArgs<PrepRes = any, ExecRes = any> {
	ctx: Context
	params: Params
	signal?: AbortSignal
	logger: Logger
	prepRes: PrepRes
	execRes: ExecRes
	error?: Error
	name?: string
	executor?: IExecutor
}

export interface NodeRunContext {
	ctx: Context
	params: Params
	signal?: AbortSignal
	logger: Logger
	executor?: IExecutor
}

export interface NodeOptions {
	maxRetries?: number
	wait?: number
}

export interface RunOptions {
	controller?: AbortController
	logger?: Logger
	params?: Params
	executor?: IExecutor
}

export type MiddlewareNext = (args: NodeArgs) => Promise<any>
export type Middleware = (args: NodeArgs, next: MiddlewareNext) => Promise<any>
