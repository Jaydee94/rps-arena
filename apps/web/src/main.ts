import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/art.css';
import './styles/animations.css';
import App from './App.svelte';
import { connect } from './lib/connection';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

// Dev-only: ?demo=<screen> renders mock data instead of talking to the server (see lib/demo.ts).
const demo = import.meta.env.DEV ? (await import('./lib/demo')).startDemo() : false;
if (!demo) connect();

export default mount(App, { target });
