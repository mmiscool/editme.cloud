
import * as monaco from 'monaco-editor';
import { codeManipulator } from './intelligentMerge.js';
// Ensure this is set before creating the editor
window.MonacoEnvironment = {
    getWorkerUrl: function (workerId, label) {
        return `data:text/javascript;charset=utf-8,${ encodeURIComponent(`
            self.MonacoEnvironment = {
                baseUrl: '${ location.origin }/monaco/'
            };
            importScripts('${ location.origin }/monaco/${ label }.worker.js');
        `) }`;
    }
};
let editor;
export function setup() {
    editor = new TabbedFileEditor(document.body);
}
export class TabbedFileEditor {
    constructor(container) {
        this.container = container;
        this.directoryHandle = null;
        this.filePaths = new Map();
        this.editorArea = null;
        this.fileTreeContainer = null;
        this.currentFileHandle = null;
        this.filePathTextBox = null;
        this.lastEditorContent = '';
        this.watchingFileContent = '';
        this.generateUI();
        this.settingsDialog = new SettingsDialog();
        this.inteligentMergeDialog = new inteligentMergeDialog();
        this.suppressErrorLogging();
        this.startAutoRefresh();
    }
    generateUI() {
        this.clearContainer();
        this.setupContainerStyles();
        this.createToolbar();
        this.createMainContainer();
    }
    clearContainer() {
        this.container.innerHTML = '';
        this.container.style.height = '100%';
        this.container.style.width = '100%';
    }
    setupContainerStyles() {
        this.container.style.margin = '0';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.height = '100vh';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.fontSize = '12px';
    }
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.style.display = 'flex';
        this.toolbar.style.padding = '5px';
        this.toolbar.style.height = '40px';
        this.toolbar.style.alignItems = 'center';
        this.container.appendChild(this.toolbar);
        this.addToolbarButton({
            title: 'Open 📂',
            toolTip: 'Open a folder to edit files',
            callback: () => this.openFolder()
        });
        this.addToolbarButton({
            title: '️⚙️',
            toolTip: 'Open settings dialog',
            callback: () => this.settingsDialog.open()
        });
        this.addToolbarButton({
            title: '+📗',
            toolTip: 'Create a new file in the selected directory',
            callback: () => this.createNewFile()
        });
        this.addToolbarButton({
            title: '↹',
            toolTip: 'Intelligent Merge',
            callback: () => this.inteligentMergeDialog.open()
        });
        this.addToolbarButton({
            title: '🔄',
            toolTip: 'Refresh the file tree',
            callback: () => this.refreshFileTree()
        });
        this.addToolbarButton({
            title: 'ℹ️',
            // About icon
            toolTip: 'About',
            callback: () => this.openAboutPage()
        });
        this.createFilePathTextBox();
    }
    createMainContainer() {
        const mainContainer = document.createElement('div');
        mainContainer.style.display = 'flex';
        mainContainer.style.flex = '1';
        this.container.appendChild(mainContainer);
        this.createFileTreeContainer(mainContainer);
        this.createEditorContainer(mainContainer);
    }
    createFileTreeContainer(mainContainer) {
        this.fileTreeContainer = document.createElement('div');
        this.fileTreeContainer.style.width = '300px';
        this.fileTreeContainer.style.padding = '10px';
        this.fileTreeContainer.style.overflowX = 'scroll';
        this.fileTreeContainer.style.overflowY = 'auto';
        mainContainer.appendChild(this.fileTreeContainer);
    }
    createEditorContainer(mainContainer) {
        const editorContainer = document.createElement('div');
        editorContainer.style.flex = '1';
        editorContainer.style.display = 'flex';
        editorContainer.style.flexDirection = 'column';
        mainContainer.appendChild(editorContainer);
        this.createEditorArea(editorContainer);
    }
    createEditorArea(editorContainer) {
        this.editorArea = document.createElement('div');
        this.editorArea.style.flex = '1';
        this.editorArea.style.width = '100%';
        this.editorArea.style.height = '100%';
        editorContainer.appendChild(this.editorArea);
        this.initializeMonacoEditor();
    }
    initializeMonacoEditor() {
        try {
            this.monacoEditor = monaco.editor.create(this.editorArea, {
                value: '',
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true
            });
        } catch (error) {
        }
    }
    async openFolder() {
        this.directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        this.fileTreeContainer.innerHTML = '';
        const fileTreeTitle = document.createElement('h3');
        fileTreeTitle.textContent = 'File Tree';
        fileTreeTitle.style.marginTop = '0';
        fileTreeTitle.style.fontSize = '18px';
        fileTreeTitle.style.textAlign = 'center';
        this.fileTreeContainer.appendChild(fileTreeTitle);
        await this.listFiles(this.directoryHandle, this.fileTreeContainer);
    }
    async listFiles(directoryHandle, parentElement, currentPath = '') {
        parentElement.innerHTML = '';
        for await (const [name, handle] of directoryHandle.entries()) {
            const fullPath = `${ currentPath }${ name }`;
            this.filePaths.set(handle, fullPath);
            const fileElement = document.createElement('div');
            fileElement.style.padding = '5px';
            fileElement.style.cursor = 'pointer';
            fileElement.dataset.fullPath = fullPath;
            fileElement.dataset.kind = handle.kind;
            fileElement.textContent = handle.kind === 'file' ? `📄 ${ name }` : `📁 ${ name }`;
            fileElement.addEventListener('click', async e => {
                e.stopPropagation();
                if (handle.kind === 'file') {
                    await this.openFile(handle);
                } else if (handle.kind === 'directory') {
                    await this.toggleDirectory(fileElement, handle, fullPath);
                }
            });
            this.setupDragAndDropEvents(fileElement, handle);
            this.setupContextMenu(fileElement, handle);
            // Added context menu setup here
            parentElement.appendChild(fileElement);
        }
    }
    async openFile(fileHandle) {
        const file = await fileHandle.getFile();
        const fileContent = await file.text();
        this.currentFileHandle = fileHandle;
        this.filePathTextBox.value = this.filePaths.get(fileHandle) || '';
        this.monacoEditor.setValue(fileContent);
        this.lastEditorContent = fileContent;
        this.watchingFileContent = fileContent;
        this.highlightActiveFileInTree(this.filePaths.get(fileHandle));
    }
    async autoSave() {
        if (!this.currentFileHandle)
            return;
        const content = await this.monacoEditor.getValue();
        if (this.watchingFileContent === content)
            return await this.checkForFileUpdates(this.currentFileHandle);
        const writable = await this.currentFileHandle.createWritable();
        this.watchingFileContent = content;
        await writable.write(content);
        await writable.close();
        return console.log('Auto-saved successfully.');
    }
    getFilePath(fileHandle) {
        const path = this.filePaths.get(fileHandle);
        if (!path) {
            alert('Oops! The file path vanished into thin air! 🪄');
            throw new Error('File path not found for the provided file handle.');
        }
        return path;
    }
    async showContextMenu(event, handle, fileElement) {
        event.preventDefault();
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'absolute';
        menu.style.top = `${ event.clientY }px`;
        menu.style.left = `${ event.clientX }px`;
        menu.style.padding = '10px';
        menu.style.borderRadius = '5px';
        menu.style.backgroundColor = '#444';
        menu.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
        menu.style.cursor = 'pointer';
        menu.style.zIndex = '1000';
        const createMenuOption = (text, callback) => {
            const option = document.createElement('div');
            option.textContent = text;
            option.style.padding = '5px';
            option.style.cursor = 'pointer';
            option.style.color = '#ffffff';
            option.style.transition = 'background-color 0.3s';
            option.addEventListener('click', () => {
                callback();
                menu.remove();
            });
            option.addEventListener('mouseover', () => {
                option.style.backgroundColor = '#555';
            });
            option.addEventListener('mouseout', () => {
                option.style.backgroundColor = '';
            });
            return option;
        };
        const renameOption = createMenuOption('Rename', () => {
            this.renameFileOrFolder(handle, fileElement);
        });
        const deleteOption = createMenuOption('Delete', () => {
            this.deleteFileOrFolder(handle, fileElement);
        });
        menu.appendChild(renameOption);
        menu.appendChild(deleteOption);
        document.body.appendChild(menu);
        document.addEventListener('click', () => {
            menu.remove();
        }, { once: true });
    }
    async renameFileOrFolder(handle, fileElement) {
        const newName = await prompt('Enter new name:', handle.name);
        if (!newName || newName === handle.name) {
            return;
        }
        try {
            const parentHandle = await this.resolveParentHandle(handle);
            if (handle.kind === 'file') {
                const newFileHandle = await parentHandle.getFileHandle(newName, { create: true });
                const writable = await newFileHandle.createWritable();
                const file = await handle.getFile();
                await writable.write(await file.text());
                await writable.close();
                await parentHandle.removeEntry(handle.name);
                fileElement.textContent = `📄 ${ newName }`;
                this.updateFilePath(handle, `${ parentHandle.path }/${ newName }`);
            } else if (handle.kind === 'directory') {
                const newDirHandle = await parentHandle.getDirectoryHandle(newName, { create: true });
                await this.copyDirectory(handle, newDirHandle);
                await parentHandle.removeEntry(handle.name, { recursive: true });
                fileElement.textContent = `📁 ${ newName }`;
                this.updateFilePath(handle, `${ parentHandle.path }/${ newName }`);
            }
        } catch (error) {
            await alert(`Failed to rename file or folder: ${ error.message }`);
        }
    }
    async copyDirectory(sourceDirHandle, targetDirHandle) {
        for await (const [childName, childHandle] of sourceDirHandle.entries()) {
            if (childHandle.kind === 'file') {
                const file = await childHandle.getFile();
                const writable = await targetDirHandle.getFileHandle(childName, { create: true }).then(fh => fh.createWritable());
                await writable.write(await file.text());
                await writable.close();
            } else if (childHandle.kind === 'directory') {
                const newSubDirHandle = await targetDirHandle.getDirectoryHandle(childName, { create: true });
                await this.copyDirectory(childHandle, newSubDirHandle);
            }
        }
    }
    async getParentDirectoryHandle(handle) {
        try {
            // If we have the path in our map, use it
            const path = this.filePaths.get(handle);
            if (path) {
                const parentPath = path.split('/').slice(0, -1).join('/');
                return await this.resolvePathToHandle(parentPath);
            }
            // Fallback: Try to get parent from directory structure
            let current = this.directoryHandle;
            const entries = [];
            for await (const entry of current.values()) {
                entries.push(entry);
                if (entry === handle) {
                    return current;
                }
                if (entry.kind === 'directory') {
                    const result = await this.findParentInDirectory(entry, handle);
                    if (result)
                        return result;
                }
            }
            return null;
        } catch (error) {
            console.error('Error in getParentDirectoryHandle:', error);
            return null;
        }
    }
    updateFilePath(handle, newPath) {
        // Update the entry in the filePaths map
        this.filePaths.set(handle, newPath);
    }
    async resolveParentHandle(fileHandle) {
        const filePath = this.filePaths.get(fileHandle);
        if (!filePath) {
            console.warn('No file path found for the provided file handle.');
            return null;
        }
        const pathParts = filePath.split('/');
        pathParts.pop();
        let currentHandle = this.directoryHandle;
        // Iterate through the path parts to find the parent directory handle
        for (const part of pathParts) {
            if (!part) {
                continue;
            }
            try {
                currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
            } catch (error) {
                console.error(`Could not resolve the directory handle for part: ${ part }`);
                return null;
            }
        }
        // Return null if a part of the path is not found
        return currentHandle;
    }
    async refreshFileTree() {
        if (!this.directoryHandle)
            return;
        this.fileTreeContainer.innerHTML = '';
        await this.listFiles(this.directoryHandle, this.fileTreeContainer);
    }
    startAutoRefresh() {
        this.stopAutoRefresh();
        // Ensure only one interval is active
        this.autoSave();
        this.fileWatchInterval = setInterval(async () => {
            if (this.currentFileHandle) {
                await this.autoSave();
            }
        }, 1000);
    }
    async highlightActiveFileInTree(filePath) {
        this.clearFileTreeHighlight();
        const fileElement = this.fileTreeContainer.querySelector(`[data-full-path="${ filePath }"]`);
        if (fileElement) {
            fileElement.style.backgroundColor = '#444444';
            fileElement.style.color = '#ffffff';
            let parentElement = fileElement.parentElement;
            while (parentElement && parentElement !== this.fileTreeContainer) {
                const parentFolder = parentElement.previousElementSibling;
                if (parentFolder && parentFolder.dataset.expanded === 'false') {
                    parentFolder.click();
                }
                parentElement = parentElement.parentElement;
            }
        }
    }
    clearFileTreeHighlight() {
        const highlighted = this.fileTreeContainer.querySelector('[data-full-path][style*="background-color"]');
        if (highlighted) {
            highlighted.style.backgroundColor = '';
            highlighted.style.color = '';
        }
    }
    addToolbarButton({title, toolTip, callback}) {
        const button = document.createElement('button');
        button.textContent = title;
        button.title = toolTip;
        button.style.marginRight = '10px';
        button.style.padding = '5px 10px';
        button.style.height = '100%';
        button.style.cursor = 'pointer';
        button.addEventListener('click', callback);
        this.toolbar.appendChild(button);
    }
    async startFileWatcher(fileHandle) {
        this.stopFileWatcher();
        this.fileWatchInterval = setInterval(async () => {
            await this.checkForFileUpdates(fileHandle);
        }, 1000);
    }
    stopFileWatcher() {
        if (this.fileWatchInterval) {
            clearInterval(this.fileWatchInterval);
            this.fileWatchInterval = null;
        }
    }
    async createNewFile() {
        const fileName = await prompt('Enter file name (with extension):');
        if (!fileName)
            return;
        try {
            await this.directoryHandle.getFileHandle(fileName, { create: true });
            console.log(`New file created: ${ fileName }`);
            await this.refreshFileTree();
        } catch (error) {
            console.error('Error creating new file:', error);
        }
    }
    async deleteFileOrFolder(handle, fileElement) {
        const confirmation = await confirm(`Are you sure you want to delete ${ handle.name }?`);
        if (!confirmation) {
            return;
        }
        try {
            const parentHandle = await this.resolveParentHandle(handle);
            if (handle.kind === 'file') {
                await parentHandle.removeEntry(handle.name);
            } else if (handle.kind === 'directory') {
                await parentHandle.removeEntry(handle.name, { recursive: true });
            }
            console.log(`${ handle.kind === 'file' ? 'File' : 'Directory' } deleted successfully.`);
            await this.refreshFileTree();
        } catch (error) {
            console.error('Error deleting file or folder:', error);
            await alert(`Failed to delete: ${ error.message }`);
        }
    }
    async resolvePathToHandle(path) {
        try {
            if (!path)
                return null;
            const parts = path.split('/').filter(part => part.length > 0);
            let currentHandle = this.directoryHandle;
            for (const part of parts) {
                if (!currentHandle)
                    break;
                try {
                    // Try to get as directory first
                    currentHandle = await currentHandle.getDirectoryHandle(part);
                } catch {
                    try {
                        // If not a directory, try as file
                        currentHandle = await currentHandle.getFileHandle(part);
                    } catch {
                        currentHandle = null;
                    }
                }
            }
            return currentHandle;
        } catch (error) {
            console.error('Error resolving path to handle:', error);
            return null;
        }
    }
    async findParentInDirectory(dirHandle, targetHandle) {
        try {
            for await (const entry of dirHandle.values()) {
                if (entry === targetHandle) {
                    return dirHandle;
                }
                if (entry.kind === 'directory') {
                    const result = await this.findParentInDirectory(entry, targetHandle);
                    if (result)
                        return result;
                }
            }
            return null;
        } catch (error) {
            console.warn('Error in findParentInDirectory:', error);
            return null;
        }
    }
    async moveFileToDirectory(sourceHandle, targetDirHandle) {
        const file = await sourceHandle.getFile();
        const content = await file.text();
        const newHandle = await targetDirHandle.getFileHandle(sourceHandle.name, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();
        // Remove original file
        const sourceParent = await this.getParentDirectoryHandle(sourceHandle);
        if (sourceParent) {
            await sourceParent.removeEntry(sourceHandle.name);
        }
        // Update file paths
        const newPath = `${ this.filePaths.get(targetDirHandle) }/${ sourceHandle.name }`;
        this.filePaths.delete(sourceHandle);
        this.filePaths.set(newHandle, newPath);
    }
    async moveFile(draggedData, targetDirHandle) {
        try {
            if (!draggedData || !targetDirHandle) {
                throw new Error('Source or target directory handle is missing');
            }
            const sourceHandle = await this.resolvePathToHandle(draggedData.path);
            if (!sourceHandle) {
                throw new Error('Could not resolve source handle');
            }
            if (draggedData.kind !== 'file' && draggedData.kind !== 'directory') {
                throw new Error('Invalid item type for move operation');
            }
            if (draggedData.kind === 'file') {
                await this.moveFileToTarget(sourceHandle, targetDirHandle);
            } else if (draggedData.kind === 'directory') {
                await this.moveDirectoryToTarget(sourceHandle, targetDirHandle);
            }
            await this.refreshFileTree();
        } catch (error) {
            console.error('Error moving item:', error);
            await alert(`Failed to move: ${ error.message }`);
        }
    }
    async moveFileToTarget(fileHandle, targetDirHandle) {
        const file = await fileHandle.getFile();
        const content = await file.text();
        const newHandle = await targetDirHandle.getFileHandle(fileHandle.name, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();
        const userConfirmation = await confirm('Do you want to move the file? (Press OK to move, Cancel to copy)');
        if (userConfirmation) {
            const sourceParentHandle = await this.getParentDirectoryHandle(fileHandle);
            if (sourceParentHandle) {
                const fileElement = this.fileTreeContainer.querySelector(`[data-full-path="${ this.filePaths.get(fileHandle) }"]`);
                await this.deleteFileOrFolder(fileHandle, fileElement);
            }
        }
        // Use the delete method
        this.updateFilePath(newHandle, `${ this.filePaths.get(targetDirHandle) }/${ fileHandle.name }`);
    }
    async moveDirectoryToTarget(dirHandle, targetDirHandle) {
        const newDirHandle = await targetDirHandle.getDirectoryHandle(dirHandle.name, { create: true });
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
                await this.moveFileToTarget(handle, newDirHandle);
            } else {
                await this.moveDirectoryToTarget(handle, newDirHandle);
            }
        }
        const sourceParentHandle = await this.getParentDirectoryHandle(dirHandle);
        if (sourceParentHandle) {
            await sourceParentHandle.removeEntry(dirHandle.name, { recursive: true });
        }
        this.updateFilePath(newDirHandle, `${ this.filePaths.get(targetDirHandle) }/${ dirHandle.name }`);
        this.filePaths.delete(dirHandle);
    }
    setupDragAndDropEvents(fileElement, handle) {
        fileElement.draggable = true;
        fileElement.addEventListener('dragstart', e => {
            e.stopPropagation();
            const currentPath = this.filePaths.get(handle);
            const dragData = {
                path: currentPath,
                name: handle.name,
                kind: handle.kind
            };
            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
            e.dataTransfer.effectAllowed = 'move';
        });
        fileElement.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        });
        fileElement.addEventListener('drop', async e => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const dragDataStr = e.dataTransfer.getData('application/json');
                const dragData = JSON.parse(dragDataStr);
                if (!dragData || !dragData.path) {
                    throw new Error('Invalid drag data: source path missing');
                }
                const targetDirectory = handle.kind === 'directory' ? handle : await this.getParentDirectoryHandle(handle);
                if (!targetDirectory) {
                    throw new Error('Could not resolve target directory');
                }
                await this.moveFile(dragData, targetDirectory);
                await this.refreshFileTree();
            } catch (error) {
                console.error('Drop error:', error);
                alert(`Failed to move file: ${ error.message }`);
            }
        });
    }
    setupContextMenu(fileElement, handle) {
        fileElement.addEventListener('contextmenu', event => {
            event.preventDefault();
            // prevent other events from firing
            event.stopPropagation();
            this.showContextMenu(event, handle, fileElement);
        });
    }
    async checkForFileUpdates(fileHandle) {
        try {
            const file = await fileHandle.getFile();
            const currentFileContent = await file.text();
            if (currentFileContent !== this.watchingFileContent) {
                this.monacoEditor.setValue(currentFileContent);
                this.lastEditorContent = currentFileContent;
                // Update last editor content
                this.watchingFileContent = currentFileContent;
                // Update tracker after content change
                return console.log('File updated; editor content refreshed.');
            }
        } catch (error) {
            console.error('Failed to read updated file:', error);
        }
    }
    // Suppressing potential error logging in the console
    suppressErrorLogging() {
        const originalError = console.error;
        console.error = (...args) => {
            console.log(args);
        };
    }
    //originalError.apply(console, args);
    stopAutoRefresh() {
        if (this.fileWatchInterval) {
            clearInterval(this.fileWatchInterval);
            this.fileWatchInterval = null;
        }
    }
    async toggleDirectory(fileElement, handle, fullPath) {
        const isExpanded = fileElement.dataset.expanded === 'true';
        // Toggle directory expansion state
        fileElement.dataset.expanded = !isExpanded;
        if (!isExpanded) {
            // Create container for the directory content only if it was not expanded before
            const directoryContent = document.createElement('div');
            directoryContent.style.paddingLeft = '20px';
            directoryContent.style.display = 'block';
            await this.listFiles(handle, directoryContent, `${ fullPath }/`);
            fileElement.appendChild(directoryContent);
        } else {
            // Remove the previously listed files if the directory is collapsed
            const existingContent = fileElement.querySelector('div');
            if (existingContent) {
                fileElement.removeChild(existingContent);
            }
        }
    }
    createFilePathTextBox() {
        this.filePathTextBox = document.createElement('input');
        this.filePathTextBox.style.marginRight = '10px';
        this.filePathTextBox.style.padding = '5px';
        this.filePathTextBox.style.flexGrow = '1';
        this.filePathTextBox.style.height = '100%';
        this.filePathTextBox.disabled = true;
        this.toolbar.appendChild(this.filePathTextBox);
    }
    getEditorContents() {
        try {
            return this.monacoEditor.getValue();
        } catch (error) {
            console.error('Failed to get editor contents:', error);
            return '';
        }
    }
    async setEditorContents(content) {
        try {
            this.monacoEditor.setValue(content);
            await this.autoSave();
        } // Trigger auto-save after setting the contents
        catch (error) {
            console.error('Failed to set editor contents:', error);
        }
    }
    openAboutPage() {
        window.open('https://github.com/mmiscool/editme.cloud', '_blank');
    }
}
export class SettingsDialog {
    constructor() {
        this.dialog = null;
    }
    open() {
        if (!this.dialog) {
            this.createDialog();
        }
        this.dialog.style.display = 'block';
    }
    close() {
        if (this.dialog) {
            this.dialog.style.display = 'none';
        }
    }
    createDialog() {
        this.dialog = document.createElement('div');
        this.dialog.style.position = 'fixed';
        this.dialog.style.top = '30px';
        this.dialog.style.left = '30px';
        this.dialog.style.width = 'calc(100% - 60px)';
        this.dialog.style.height = 'calc(100% - 60px)';
        this.dialog.style.border = '1px solid #ccc';
        this.dialog.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        this.dialog.style.display = 'none';
        this.dialog.style.zIndex = '1001';
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.marginTop = '10px';
        closeButton.addEventListener('click', () => this.close());
        this.dialog.appendChild(closeButton);
        document.body.appendChild(this.dialog);
    }
}
export class inteligentMergeDialog {
    constructor() {
        this.dialog = null;
    }
    open() {
        if (!this.dialog) {
            this.createDialog();
        }
        this.dialog.style.display = 'block';
    }
    close() {
        if (this.dialog) {
            this.dialog.style.display = 'none';
        }
    }
    createDialog() {
        this.dialog = document.createElement('div');
        this.dialog.style.position = 'fixed';
        this.dialog.style.top = '30px';
        this.dialog.style.left = '30px';
        this.dialog.style.width = 'calc(100% - 60px)';
        this.dialog.style.height = 'calc(100% - 60px)';
        this.dialog.style.border = '1px solid #ccc';
        this.dialog.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        this.dialog.style.display = 'none';
        this.dialog.style.zIndex = '1001';
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.marginTop = '10px';
        closeButton.addEventListener('click', () => this.close());
        this.dialog.appendChild(closeButton);
        document.body.appendChild(this.dialog);
        // add a textarea to the dialog
        this.textArea = document.createElement('textarea');
        this.textArea.style.width = 'calc(100% - 20px)';
        this.textArea.style.height = 'calc(100% - 100px)';
        this.textArea.style.margin = '10px';
        this.textArea.style.padding = '10px';
        this.textArea.style.border = '1px solid #ccc';
        this.textArea.style.borderRadius = '5px';
        this.textArea.style.resize = 'none';
        // add hint text to the textarea
        this.textArea.placeholder = 'Paste the code you want to merge here';
        this.dialog.appendChild(this.textArea);
        // add a submit button to the dialog
        const submitButton = document.createElement('button');
        submitButton.textContent = 'AUTO MERGE';
        submitButton.style.margin = '10px';
        submitButton.style.padding = '5px 10px';
        submitButton.style.backgroundColor = '#444';
        submitButton.style.color = '#fff';
        submitButton.style.border = 'none';
        submitButton.style.cursor = 'pointer';
        submitButton.addEventListener('click', async () => {
            const codeTweaker = new codeManipulator(await editor.getEditorContents());
            await codeTweaker.parse();
            await codeTweaker.mergeCode(this.textArea.value);
            await codeTweaker.mergeDuplicates();
            editor.setEditorContents(await codeTweaker.generateCode());
            //this.textArea.value = await codeTweaker.generateCode();
            this.close();
        });
        this.dialog.appendChild(submitButton);
    }
}
