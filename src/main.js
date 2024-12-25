import { TabbedFileEditor } from './TabbedFileEditor.js';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register(new URL('./sw.js', import.meta.url))
        .then((registration) => {
            console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch((error) => {
            console.error('Service Worker registration failed:', error);
        });
}

if ('showOpenFilePicker' in window) {
    const editor = new TabbedFileEditor(document.body);
} else {
    alert('Your browser does not support the File System Access API, use Chrome, Edge, or Opera');
    document.body.textContent = 'Your browser does not support the File System Access API, use Chrome, Edge, or Opera';
    document.body.style.fontSize = '2em';
}
