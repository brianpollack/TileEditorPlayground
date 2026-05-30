const { app, core } = require("photoshop");
const { executeAsModal } = require("photoshop").core;
const fs = require("uxp").storage.localFileSystem;

document.addEventListener("DOMContentLoaded", () => {
    const exportButton = document.getElementById("exportButton");
    const statusDiv = document.getElementById("status");

    exportButton.addEventListener("click", async () => {
        await exportFolders();
    });
});

async function exportFolders() {
    const exportButton = document.getElementById("exportButton");
    const statusDiv = document.getElementById("status");
    
    try {
        // Disable button during export
        exportButton.disabled = true;
        statusDiv.className = "status-message info";
        statusDiv.textContent = "Exporting...";
        
        // Check if there's an active document
        if (!app.activeDocument) {
            throw new Error("No active document. Please open a document first.");
        }

        // Get the plugin folder
        const pluginFolder = await fs.getPluginFolder();
        const scriptFile = await pluginFolder.getEntry("photoshop_layers.jsx");
        const scriptContent = await scriptFile.read();

        // Execute the ExtendScript
        await executeAsModal(async () => {
            try {
                await app.batchPlay([
                    {
                        _obj: "AdobeScriptAutomation Scripts",
                        javaScriptMessage: scriptContent,
                        _options: {
                            dialogOptions: "dontDisplay"
                        }
                    }
                ], {});
            } catch (e) {
                // Try alternative method using evaluate
                const result = await core.executeAsModal(async () => {
                    return await app.activeDocument.suspendHistory(async () => {
                        return await require("photoshop").action.batchPlay([{
                            _obj: "AdobeScriptAutomation Scripts",
                            javaScriptMessage: scriptContent
                        }], {});
                    }, "Export Folders");
                });
            }
        }, {
            commandName: "Export Folders"
        });

        // Show success message
        statusDiv.className = "status-message success";
        statusDiv.textContent = "Export completed successfully!";
        
        // Clear success message after 3 seconds
        setTimeout(() => {
            statusDiv.className = "status-message";
            statusDiv.textContent = "";
        }, 3000);

    } catch (error) {
        console.error("Export error:", error);
        statusDiv.className = "status-message error";
        statusDiv.textContent = `Error: ${error.message}`;
    } finally {
        // Re-enable button
        exportButton.disabled = false;
    }
}
