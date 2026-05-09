#target photoshop

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

function toPx(unitValue) {
    return unitValue.as("px");
}

function sortNumbersAsc(values) {
    values.sort(function (a, b) {
        return a - b;
    });
}

function makeRect(left, top, right, bottom) {
    return [
        UnitValue(left, "px"),
        UnitValue(top, "px"),
        UnitValue(right, "px"),
        UnitValue(bottom, "px")
    ];
}

function exportSlice(sourceDoc, rect, outputFile) {
    var sliceDoc = sourceDoc.duplicate();
    sliceDoc.crop(rect);
    saveDocumentAsPng(sliceDoc, outputFile);
    sliceDoc.close(SaveOptions.DONOTSAVECHANGES);
}

function saveDocumentAsPng(doc, outputFile) {
    var pngOptions = new PNGSaveOptions();
    pngOptions.compression = 9;
    pngOptions.interlaced = false;

    doc.saveAs(outputFile, pngOptions, true, Extension.LOWERCASE);
}

function eachChildLayer(container, callback) {
    var i;

    for (i = 0; i < container.artLayers.length; i++) {
        callback(container.artLayers[i]);
    }

    for (i = 0; i < container.layerSets.length; i++) {
        callback(container.layerSets[i]);
        eachChildLayer(container.layerSets[i], callback);
    }
}

function hideAllLayers(container) {
    eachChildLayer(container, function (layer) {
        layer.visible = false;
    });
}

function findLayerByName(container, targetName) {
    var i;

    for (i = 0; i < container.artLayers.length; i++) {
        if (container.artLayers[i].name === targetName) {
            return container.artLayers[i];
        }
    }

    for (i = 0; i < container.layerSets.length; i++) {
        var layerSet = container.layerSets[i];

        if (layerSet.name === targetName) {
            return layerSet;
        }

        var nestedMatch = findLayerByName(layerSet, targetName);
        if (nestedMatch !== null) {
            return nestedMatch;
        }
    }

    return null;
}

