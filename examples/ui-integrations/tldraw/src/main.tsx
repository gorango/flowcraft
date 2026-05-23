import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'tldraw/tldraw.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
