#!/bin/bash

SCRIPTS_DIR="/Applications/Adobe Photoshop 2026/Presets/Scripts/Tiles"
PROJECT_DIR="/Users/brian/Projects/GameTiles"

mkdir -p "$SCRIPTS_DIR"
ln -sf "$PROJECT_DIR/photoshop_layers.jsx" "$SCRIPTS_DIR/photoshop_layers.jsx"
ln -sf "$PROJECT_DIR/photoshop_layers_trim.jsx" "$SCRIPTS_DIR/photoshop_layers_trim.jsx"

echo "Links created in $SCRIPTS_DIR"
ls -la "$SCRIPTS_DIR"
