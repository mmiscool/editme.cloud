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


// Usage
const editor = new TabbedFileEditor(document.body);

