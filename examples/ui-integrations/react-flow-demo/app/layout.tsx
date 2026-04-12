import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
	title: 'Flowcraft — React Flow Demo',
	description: 'Expense report workflow powered by flowcraft + @xyflow/react'
}

export default function RootLayout({
	children
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className="h-full">
			<body className="h-full antialiased">{children}</body>
		</html>
	)
}
