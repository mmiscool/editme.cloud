
import * as monaco from 'monaco-editor';
export class TabbedFileEditor {
    constructor(container) {
        this.container = container;
        this.directoryHandle = null;
        this.filePaths = new Map();
        this.editorArea = null;
        this.tabBar = null;
        this.fileTreeContainer = null;
        this.currentFileHandle = null;
        this.fileTreeSnapshot = null;
        this.generateUI();
    }
    generateUI() {
        this.clearContainer();
        this.setupContainerStyles();
        this.createToolbar();
        this.createMainContainer();
    }
    clearContainer() {
        this.container.innerHTML = '';
    }
    setupContainerStyles() {
        this.container.style.margin = '0';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.height = '100vh';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.color = '#ffffff';
        this.container.style.fontSize = '12px';
    }
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.style.display = 'flex';
        this.toolbar.style.backgroundColor = '#2e2e2e';
        this.toolbar.style.padding = '5px';
        this.toolbar.style.height = '40px';
        this.toolbar.style.alignItems = 'center';
        this.container.appendChild(this.toolbar);
        this.addToolbarButton({
            title: 'Open Folder',
            toolTip: 'Open a folder to edit files',
            callback: () => this.openFolder()
        });
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
        this.fileTreeContainer.style.backgroundColor = '#2e2e2e';
        this.fileTreeContainer.style.color = '#ffffff';
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
        editorContainer.style.backgroundColor = '#1e1e1e';
        mainContainer.appendChild(editorContainer);
        this.createTabBar(editorContainer);
        this.createEditorArea(editorContainer);
    }
    createTabBar(editorContainer) {
        this.tabBar = document.createElement('div');
        this.tabBar.style.display = 'flex';
        this.tabBar.style.backgroundColor = '#3e3e3e';
        this.tabBar.style.padding = '5px';
        this.tabBar.style.height = '30px';
        editorContainer.appendChild(this.tabBar);
    }
    createEditorArea(editorContainer) {
        this.editorArea = document.createElement('div');
        this.editorArea.style.flex = '1';
        this.editorArea.style.width = '100%';
        this.editorArea.style.height = 'calc(100% - 40px)';
        editorContainer.appendChild(this.editorArea);
        this.initializeMonacoEditor();
    }
    initializeMonacoEditor() {
        this.monacoEditor = monaco.editor.create(this.editorArea, {
            value: '',
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: false
        });
        this.monacoEditor.onDidChangeModelContent(() => {
            this.autoSave();
        });
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
        this.addNewFileButton();
        // Add new file button here
        await this.listFiles(this.directoryHandle, this.fileTreeContainer);
    }
    async listFiles(directoryHandle, parentElement, currentPath = '', expandedPaths = new Set()) {
        for await (const [name, handle] of directoryHandle.entries()) {
            const fullPath = `${ currentPath }/${ name }`;
            this.filePaths.set(handle, fullPath);
            const fileElement = document.createElement('div');
            fileElement.style.padding = '5px';
            fileElement.style.cursor = 'pointer';
            fileElement.dataset.fullPath = fullPath;
            fileElement.dataset.kind = handle.kind;
            if (handle.kind === 'file') {
                fileElement.textContent = `📄 ${ name }`;
                fileElement.addEventListener('click', e => {
                    e.stopPropagation();
                    this.openFile(handle);
                });
            } else if (handle.kind === 'directory') {
                fileElement.textContent = `📁 ${ name }`;
                fileElement.style.fontWeight = 'bold';
                const subTreeContainer = document.createElement('div');
                subTreeContainer.style.marginLeft = '10px';
                const isExpanded = expandedPaths.has(fullPath) || fileElement.dataset.expanded === 'true';
                subTreeContainer.style.display = isExpanded ? 'block' : 'none';
                fileElement.dataset.expanded = isExpanded ? 'true' : 'false';
                fileElement.appendChild(subTreeContainer);
                if (isExpanded) {
                    await this.listFiles(handle, subTreeContainer, fullPath, expandedPaths);
                }
                fileElement.addEventListener('click', async e => {
                    e.stopPropagation();
                    const isCurrentlyExpanded = fileElement.dataset.expanded === 'true';
                    fileElement.dataset.expanded = isCurrentlyExpanded ? 'false' : 'true';
                    subTreeContainer.style.display = isCurrentlyExpanded ? 'none' : 'block';
                    if (!isCurrentlyExpanded && subTreeContainer.childElementCount === 0) {
                        await this.listFiles(handle, subTreeContainer, fullPath, expandedPaths);
                    }
                });
            }
            fileElement.addEventListener('contextmenu', event => {
                event.preventDefault();
                event.stopPropagation();
                this.showContextMenu(event, handle, fileElement);
            });
            parentElement.appendChild(fileElement);
        }
    }
    async openFile(fileHandle) {
        const file = await fileHandle.getFile();
        const fileContent = await file.text();
        this.currentFileHandle = fileHandle;
        this.createTab(fileHandle.name, fileHandle, fileContent);
        this.startFileWatcher(fileHandle);
    }
    async createTab(fileName, fileHandle, content) {
        const filePath = await this.getFilePath(fileHandle);
        // Check if the tab already exists
        const existingTab = Array.from(this.tabBar.children).find(tab => tab.dataset.filePath === filePath);
        if (existingTab) {
            existingTab.click();
            return;
        }
        const tab = document.createElement('div');
        tab.textContent = fileName;
        tab.dataset.filePath = filePath;
        tab.style.padding = '5px 10px';
        tab.style.marginRight = '5px';
        tab.style.backgroundColor = '#3e3e3e';
        tab.style.cursor = 'pointer';
        tab.title = filePath;
        // Set the tooltip to show the full file path
        tab.addEventListener('click', async () => {
            Array.from(this.tabBar.children).forEach(t => {
                t.style.backgroundColor = '#3e3e3e';
            });
            tab.style.backgroundColor = '#1e1e1e';
            this.currentFileHandle = fileHandle;
            this.highlightActiveFileInTree(filePath);
            const file = await fileHandle.getFile();
            const fileContent = await file.text();
            this.monacoEditor.setValue(fileContent);
        });
        // Update Monaco Editor content
        const closeButton = document.createElement('span');
        closeButton.textContent = '\u274C';
        closeButton.style.marginLeft = '10px';
        closeButton.style.cursor = 'pointer';
        closeButton.addEventListener('click', e => {
            e.stopPropagation();
            this.tabBar.removeChild(tab);
            if (this.tabBar.childElementCount > 0) {
                this.tabBar.children[0].click();
            } else {
                this.monacoEditor.setValue('');
                // Clear Monaco Editor content
                this.currentFileHandle = null;
                this.clearFileTreeHighlight();
            }
        });
        tab.appendChild(closeButton);
        this.tabBar.appendChild(tab);
        tab.click();
    }
    async autoSave() {
        if (!this.currentFileHandle)
            return;
        try {
            const writable = await this.currentFileHandle.createWritable();
            const content = this.monacoEditor.getValue();
            await writable.write(content);
            await writable.close();
            console.log('Auto-saved successfully.');
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }
    async getFilePath(fileHandle) {
        const path = this.filePaths.get(fileHandle);
        if (!path) {
            throw new Error('File path not found for the provided file handle.');
        }
        return path;
    }
    showContextMenu(event, handle, fileElement) {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'absolute';
        menu.style.top = `${ event.clientY }px`;
        menu.style.left = `${ event.clientX }px`;
        menu.style.backgroundColor = '#2e2e2e';
        menu.style.color = '#ffffff';
        menu.style.padding = '10px';
        menu.style.borderRadius = '5px';
        menu.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
        menu.style.cursor = 'pointer';
        menu.style.zIndex = '1000';
        // Style for menu options
        const optionStyle = {
            padding: '5px',
            margin: '5px 0'
        };
        const addHoverEffect = option => {
            option.addEventListener('mouseover', () => {
                option.style.backgroundColor = '#444444';
            });
            // Highlight background on hover
            option.addEventListener('mouseout', () => {
                option.style.backgroundColor = '';
            });
        };
        // Reset background on mouse out
        // Add "Rename" option
        const renameOption = document.createElement('div');
        renameOption.textContent = 'Rename';
        Object.assign(renameOption.style, optionStyle);
        addHoverEffect(renameOption);
        renameOption.addEventListener('click', () => {
            this.renameFileOrFolder(handle, fileElement);
            menu.remove();
        });
        // Add "Delete" option
        const deleteOption = document.createElement('div');
        deleteOption.textContent = 'Delete';
        Object.assign(deleteOption.style, optionStyle);
        addHoverEffect(deleteOption);
        deleteOption.addEventListener('click', async () => {
            await this.deleteFileOrFolder(handle, fileElement);
            menu.remove();
        });
        menu.appendChild(renameOption);
        menu.appendChild(deleteOption);
        document.body.appendChild(menu);
        // Close menu on outside click
        document.addEventListener('click', () => {
            menu.remove();
        }, { once: true });
    }
    async renameFileOrFolder(handle, fileElement) {
        const newName = prompt('Enter new name:', handle.name);
        if (!newName || newName === handle.name) {
            return;
        }
        // No change or canceled
        try {
            const parentHandle = await this.resolveParentHandle(handle);
            if (handle.kind === 'file') {
                // Create a new file with the new name
                const newFileHandle = await parentHandle.getFileHandle(newName, { create: true });
                const writable = await newFileHandle.createWritable();
                const file = await handle.getFile();
                // Write the contents of the original file to the new file
                await writable.write(await file.text());
                await writable.close();
                // Remove the original file
                await parentHandle.removeEntry(handle.name);
                fileElement.textContent = `📄 ${ newName }`;
                this.updateFilePath(handle, `${ parentHandle.path }/${ newName }`);
            } else // Update filePaths map
            if (handle.kind === 'directory') {
                // Create a new directory with the new name
                const newDirHandle = await parentHandle.getDirectoryHandle(newName, { create: true });
                // Move all contents to the new directory
                await this.copyDirectory(handle, newDirHandle);
                // Remove the original directory
                await parentHandle.removeEntry(handle.name, { recursive: true });
                fileElement.textContent = `📁 ${ newName }`;
                this.updateFilePath(handle, `${ parentHandle.path }/${ newName }`);
            }
        } // Update filePaths map
        catch (error) {
            alert(`Failed to rename file or folder: ${ error.message }`);
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
    async getParentDirectoryHandle(fileHandle) {
        // Retrieve the parent path from the filePaths map
        const fullPath = this.filePaths.get(fileHandle);
        if (!fullPath) {
            throw new Error('File path not found.');
        }
        const parentPath = fullPath.split('/').slice(0, -1).join('/');
        // Find the directory handle for the parent path
        for (const [key, path] of this.filePaths.entries()) {
            if (path === parentPath && key.kind === 'directory') {
                return key;
            }
        }
        throw new Error('Parent directory not found.');
    }
    updateFilePath(handle, newPath) {
        // Update the entry in the filePaths map
        this.filePaths.set(handle, newPath);
    }
    async resolveParentHandle(fileHandle) {
        // Retrieve the parent path from the filePaths map
        const filePath = this.filePaths.get(fileHandle);
        if (!filePath) {
            throw new Error('File path not found.');
        }
        const pathParts = filePath.split('/');
        // Get the path parts
        pathParts.pop();
        // Remove the file/folder name to get the parent path
        let currentHandle = this.directoryHandle;
        // Start from the root directory
        for (const part of pathParts) {
            if (!part) {
                continue;
            }
            // Skip empty parts
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
        }
        // Navigate to each directory
        return currentHandle;
    }
    async refreshFileTree() {
        if (!this.directoryHandle) {
            return;
        }
        // No directory to refresh
        // Collect expanded paths for preserving state
        const expandedPaths = new Set();
        this.fileTreeContainer.querySelectorAll('[data-full-path]').forEach(element => {
            if (element.dataset.kind === 'directory' && element.dataset.expanded === 'true') {
                expandedPaths.add(element.dataset.fullPath);
            }
        });
        // Generate the current file tree snapshot
        const newSnapshot = await this.generateFileTreeSnapshot(this.directoryHandle);
        // Check if the file tree has changed
        if (JSON.stringify(this.fileTreeSnapshot) === JSON.stringify(newSnapshot)) {
            console.log('No changes detected. Skipping UI update.');
            return;
        }
        // Update the snapshot
        this.fileTreeSnapshot = newSnapshot;
        // Clear and rebuild the file tree container
        this.fileTreeContainer.innerHTML = '';
        const fileTreeTitle = document.createElement('h3');
        fileTreeTitle.textContent = 'File Tree';
        fileTreeTitle.style.marginTop = '0';
        fileTreeTitle.style.fontSize = '18px';
        fileTreeTitle.style.textAlign = 'center';
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh';
        refreshButton.style.marginBottom = '10px';
        refreshButton.style.cursor = 'pointer';
        refreshButton.style.backgroundColor = '#3e3e3e';
        refreshButton.style.color = '#ffffff';
        refreshButton.style.border = 'none';
        refreshButton.addEventListener('click', () => this.refreshFileTree());
        this.fileTreeContainer.appendChild(refreshButton);
        this.fileTreeContainer.appendChild(fileTreeTitle);
        // Rebuild the file tree
        await this.listFiles(this.directoryHandle, this.fileTreeContainer, '', expandedPaths);
        // Highlight the active file after refresh
        if (this.currentFileHandle) {
            const filePath = await this.getFilePath(this.currentFileHandle);
            this.highlightActiveFileInTree(filePath);
        }
    }
    startAutoRefresh() {
        setInterval(() => {
            this.refreshFileTree();
        }, 3000);
    }
    async highlightActiveFileInTree(filePath) {
        // Clear any previous highlights
        this.clearFileTreeHighlight();
        // Find the file element in the tree
        const fileElement = this.fileTreeContainer.querySelector(`[data-full-path="${ filePath }"]`);
        if (fileElement) {
            fileElement.style.backgroundColor = '#444444';
            fileElement.style.color = '#ffffff';
            // Ensure its parent folders are expanded
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
    async generateFileTreeSnapshot(directoryHandle, currentPath = '') {
        const snapshot = {};
        for await (const [name, handle] of directoryHandle.entries()) {
            const fullPath = `${ currentPath }/${ name }`;
            snapshot[fullPath] = handle.kind;
            if (handle.kind === 'directory') {
                snapshot[fullPath] = await this.generateFileTreeSnapshot(handle, fullPath);
            }
        }
        return snapshot;
    }
    resizeEditor() {
        if (this.monacoEditor) {
            const editorContainer = this.editorArea.parentElement;
            console.log(editorContainer.offsetWidth);
            const fileTreeWidth = this.fileTreeContainer.offsetWidth;
            // get width of the window in pixels
            const windowWidth = window.innerWidth;
            this.editorArea.style.width = `calc(${ windowWidth }px - ${ fileTreeWidth }px)`;
            this.monacoEditor.layout();
        }
    }
    addToolbarButton({title, toolTip, callback}) {
        const button = document.createElement('button');
        button.textContent = title;
        button.title = toolTip;
        button.style.marginRight = '10px';
        button.style.padding = '5px 10px';
        button.style.backgroundColor = '#444';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.cursor = 'pointer';
        button.addEventListener('click', callback);
        this.toolbar.appendChild(button);
    }
    startFileWatcher(fileHandle) {
        this.stopFileWatcher();
        let lastFileModified = null;
        let isSaving = false;
        const watcher = async () => {
            try {
                const file = await fileHandle.getFile();
                const fileModifiedTime = file.lastModified;
                // Only proceed if changes are detected and no save is in progress
                if (lastFileModified !== fileModifiedTime && !isSaving) {
                    lastFileModified = fileModifiedTime;
                    const newContent = await file.text();
                    // Only update the editor if the content is different
                    const currentContent = this.monacoEditor.getValue();
                    if (newContent !== currentContent) {
                        this.monacoEditor.setValue(newContent);
                    }
                }
            } catch (error) {
                console.error('Failed to read updated file:', error);
            }
        };
        this.fileWatchInterval = setInterval(async () => {
            await watcher();
        }, 1000);
        // Override autoSave to set the saving state
        const originalAutoSave = this.autoSave.bind(this);
        this.autoSave = async () => {
            isSaving = true;
            await originalAutoSave();
            isSaving = false;
        };
    }
    stopFileWatcher() {
        if (this.fileWatchInterval) {
            clearInterval(this.fileWatchInterval);
            this.fileWatchInterval = null;
        }
    }
    async closeTab(tab) {
        this.stopFileWatcher();
    }
    addNewFileButton() {
        this.addToolbarButton({
            title: 'New File',
            toolTip: 'Create a new file in the selected directory',
            callback: () => this.createNewFile()
        });
    }
    async createNewFile() {
        const fileName = prompt('Enter file name (with extension):');
        if (!fileName) {
            return;
        }
        try {
            const writable = await this.directoryHandle.getFileHandle(fileName, { create: true }).then(handle => handle.createWritable());
            await writable.close();
            console.log(`New file created: ${ fileName }`);
            await this.refreshFileTree();
        } // Refresh the file tree to show the new file
        catch (error) {
            console.error('Error creating new file:', error);
        }
    }
    async deleteFileOrFolder(handle, fileElement) {
        const confirmation = confirm(`Are you sure you want to delete ${ handle.name }?`);
        if (!confirmation) {
            return;
        }
        try {
            const parentHandle = await this.resolveParentHandle(handle);
            if (handle.kind === 'file') {
                await parentHandle.removeEntry(handle.name);
                this.removeTabIfOpen(handle);
            } else if (handle.kind === 'directory') {
                await parentHandle.removeEntry(handle.name, { recursive: true });
            }
            fileElement.remove();
            console.log(`${ handle.kind === 'file' ? 'File' : 'Directory' } deleted successfully.`);
            await this.refreshFileTree();
        } catch (error) {
            alert(`Failed to delete: ${ error.message }`);
        }
    }
    removeTabIfOpen(fileHandle) {
        const filePath = this.filePaths.get(fileHandle);
        if (!filePath)
            return;
        const existingTab = Array.from(this.tabBar.children).find(tab => tab.dataset.filePath === filePath);
        if (existingTab) {
            this.tabBar.removeChild(existingTab);
            if (this.tabBar.childElementCount > 0) {
                this.tabBar.children[0].click();
            } else {
                this.monacoEditor.setValue('');
                this.currentFileHandle = null;
                this.clearFileTreeHighlight();
            }
        }
    }
}