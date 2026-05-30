# Vax Game Tools - Photoshop UXP Panel

A Photoshop panel for exporting layer groups as individual PNG files.

## Features

- **Export Folders**: Exports each layer group as a separate PNG file to the `../output/` directory
- Supports resize configuration via a special "config" layer group (e.g., "config w=512" or "config h=256")
- Preserves original layer visibility after export

## Installation

### Method 1: Using UXP Developer Tool (Recommended for Development)

1. Download and install the [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/guides/devtool/)
2. Open the UXP Developer Tool
3. Click "Add Plugin"
4. Navigate to and select the `manifest.json` file in this folder
5. Click "Load" to load the plugin
6. The panel will appear in Photoshop under Window > Plugins > Vax Game Tools

### Method 2: Manual Installation (For Production Use)

1. Locate your Photoshop plugins folder:
   - **macOS**: `~/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/[version]/External/`
   - **Windows**: `%APPDATA%\Adobe\UXP\PluginsStorage\PHSP\[version]\External\`

2. Create a folder named `vax.game.tools`

3. Copy all files from this directory into the new folder

4. Restart Photoshop

5. Enable the panel from Window > Plugins > Vax Game Tools

## Usage

1. Open a Photoshop document with layer groups
2. Open the Vax Game Tools panel (Window > Plugins > Vax Game Tools)
3. Click "Export Folders" button
4. PNG files will be saved to the `../output/` directory relative to this plugin

### Optional: Resize Configuration

To automatically resize exported images, create a layer group named "config" with size parameters:
- `config w=512` - Resize to 512px width (maintains aspect ratio)
- `config h=256` - Resize to 256px height (maintains aspect ratio)

## Files

- `manifest.json` - Plugin manifest and configuration
- `index.html` - Panel UI
- `index.js` - Panel logic
- `styles.css` - Panel styling
- `photoshop_layers.jsx` - ExtendScript that performs the export
- `icons/` - Panel icons (light and dark theme)

## Notes

- Icon files need to be added to the `icons/` folder (23x23px PNG files: `icon-light.png` and `icon-dark.png`)
- The script exports to `../output/` relative to the plugin location
- Exported files are named using the layer group name (converted to lowercase)
