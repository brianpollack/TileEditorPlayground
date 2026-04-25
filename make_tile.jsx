#target photoshop

// Save ruler units and switch to pixels
var originalRulerUnits = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;

var srcDoc = app.activeDocument;
var w = srcDoc.width.as('px');
var h = srcDoc.height.as('px');
var hw = Math.round(w / 2);
var hh = Math.round(h / 2);

// Copy merged (all visible layers)
srcDoc.selection.selectAll();
srcDoc.selection.copy(true);
srcDoc.selection.deselect();

// Create new document with same dimensions
var newDoc = app.documents.add(w, h, srcDoc.resolution, "TileMaker", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
app.activeDocument = newDoc;

// Paste and snap to top-left corner
var baseLayer = newDoc.paste();
baseLayer.name = "base";
baseLayer.translate(-baseLayer.bounds[0].as('px'), -baseLayer.bounds[1].as('px'));

// Creates a named layer from a rectangular region of baseLayer,
// then offsets it to the opposite corner to form a seamless tile.
//
// After a half-width/half-height offset the four original quadrants land here:
//
//   Original:          Result (named by destination):
//   ┌──────┬──────┐    ┌──────┬──────┐
//   │  NW  │  NE  │    │  NW  │  NE  │  ← seams run through center
//   ├──────┼──────┤    ├──────┼──────┤
//   │  SW  │  SE  │    │  SW  │  SE  │
//   └──────┴──────┘    └──────┴──────┘
//
// Each layer is named for where it ends up in the new document.

function createQuadrant(name, keepL, keepT, keepR, keepB, moveX, moveY) {
    var dup = baseLayer.duplicate(newDoc, ElementPlacement.PLACEATBEGINNING);
    dup.name = name;
    newDoc.activeLayer = dup;

    // Keep only the desired quadrant, delete the rest
    var region = [[keepL, keepT], [keepR, keepT], [keepR, keepB], [keepL, keepB]];
    newDoc.selection.select(region);
    newDoc.selection.invert();
    newDoc.selection.clear();
    newDoc.selection.deselect();

    // Slide the quadrant to its new position
    dup.translate(moveX, moveY);
}

// Source region → destination:
createQuadrant("NW", hw, hh, w,  h,  -hw, -hh);  // original SE → NW corner
createQuadrant("NE", 0,  hh, hw, h,   hw, -hh);  // original SW → NE corner
createQuadrant("SW", hw, 0,  w,  hh, -hw,  hh);  // original NE → SW corner
createQuadrant("SE", 0,  0,  hw, hh,  hw,  hh);  // original NW → SE corner

baseLayer.remove();

// Restore ruler units
app.preferences.rulerUnits = originalRulerUnits;

alert("Done! Seams run through the center. Paint over them, then flatten and export.");
