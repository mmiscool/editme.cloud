import { setup } from './TabbedFileEditor.js';
import ollama from '../node_modules/ollama/dist/browser.cjs'
import './dialogs.js';

if ('showOpenFilePicker' in window) {
    setup();
} else {
    alert('Your browser does not support the File System Access API, use Chrome, Edge, or Opera');
    document.body.textContent = 'Your browser does not support the File System Access API, use Chrome, Edge, or Opera';
    document.body.style.fontSize = '2em';
}
