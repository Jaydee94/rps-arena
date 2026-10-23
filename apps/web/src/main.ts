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
// Some demos (the matchup effect gallery) bring a screen of their own instead of App.
const demo = import.meta.env.DEV ? await import('./lib/demo') : null;
if (!demo?.startDemo()) connect();
const root = (await demo?.demoRoot()) ?? App;

export default mount(root, { target });