function findLayerSetByName(container, targetName) {
    var i;

    for (i = 0; i < container.layerSets.length; i++) {
        var layerSet = container.layerSets[i];

        if (layerSet.name === targetName) {
            return layerSet;
        }

        var nestedMatch = findLayerSetByName(layerSet, targetName);
        if (nestedMatch !== null) {
            return nestedMatch;
        }
    }

    return null;
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

function exportTrimmedVisibleDocument(doc, outputFile) {
    doc.trim(TrimType.TRANSPARENT, true, true, true, true);
    saveDocumentAsPng(doc, outputFile);
}

function duplicateForGroupExport(sourceDoc, groupName) {
    var dupDoc = sourceDoc.duplicate();
    var targetGroup = findLayerSetByName(dupDoc, groupName);

    if (targetGroup === null) {
        dupDoc.close(SaveOptions.DONOTSAVECHANGES);
        return null;
    }

    hideAllLayers(dupDoc);
    showLayerAndAncestors(targetGroup);
    showLayerSubtree(targetGroup);

    return {
        doc: dupDoc,
        group: targetGroup
    };
}

function exportGroupTrimmed(sourceDoc, groupName, outputFile) {
    var exportTarget = duplicateForGroupExport(sourceDoc, groupName);
    if (exportTarget === null) {
        return false;
    }

    exportTrimmedVisibleDocument(exportTarget.doc, outputFile);
    exportTarget.doc.close(SaveOptions.DONOTSAVECHANGES);
    return true;
}

function charId(value) {
    return app.charIDToTypeID(value);
}

function stringId(value) {
    return app.stringIDToTypeID(value);
}

function rgbColorDescriptor(red, green, blue) {
    var colorDesc = new ActionDescriptor();
    colorDesc.putDouble(charId("Rd  "), red);
    colorDesc.putDouble(charId("Grn "), green);
    colorDesc.putDouble(charId("Bl  "), blue);
    return colorDesc;
}

function getLayerEffectsDescriptor(layer) {
    var ref = new ActionReference();
    ref.putIdentifier(stringId("layer"), layer.id);

    var layerDesc = executeActionGet(ref);
    if (!layerDesc.hasKey(stringId("layerEffects"))) {
        return null;
    }

    return layerDesc.getObjectValue(stringId("layerEffects"));
}

function setLayerEffectsDescriptor(layer, layerEffectsDesc) {
    var setDesc = new ActionDescriptor();
    var layerRef = new ActionReference();
    var targetDesc = new ActionDescriptor();

    layerRef.putIdentifier(stringId("layer"), layer.id);
    setDesc.putReference(charId("null"), layerRef);
    targetDesc.putObject(stringId("layerEffects"), stringId("layerEffects"), layerEffectsDesc);
    setDesc.putObject(charId("T   "), stringId("layer"), targetDesc);

    executeAction(charId("setd"), setDesc, DialogModes.NO);
}

function getRgbFromColorDescriptor(colorDesc) {
    return {
        red: colorDesc.getDouble(charId("Rd  ")),
        green: colorDesc.getDouble(charId("Grn ")),
        blue: colorDesc.getDouble(charId("Bl  "))
    };
}

function isNearBlack(color) {
    return color.red <= 8 && color.green <= 8 && color.blue <= 8;
}

function updateBevelDirectionDown(layer) {
    var layerEffectsDesc = getLayerEffectsDescriptor(layer);
    if (layerEffectsDesc === null || !layerEffectsDesc.hasKey(stringId("bevelEmboss"))) {
        return;
    }

    var bevelDesc = layerEffectsDesc.getObjectValue(stringId("bevelEmboss"));
    bevelDesc.putEnumerated(stringId("bevelDirection"), stringId("bevelDirection"), stringId("down"));
    layerEffectsDesc.putObject(stringId("bevelEmboss"), stringId("bevelEmboss"), bevelDesc);
    setLayerEffectsDescriptor(layer, layerEffectsDesc);
}

function updateStrokeColorToBrown(layer) {
    var layerEffectsDesc = getLayerEffectsDescriptor(layer);
    if (layerEffectsDesc === null || !layerEffectsDesc.hasKey(stringId("frameFX"))) {
        return;
    }

    var strokeDesc = layerEffectsDesc.getObjectValue(stringId("frameFX"));
    if (!strokeDesc.hasKey(stringId("color"))) {
        return;
    }

    var currentColorDesc = strokeDesc.getObjectValue(stringId("color"));
    var currentColor = getRgbFromColorDescriptor(currentColorDesc);
    if (!isNearBlack(currentColor)) {
        return;
    }

    strokeDesc.putObject(stringId("color"), stringId("RGBColor"), rgbColorDescriptor(64, 44, 24));
    layerEffectsDesc.putObject(stringId("frameFX"), stringId("frameFX"), strokeDesc);
    setLayerEffectsDescriptor(layer, layerEffectsDesc);
}

function applyToAllLayers(container, updater) {
    eachChildLayer(container, function (layer) {
        if (layer.typename === "ArtLayer") {
            updater(layer);
        }
    });
}

function setNamedGroupsVisibility(container, names, isVisible) {
    for (var i = 0; i < names.length; i++) {
        var group = findLayerSetByName(container, names[i]);
        if (group !== null) {
            group.visible = isVisible;
        }
    }
}

function roundPx(value) {
    return Math.round(value * 100) / 100;
}

function getBoundsPx(layer) {
    return {
        left: roundPx(toPx(layer.bounds[0])),
        top: roundPx(toPx(layer.bounds[1])),
        right: roundPx(toPx(layer.bounds[2])),
        bottom: roundPx(toPx(layer.bounds[3]))
    };
}

function makeSectionInfo(name, left, top, right, bottom) {
    return {
        name: name,
        left: left,
        top: top,
        right: right,
        bottom: bottom,
        width: right - left,
        height: bottom - top
    };
}

function getSections(xs, ys) {
    return [
        makeSectionInfo("tl", xs[0], ys[0], xs[1], ys[1]),
        makeSectionInfo("top", xs[1], ys[0], xs[2], ys[1]),
        makeSectionInfo("tr", xs[2], ys[0], xs[3], ys[1]),
        makeSectionInfo("left", xs[0], ys[1], xs[1], ys[2]),
        makeSectionInfo("middle", xs[1], ys[1], xs[2], ys[2]),
        makeSectionInfo("right", xs[2], ys[1], xs[3], ys[2]),
        makeSectionInfo("bl", xs[0], ys[2], xs[1], ys[3]),
        makeSectionInfo("bot", xs[1], ys[2], xs[2], ys[3]),
        makeSectionInfo("br", xs[2], ys[2], xs[3], ys[3])
    ];
}

function findSectionForBounds(bounds, sections) {
    var centerX = (bounds.left + bounds.right) / 2;
    var centerY = (bounds.top + bounds.bottom) / 2;
    var i;

    for (i = 0; i < sections.length; i++) {
        var section = sections[i];
        if (centerX >= section.left && centerX <= section.right &&
            centerY >= section.top && centerY <= section.bottom) {
            return section;
        }
    }

    return null;
}

function getLayerColorAtCenter(doc, layer) {
    var bounds = getBoundsPx(layer);
    var sampleX = roundPx((bounds.left + bounds.right) / 2);
    var sampleY = roundPx((bounds.top + bounds.bottom) / 2);
    var previousActiveDoc = app.activeDocument;

    app.activeDocument = doc;

    var sampler = doc.colorSamplers.add([
        UnitValue(sampleX, "px"),
        UnitValue(sampleY, "px")
    ]);
    var rgb = sampler.color.rgb;
    sampler.remove();

    app.activeDocument = previousActiveDoc;

    return {
        red: Math.round(rgb.red),
        green: Math.round(rgb.green),
        blue: Math.round(rgb.blue)
    };
}

function rgbToHex(color) {
    function channelToHex(value) {
        var hex = Math.max(0, Math.min(255, Math.round(value))).toString(16).toUpperCase();
        return hex.length === 1 ? "0" + hex : hex;
    }

    return "#" + channelToHex(color.red) + channelToHex(color.green) + channelToHex(color.blue);
}

function getTitleAreaMetadata(sourceDoc, sections) {
    var titleGroup = findLayerSetByName(sourceDoc, "title-area");
    if (titleGroup === null) {
        return null;
    }

    var titleLocation = findLayerByName(titleGroup, "title-location");
    if (titleLocation === null) {
        return null;
    }

    var titleBounds = getBoundsPx(titleLocation);
    var titleSection = findSectionForBounds(titleBounds, sections);
    if (titleSection === null) {
        return null;
    }

    var metadata = {
        section: titleSection.name,
        bounds: titleBounds,
        offsets: {
            left: roundPx(titleBounds.left - titleSection.left),
            top: roundPx(titleBounds.top - titleSection.top),
            right: roundPx(titleSection.right - titleBounds.right),
            bottom: roundPx(titleSection.bottom - titleBounds.bottom)
        }
    };

    var titleExport = duplicateForGroupExport(sourceDoc, "title-area");
    if (titleExport !== null) {
        var titleColorLayer = findLayerByName(titleExport.group, "title-color");
        if (titleColorLayer !== null) {
            var sampledColor = getLayerColorAtCenter(titleExport.doc, titleColorLayer);
            metadata.title_color = {
                red: sampledColor.red,
                green: sampledColor.green,
                blue: sampledColor.blue,
                hex: rgbToHex(sampledColor)
            };
        }
        titleExport.doc.close(SaveOptions.DONOTSAVECHANGES);
    }

    return metadata;
}

function getCloseButtonMetadata(sourceDoc, sections) {
    var closeButtonGroup = findLayerSetByName(sourceDoc, "close-button");
    if (closeButtonGroup === null) {
        return null;
    }

    var bounds = getBoundsPx(closeButtonGroup);
    var section = findSectionForBounds(bounds, sections);
    if (section === null) {
        return null;
    }

    var width = roundPx(bounds.right - bounds.left);
    var height = roundPx(bounds.bottom - bounds.top);
    var leftFromRight = roundPx(section.right - bounds.left);
    var topFromTop = roundPx(bounds.top - section.top);

    return {
        section: section.name,
        bounds: bounds,
        offset_from_top_right: {
            x: leftFromRight,
            y: topFromTop,
            width: width,
            height: height,
            expression: {
                left: "section.right - x",
                top: "section.top + y",
                right: "section.right - x + width",
                bottom: "section.top + y + height"
            }
        }
    };
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
    var i;
    var parts;

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

function exportOptionalAssets(sourceDoc, outputFolder) {
    exportGroupTrimmed(sourceDoc, "corner-tl", new File(outputFolder.fsName + "/corner-tl.png"));

    var closeButtonFile = new File(outputFolder.fsName + "/close-button.png");
    exportGroupTrimmed(sourceDoc, "close-button", closeButtonFile);

    var downExport = duplicateForGroupExport(sourceDoc, "close-button");
    if (downExport !== null) {
        applyToAllLayers(downExport.group, updateBevelDirectionDown);
        exportTrimmedVisibleDocument(downExport.doc, new File(outputFolder.fsName + "/close-button-down.png"));
        downExport.doc.close(SaveOptions.DONOTSAVECHANGES);
    }

    var overExport = duplicateForGroupExport(sourceDoc, "close-button");
    if (overExport !== null) {
        applyToAllLayers(overExport.group, updateStrokeColorToBrown);
        exportTrimmedVisibleDocument(overExport.doc, new File(outputFolder.fsName + "/close-button-over.png"));
        overExport.doc.close(SaveOptions.DONOTSAVECHANGES);
    }
}

function writeManifest(sourceDoc, documentName, outputFolder, xs, ys) {
    var sections = getSections(xs, ys);
    var manifest = {
        document_name: documentName,
        canvas: {
            width: xs[3],
            height: ys[3]
        },
        guides: {
            vertical: [xs[1], xs[2]],
            horizontal: [ys[1], ys[2]]
        },
        sections: sections,
        title_area: getTitleAreaMetadata(sourceDoc, sections),
        close_button: getCloseButtonMetadata(sourceDoc, sections)
    };

    writeJsonFile(new File(outputFolder.fsName + "/" + documentName + ".json"), manifest);
}

function main() {
    if (app.documents.length === 0) {
        fail("Open a document before running 9slice.jsx.");
    }

    var originalRulerUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    try {
        var doc = app.activeDocument;
        var docWidth = toPx(doc.width);
        var docHeight = toPx(doc.height);
        var verticalGuides = [];
        var horizontalGuides = [];

        for (var i = 0; i < doc.guides.length; i++) {
            var guide = doc.guides[i];
            var coordinate = toPx(guide.coordinate);

            if (guide.direction === Direction.VERTICAL) {
                verticalGuides.push(coordinate);
            } else if (guide.direction === Direction.HORIZONTAL) {
                horizontalGuides.push(coordinate);
            }
        }

        if (verticalGuides.length !== 2 || horizontalGuides.length !== 2) {
            fail("9slice.jsx requires exactly 2 vertical guides and 2 horizontal guides.");
        }

        sortNumbersAsc(verticalGuides);
        sortNumbersAsc(horizontalGuides);

        if (verticalGuides[0] <= 0 || verticalGuides[1] >= docWidth ||
            horizontalGuides[0] <= 0 || horizontalGuides[1] >= docHeight) {
            fail("All guides must be inside the canvas bounds.");
        }

        var scriptFolder = new File($.fileName).parent;
        var outputRoot = new Folder(scriptFolder.fsName + "/output");
        if (!outputRoot.exists) {
            outputRoot.create();
        }

        var documentName = stripExtension(doc.name);
        var documentOutputFolder = new Folder(outputRoot.fsName + "/" + documentName);
        if (!documentOutputFolder.exists) {
            documentOutputFolder.create();
        }

        var xs = [0, verticalGuides[0], verticalGuides[1], docWidth];
        var ys = [0, horizontalGuides[0], horizontalGuides[1], docHeight];
        var names = [
            ["tl", "top", "tr"],
            ["left", "middle", "right"],
            ["bl", "bot", "br"]
        ];
        var helperGroups = ["corner-tl", "close-button", "title-area"];

        setNamedGroupsVisibility(doc, helperGroups, false);

        for (var row = 0; row < 3; row++) {
            for (var col = 0; col < 3; col++) {
                var fileName = names[row][col] + ".png";
                var outputFile = new File(documentOutputFolder.fsName + "/" + fileName);
                var rect = makeRect(xs[col], ys[row], xs[col + 1], ys[row + 1]);
                exportSlice(doc, rect, outputFile);
            }
        }

        exportOptionalAssets(doc, documentOutputFolder);
        writeManifest(doc, documentName, documentOutputFolder, xs, ys);

        alert("Exported 9 slices to:\n" + documentOutputFolder.fsName);
    } finally {
        app.preferences.rulerUnits = originalRulerUnits;
    }
}

main();
