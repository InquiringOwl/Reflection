import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/exo-2/400.css';
import '@fontsource/exo-2/600.css';
import '@fontsource/jetbrains-mono/400.css';
import 'katex/dist/katex.min.css';
import './styles/theme.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
