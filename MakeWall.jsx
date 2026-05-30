#target photoshop

var TILE_SIZE = 128;
var GRID_SIZE = 3;

var ROWS = [
    { name: "Top", key: "top", y: 0 },
    { name: "Middle", key: "middle", y: 1 },
    { name: "Bottom", key: "bottom", y: 2 }
];

var COLS = [
    { name: "Left", key: "left", x: 0 },
    { name: "Middle", key: "middle", x: 1 },
    { name: "Right", key: "right", x: 2 }
];

var TILE_KEYS = [
    ["tl", "tm", "tr"],
    ["ml", "mm", "mr"],
    ["bl", "bm", "br"]
];

function fail(message) {
    alert(message);
    throw new Error(message);
}

function stripExtension(name) {
    var dotIndex = name.lastIndexOf(".");
    if (dotIndex <= 0) {
        return name;
    }
    return name.substring(0, dotIndex);
}

function normalizeName(name) {
    return String(name).toLowerCase();
}

function findDirectLayerSetCaseInsensitive(container, targetName) {
    var normalizedTarget = normalizeName(targetName);

    for (i = 0; i < container.layerSets.length; i++) {
        if (normalizeName(container.layerSets[i].name) === normalizedTarget) {
            return container.layerSets[i];
        }
    }

    return null;
}

function eachChildLayer(container, callback) {
    var i;

    for (i = 0; i < container.artLayers.length; i++) {
        callback(container.artLayers[i]);
    }

    for (var i = 0; i < container.layerSets.length; i++) {
        callback(container.layerSets[i]);
        eachChildLayer(container.layerSets[i], callback);
    }
}

function restoreVisibility(layers, values) {
    for (var i = 0; i < layers.length; i++) {
        try {
            layers[i].visible = values[i];
        } catch (e) {
            // Closed or invalid layers can be ignored while restoring best-effort state.
        }
    }
}

function hideAllLayers(container) {
    eachChildLayer(container, function (layer) {
        layer.visible = false;
    });
}

function showLayerAndAncestors(layer) {
    var current = layer;

    while (current && current.typename !== "Document") {
        current.visible = true;
        current = current.parent;
    }
}

function showLayerSubtree(container) {
    container.visible = true;
    eachChildLayer(container, function (layer) {
        layer.visible = true;
    });
}

function captureVisibility(container, layers, values) {
    var i;

    for (i = 0; i < container.artLayers.length; i++) {
        layers.push(container.artLayers[i]);
        values.push(container.artLayers[i].visible);
    }

    for (i = 0; i < container.layerSets.length; i++) {
        layers.push(container.layerSets[i]);
        values.push(container.layerSets[i].visible);
        captureVisibility(container.layerSets[i], layers, values);
    }
}

function makeRect(left, top, right, bottom) {
    return [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom]
    ];
}

function selectTile(doc, col, row) {
    var left = col * TILE_SIZE;
    var top = row * TILE_SIZE;
    doc.selection.select(makeRect(left, top, left + TILE_SIZE, top + TILE_SIZE));
}

function saveDocumentAsPng(doc, outputFile) {
    var pngOptions = new PNGSaveOptions();
    pngOptions.compression = 9;
    pngOptions.interlaced = false;

    doc.saveAs(outputFile, pngOptions, true, Extension.LOWERCASE);
}

function escapeJsonString(value) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
}

