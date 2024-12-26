
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
        this.settingsDialog = new SettingsDialog();
        this.suppressErrorLogging();
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
        //this.container.style.color = '#ffffff';
        // Maintain text color
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
            title: 'Open Folder',
            toolTip: 'Open a folder to edit files',
            callback: () => this.openFolder()
        });
        this.addToolbarButton({
            title: 'Settings',
            toolTip: 'Open settings dialog',
            callback: () => this.settingsDialog.open()
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
        //this.fileTreeContainer.style.color = '#ffffff';
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
        this.createTabBar(editorContainer);
        this.createEditorArea(editorContainer);
    }
    createTabBar(editorContainer) {
        this.tabBar = document.createElement('div');
        this.tabBar.style.display = 'flex';
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
        this.monacoEditor.onDidChangeModelContent(async () => {
            await this.autoSave();
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
            const fullPath = `${ currentPath }${ name }`;
            this.filePaths.set(handle, fullPath);
            const fileElement = document.createElement('div');
            fileElement.style.padding = '5px';
            fileElement.style.cursor = 'pointer';
            fileElement.dataset.fullPath = fullPath;
            fileElement.dataset.kind = handle.kind;
            // Set up context menu
            this.setupContextMenu(fileElement, handle);
            // Set up drag-and-drop events
            this.setupDragAndDropEvents(fileElement, handle);
            if (handle.kind === 'file') {
                fileElement.textContent = `📄 ${ name }`;
                fileElement.addEventListener('click', e => {
                    e.stopPropagation();
                    this.openFile(handle);
                });
            } else if (handle.kind === 'directory') {
                const directoryContent = document.createElement('div');
                directoryContent.style.paddingLeft = '20px';
                directoryContent.style.display = 'none';
                fileElement.textContent = `📁 ${ name }`;
                fileElement.dataset.expanded = 'false';
                fileElement.addEventListener('click', async e => {
                    e.stopPropagation();
                    const isExpanded = fileElement.dataset.expanded === 'true';
                    if (!isExpanded) {
                        directoryContent.style.display = 'block';
                        fileElement.dataset.expanded = 'true';
                        if (directoryContent.children.length === 0) {
                            await this.listFiles(handle, directoryContent, `${ fullPath }/`, expandedPaths);
                        }
                    } else {
                        directoryContent.style.display = 'none';
                        fileElement.dataset.expanded = 'false';
                    }
                });
                parentElement.appendChild(fileElement);
                parentElement.appendChild(directoryContent);
                if (expandedPaths.has(fullPath)) {
                    fileElement.click();
                }
                continue;
            }
            parentElement.appendChild(fileElement);
        }
    }
    async openFile(fileHandle) {
        const file = await fileHandle.getFile();
        const fileContent = await file.text();
        this.currentFileHandle = fileHandle;
        this.createTab(fileHandle.name, fileHandle, fileContent);
        this.startFileWatcher(fileHandle);
        this.lastEditorContent = fileContent;
        // Store the initial content for comparison
        this.lastModifiedTime = file.lastModified;
    }
    async createTab(fileName, fileHandle, content) {
        const filePath = await this.getFilePath(fileHandle);
        const existingTab = Array.from(this.tabBar.children).find(tab => tab.dataset.filePath === filePath);
        if (existingTab) {
            existingTab.click();
            return;
        }
        const tab = document.createElement('div');
        tab.textContent = fileName;
        tab.dataset.filePath = filePath;
        tab.style.padding = '2px';
        tab.style.marginRight = '5px';
        tab.style.height = '30px';
        tab.style.border = '2px solid black';
        tab.style.cursor = 'pointer';
        tab.style.transition = 'filter 0.3s';
        tab.style.backgroundColor = 'gray';
        // Smooth transition for filter
        tab.addEventListener('click', async () => {
            this.resetTabStyles();
            tab.style.filter = 'invert(100%)';
            // Apply invert filter for selected tab
            this.currentFileHandle = fileHandle;
            this.highlightActiveFileInTree(filePath);
            const file = await fileHandle.getFile();
            const fileContent = await file.text();
            this.monacoEditor.setValue(fileContent);
        });
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
            this.lastEditorContent = content;
            // Update stored content on save
            this.lastSavedTimestamp = (await this.currentFileHandle.getFile()).lastModified;
            console.log(this.lastSavedTimestamp);
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
        // Background color for the menu
        menu.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
        menu.style.cursor = 'pointer';
        menu.style.zIndex = '1000';
        const createMenuOption = (text, callback) => {
            const option = document.createElement('div');
            option.textContent = text;
            option.style.padding = '5px';
            option.style.cursor = 'pointer';
            option.style.color = '#ffffff';
            // Text color
            option.style.transition = 'background-color 0.3s';
            option.addEventListener('click', () => {
                callback();
                menu.remove();
            });
            option.addEventListener('mouseover', () => {
                option.style.backgroundColor = '#555';
            });
            // Highlight color on hover
            option.addEventListener('mouseout', () => {
                option.style.backgroundColor = '';
            });
            // Reset color
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
    async startFileWatcher(fileHandle) {
        this.stopFileWatcher();
        this.fileWatchInterval = setInterval(async () => {
            await this.checkForFileUpdates(fileHandle);
        }, 3000);
    }
    stopFileWatcher() {
        if (this.fileWatchInterval) {
            clearInterval(this.fileWatchInterval);
            this.fileWatchInterval = null;
        }
    }
    async closeTab(tab) {
        // Prevent auto-save on tab close
        this.stopFileWatcher();
        // Remove the tab from the tab bar
        this.tabBar.removeChild(tab);
        // Check if any tab remains open
        if (this.tabBar.childElementCount > 0) {
            this.tabBar.children[0].click();
        } else {
            // Clear Monaco Editor content only if no other tabs are open
            this.monacoEditor.setValue('');
            this.currentFileHandle = null;
            this.clearFileTreeHighlight();
        }
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
    extractFileName(path) {
        const parts = path.split('/');
        return parts[parts.length - 1];
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
    async getCurrentPath(handle) {
        // Try to get path from filePaths map
        let path = this.filePaths.get(handle);
        if (!path) {
            // Fallback: Try to reconstruct path from handle
            try {
                if (handle.kind === 'file') {
                    path = handle.name;
                    let parent = await this.getParentDirectoryHandle(handle);
                    while (parent && parent !== this.directoryHandle) {
                        path = `${ parent.name }/${ path }`;
                        parent = await this.getParentDirectoryHandle(parent);
                    }
                }
            } catch (error) {
                console.warn('Could not reconstruct path:', error);
            }
        }
        return path;
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
    setupDragAndDrop(fileElement, handle) {
        fileElement.draggable = true;
        fileElement.addEventListener('dragstart', e => {
            e.stopPropagation();
            const dragData = {
                handle: handle,
                name: handle.name,
                kind: handle.kind,
                path: this.filePaths.get(handle)
            };
            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
            e.dataTransfer.effectAllowed = 'move';
        });
        if (handle.kind === 'directory') {
            fileElement.addEventListener('dragover', e => {
                e.preventDefault();
                e.stopPropagation();
                fileElement.style.backgroundColor = '#444444';
                e.dataTransfer.dropEffect = 'move';
            });
            fileElement.addEventListener('dragleave', e => {
                e.preventDefault();
                e.stopPropagation();
                fileElement.style.backgroundColor = '';
            });
            fileElement.addEventListener('drop', async e => {
                e.preventDefault();
                e.stopPropagation();
                fileElement.style.backgroundColor = '';
                const dragDataStr = e.dataTransfer.getData('application/json');
                const dragData = JSON.parse(dragDataStr);
                await this.moveFile(dragData, handle);
            });
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
    async isSubdirectory(parentDir, potentialSubDir) {
        try {
            let current = potentialSubDir;
            while (current !== this.directoryHandle) {
                if (current === parentDir) {
                    return true;
                }
                current = await this.getParentDirectoryHandle(current);
                if (!current)
                    break;
            }
            return false;
        } catch (error) {
            console.error('Error checking subdirectory:', error);
            return false;
        }
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
            alert(`Failed to move: ${ error.message }`);
        }
    }
    async moveFileToTarget(fileHandle, targetDirHandle) {
        const file = await fileHandle.getFile();
        const content = await file.text();
        const newHandle = await targetDirHandle.getFileHandle(fileHandle.name, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();
        const userConfirmation = confirm('Do you want to move the file? (Press OK to move, Cancel to copy)');
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
        // Enable drag-and-drop for directories as well
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
                // Determine the proper target directory
                const targetDirectory = handle.kind === 'directory' ? handle : await this.getParentDirectoryHandle(handle);
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
            this.showContextMenu(event, handle, fileElement);
        });
    }
    async checkForFileUpdates(fileHandle) {
        try {
            const file = await fileHandle.getFile();
            const currentFileModifiedTime = file.lastModified;
            if (currentFileModifiedTime !== this.lastSavedTimestamp) {
                const newContent = await file.text();
                // Only update the editor if content is different and it was not modified by this editor
                console.log(currentFileModifiedTime, this.lastModifiedTime);
                this.monacoEditor.setValue(newContent);
                this.lastSavedTimestamp = currentFileModifiedTime;
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
            // Filter out the specific error message
            if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('toUrl')) {
                return;
            }
            originalError.apply(console, args);
        };
    }
    resetTabStyles() {
        Array.from(this.tabBar.children).forEach(t => {
            t.style.border = '2px solid transparent';
            t.style.filter = '';
        });
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