import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import App from './App.svelte';
import { connect } from './lib/connection';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

connect();

export default mount(App, { target });