function toJson(value, indentLevel) {
    var indent = "";
    var childIndent = "";
    var parts;
    var i;

    indentLevel = indentLevel || 0;

    for (i = 0; i < indentLevel; i++) {
        indent += "  ";
    }
    childIndent = indent + "  ";

    if (value === null) {
        return "null";
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (typeof value === "string") {
        return "\"" + escapeJsonString(value) + "\"";
    }

    if (value instanceof Array) {
        if (value.length === 0) {
            return "[]";
        }

        parts = [];
        for (i = 0; i < value.length; i++) {
            parts.push(childIndent + toJson(value[i], indentLevel + 1));
        }
        return "[\n" + parts.join(",\n") + "\n" + indent + "]";
    }

    parts = [];
    for (var key in value) {
        if (value.hasOwnProperty(key) && typeof value[key] !== "undefined") {
            parts.push(childIndent + "\"" + escapeJsonString(key) + "\": " + toJson(value[key], indentLevel + 1));
        }
    }

    if (parts.length === 0) {
        return "{}";
    }

    return "{\n" + parts.join(",\n") + "\n" + indent + "}";
}

function writeJsonFile(file, data) {
    file.encoding = "UTF8";
    file.lineFeed = "Unix";
    file.open("w");
    file.write(toJson(data, 0));
    file.close();
}

function buildManifest(baseName) {
    var wall = {};

    for (var row = 0; row < GRID_SIZE; row++) {
        for (var col = 0; col < GRID_SIZE; col++) {
            wall[TILE_KEYS[row][col]] = {
                x: col * TILE_SIZE,
                y: row * TILE_SIZE,
                w: TILE_SIZE,
                h: TILE_SIZE
            };
        }
    }

    return {
        name: baseName,
        tile_size: TILE_SIZE,
        sprite: baseName + "_sprite.png",
        wall: wall
    };
}

function hideToTile(sourceDoc, rowInfo, colInfo) {
    var rowGroup = findDirectLayerSetCaseInsensitive(sourceDoc, rowInfo.name);
    if (rowGroup === null) {
        return false;
    }

    var colGroup = findDirectLayerSetCaseInsensitive(rowGroup, colInfo.name);
    if (colGroup === null) {
        return false;
    }

    hideAllLayers(sourceDoc);
    showLayerAndAncestors(colGroup);
    showLayerSubtree(colGroup);

    return true;
}

function pasteClipboardIntoTile(targetDoc, col, row, layerName) {
    app.activeDocument = targetDoc;
    selectTile(targetDoc, col, row);
    var pastedLayer = targetDoc.paste(true);
    pastedLayer.name = layerName;
    targetDoc.selection.deselect();
}

function copyVisibleTileToSprite(sourceDoc, spriteDoc, rowInfo, colInfo, missingTiles) {
    app.activeDocument = sourceDoc;

    if (!hideToTile(sourceDoc, rowInfo, colInfo)) {
        missingTiles.push(rowInfo.name + "/" + colInfo.name);
        return;
    }

    sourceDoc.selection.selectAll();
    sourceDoc.selection.copy(true);
    sourceDoc.selection.deselect();

    pasteClipboardIntoTile(spriteDoc, colInfo.x, rowInfo.y, TILE_KEYS[rowInfo.y][colInfo.x]);
}

function copySpriteTile(spriteDoc, targetDoc, sourceCol, sourceRow, targetCol, targetRow, layerName) {
    app.activeDocument = spriteDoc;
    selectTile(spriteDoc, sourceCol, sourceRow);
    spriteDoc.selection.copy(true);
    spriteDoc.selection.deselect();

    pasteClipboardIntoTile(targetDoc, targetCol, targetRow, layerName);
}

function tileSourceIndex(targetIndex, tileCount) {
    if (targetIndex === 0) {
        return 0;
    }

    if (targetIndex === tileCount - 1) {
        return 2;
    }

    return 1;
}

function makeWallPreview(spriteDoc, baseName, tilesWide, tilesTall) {
    var previewDoc = app.documents.add(
        tilesWide * TILE_SIZE,
        tilesTall * TILE_SIZE,
        spriteDoc.resolution,
        baseName + "_wall_" + tilesWide + "x" + tilesTall + "_preview",
        NewDocumentMode.RGB,
        DocumentFill.TRANSPARENT
    );

    for (var y = 0; y < tilesTall; y++) {
        for (var x = 0; x < tilesWide; x++) {
            var sourceCol = tileSourceIndex(x, tilesWide);
            var sourceRow = tileSourceIndex(y, tilesTall);
            copySpriteTile(spriteDoc, previewDoc, sourceCol, sourceRow, x, y, "tile_" + x + "_" + y);
        }
    }

    return previewDoc;
}

function main() {
    if (app.documents.length === 0) {
        fail("Open a PSD before running MakeWall.jsx.");
    }

    var originalRulerUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    var sourceDoc = app.activeDocument;
    var originalLayers = [];
    var originalVisibility = [];
    var missingTiles = [];

    captureVisibility(sourceDoc, originalLayers, originalVisibility);

    try {
        var baseName = stripExtension(sourceDoc.name);
        var scriptFolder = new File($.fileName).parent;
        var outputFolder = new Folder(scriptFolder.fsName + "/output");

        if (!outputFolder.exists) {
            outputFolder.create();
        }

        var spriteDoc = app.documents.add(
            TILE_SIZE * GRID_SIZE,
            TILE_SIZE * GRID_SIZE,
            sourceDoc.resolution,
            baseName + "_sprite",
            NewDocumentMode.RGB,
            DocumentFill.TRANSPARENT
        );

        for (var row = 0; row < ROWS.length; row++) {
            for (var col = 0; col < COLS.length; col++) {
                copyVisibleTileToSprite(sourceDoc, spriteDoc, ROWS[row], COLS[col], missingTiles);
            }
        }

        app.activeDocument = spriteDoc;
        saveDocumentAsPng(spriteDoc, new File(outputFolder.fsName + "/" + baseName + "_sprite.png"));
        writeJsonFile(new File(outputFolder.fsName + "/" + baseName + "_sprite.json"), buildManifest(baseName));

        makeWallPreview(spriteDoc, baseName, 8, 4);
        makeWallPreview(spriteDoc, baseName, 2, 2);

        restoreVisibility(originalLayers, originalVisibility);
        app.activeDocument = sourceDoc;

        if (missingTiles.length > 0) {
            alert(
                "Created wall sprite, JSON, and previews.\n\n" +
                "Missing folders were left transparent:\n" +
                missingTiles.join("\n") + "\n\n" +
                outputFolder.fsName
            );
        } else {
            alert("Created wall sprite, JSON, and previews:\n" + outputFolder.fsName);
        }
    } finally {
        restoreVisibility(originalLayers, originalVisibility);
        app.preferences.rulerUnits = originalRulerUnits;
    }
}

main();
