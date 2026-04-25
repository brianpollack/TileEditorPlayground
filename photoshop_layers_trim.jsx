#target photoshop

var doc = app.activeDocument;
var outputFolder = "/Users/brian/Projects/GameTiles/output"

if (outputFolder != null) {

    var originalVisibility = [];

    // Store original visibility
    for (var i = 0; i < doc.layerSets.length; i++) {
        originalVisibility[i] = doc.layerSets[i].visible;
    }

    for (var i = 0; i < doc.layerSets.length; i++) {

        // Hide all groups
        for (var j = 0; j < doc.layerSets.length; j++) {
            doc.layerSets[j].visible = false;
        }

        var group = doc.layerSets[i];
        group.visible = true;

        var fileName = group.name.toLowerCase() + ".png";
        var file = new File(outputFolder + "/" + fileName);

        var pngOptions = new PNGSaveOptions();
        pngOptions.compression = 9;

        // Duplicate the document, trim transparent pixels, save, then close
        var dupDoc = doc.duplicate();
        dupDoc.trim(TrimType.TRANSPARENT);
        dupDoc.saveAs(file, pngOptions, true, Extension.LOWERCASE);
        dupDoc.close(SaveOptions.DONOTSAVECHANGES);
    }

    // Restore original visibility
    for (var i = 0; i < doc.layerSets.length; i++) {
        doc.layerSets[i].visible = originalVisibility[i];
    }

    alert("Export Complete!");
}
