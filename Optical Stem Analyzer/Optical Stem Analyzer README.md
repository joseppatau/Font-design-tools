# Optical Stem Analyzer

Standalone HTML tool for measuring optical compensation between straight and curved strokes from a filled SVG glyph.

Part of the **Font Design Tools** collection.

## Usage

Open `index.html` in a browser and load an SVG exported from Glyphs or another vector editor.

The tool:

- rasterizes the SVG into a canvas;
- detects the dark outline using an adjustable threshold;
- measures stroke thickness across horizontal or vertical sections;
- compares straight stem thickness with curved stroke thickness;
- calculates a suggested curved-stroke value using an optical compensation table;
- provides an optional crossbeam mode for choosing the exact measuring point manually;
- lets you enter real stem values manually when the SVG scale does not match the original Glyphs units.

## Crossbeam Mode

Enable `Crossbeam` to show two independent measuring guides:

- the left handle moves the horizontal guide;
- the top handle moves the vertical guide;
- the small input fields let you enter real measured stem values.

When you enter a real value in one field, the other field updates automatically using the measured SVG proportion.

## Notes

Automatic scanning works best with glyphs such as `D`, `O`, `C`, `G`, `o`, `c`, and related shapes. For incised, serif, or high-contrast typefaces, manual crossbeam measuring is usually more reliable than the general scan.
