import { tabInterface } from './tabInterface.js';
import { LLMSettingsManager } from './LLMSettingsManager.js';
import { ProjectSettingsManager } from './ProjectSettingsManager.js';
import { ChatManager } from './ChatManager.js';
import { toolsManager } from './toolsManager.js';
import './confirmDialog.js';

let ctx = {};


export async function setup(targetElement = null) {
    targetElement = targetElement || document.body;

    ctx.autoApplyTimeout = 3;
    const tabs = new tabInterface();
    ctx.tabs = tabs;
    const chatTab = tabs.createTab("Chat", "💬");
    ctx.chat = new ChatManager(chatTab, ctx);

    const toolsTab = tabs.createTab("Tools", "🛠️");
    ctx.tools = new toolsManager(toolsTab, ctx);

    const projectSettings = tabs.createTab("Project Settings", "⚙️");
    ctx.projectSettings = new ProjectSettingsManager(projectSettings, ctx);

    const llmSettingsTab = tabs.createTab("LLM Settings", "🧠");
    ctx.llmSettings = new LLMSettingsManager(llmSettingsTab, ctx);

    console.log("this is our target element", targetElement);
    targetElement.appendChild(tabs.getElement());

    window.ctx = ctx;

}


async function setDefaultLocalStorageKey(key, value) {
    if (!localStorage.getItem(key)) {
        localStorage.setItem(key, value);
    }
}

// call the setup function only after the DOM has loaded
document.addEventListener('DOMContentLoaded', async () => { await setup(); }
);


