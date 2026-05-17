#target photoshop

var doc = app.activeDocument;
var scriptFile = new File($.fileName);
var scriptFolder = scriptFile.parent;
var outputFolder = new Folder(scriptFolder.parent + "/output");
if (!outputFolder.exists) {
    outputFolder.create();
}

function parseExportConfig(layerSets) {
    var config = { w: null, h: null };
    for (var i = 0; i < layerSets.length; i++) {
        if (/config/i.test(layerSets[i].name)) {
            var name = layerSets[i].name;
            var wMatch = name.match(/w=(\d+)/i);
            var hMatch = name.match(/h=(\d+)/i);
            if (wMatch) config.w = parseInt(wMatch[1], 10);
            else if (hMatch) config.h = parseInt(hMatch[1], 10);
            break;
        }
    }
    return config;
}

if (outputFolder != null) {

    var config = parseExportConfig(doc.layerSets);
    var originalVisibility = [];

    // Store original visibility
    for (var i = 0; i < doc.layerSets.length; i++) {
        originalVisibility[i] = doc.layerSets[i].visible;
    }

    for (var i = 0; i < doc.layerSets.length; i++) {

        var group = doc.layerSets[i];
        if (/config/i.test(group.name)) continue;

        // Hide all groups
        for (var j = 0; j < doc.layerSets.length; j++) {
            doc.layerSets[j].visible = false;
        }

        group.visible = true;

        var fileName = group.name.toLowerCase() + ".png";
        var file = new File(outputFolder + "/" + fileName);

        var pngOptions = new PNGSaveOptions();
        pngOptions.compression = 9;

        if (config.w !== null || config.h !== null) {
            var dupDoc = doc.duplicate();
            var origW = dupDoc.width.as('px');
            var origH = dupDoc.height.as('px');
            var newW, newH;
            if (config.w !== null) {
                newW = config.w;
                newH = Math.round(origH * config.w / origW);
            } else {
                newH = config.h;
                newW = Math.round(origW * config.h / origH);
            }
            dupDoc.resizeImage(UnitValue(newW, 'px'), UnitValue(newH, 'px'), null, ResampleMethod.BICUBIC);
            dupDoc.saveAs(file, pngOptions, true, Extension.LOWERCASE);
            dupDoc.close(SaveOptions.DONOTSAVECHANGES);
        } else {
            doc.saveAs(file, pngOptions, true, Extension.LOWERCASE);
        }
    }

    // Restore original visibility
    for (var i = 0; i < doc.layerSets.length; i++) {
        doc.layerSets[i].visible = originalVisibility[i];
    }

    alert("Export Complete!");
}
