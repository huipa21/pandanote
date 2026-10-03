import { mount } from 'svelte';
import MarkdownFixture from './MarkdownFixture.svelte';
document.documentElement.dataset.theme = 'light';
mount(MarkdownFixture, { target: document.getElementById('app')! });
