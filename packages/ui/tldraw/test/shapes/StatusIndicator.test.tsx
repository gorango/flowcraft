// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { StatusIndicator } from '../../src/shapes/StatusIndicator'

function render(status?: any, size?: any): string {
	return renderToStaticMarkup(createElement(StatusIndicator, { status, size }))
}

function extractAttr(html: string, selector: string, attr: string): string | null {
	const match = html.match(new RegExp(`<${selector}\\s[^>]*${attr}="([^"]*)"`, 'i'))
	return match?.[1] ?? null
}

function countTags(html: string, tag: string): number {
	return (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length
}

describe('StatusIndicator', () => {
	it('renders an SVG element', () => {
		const html = render()
		expect(html).toContain('<svg')
		expect(html).toContain('</svg>')
	})

	it('renders idle status with expected fill and no stroke circle', () => {
		const html = render('idle')
		expect(extractAttr(html, 'circle', 'fill')).toBe('rgba(107,114,128,0.15)')
		// idle has 2 circles (fill + track), no 3rd stroke circle
		expect(countTags(html, 'circle')).toBe(2)
	})

	it('renders pending status with yellow fill and stroke', () => {
		const html = render('pending')
		expect(extractAttr(html, 'circle', 'fill')).toBe('rgba(234,179,8,0.5)')
		// pending has 3 circles (fill + track + stroke)
		expect(countTags(html, 'circle')).toBe(3)
	})

	it('renders completed status with green fill and stroke', () => {
		const html = render('completed')
		expect(extractAttr(html, 'circle', 'fill')).toBe('rgba(34,197,94,0.5)')
		expect(countTags(html, 'circle')).toBe(3)
	})

	it('renders failed status with red fill and stroke', () => {
		const html = render('failed')
		expect(extractAttr(html, 'circle', 'fill')).toBe('rgba(239,68,68,0.5)')
		expect(countTags(html, 'circle')).toBe(3)
	})

	it('applies size prop to SVG width and height', () => {
		const html = render(undefined, 24)
		expect(extractAttr(html, 'svg', 'width')).toBe('24')
		expect(extractAttr(html, 'svg', 'height')).toBe('24')
	})

	it('defaults to idle status and size 14 when no props provided', () => {
		const html = render()
		expect(extractAttr(html, 'svg', 'width')).toBe('14')
		expect(extractAttr(html, 'svg', 'height')).toBe('14')
		expect(extractAttr(html, 'circle', 'fill')).toBe('rgba(107,114,128,0.15)')
	})
})
