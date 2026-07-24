# Glyphs Export Prep

Local browser tool for preparing a `.glyphs` file before exporting from Glyphs, and for checking the final font with real validation tools.

## Usage

Open `index.html` in a browser, load a `.glyphs` file, and download the generated `-configured.glyphs` copy.

You can also load an exported `.ttf` or `.otf` file to inspect:

- required OpenType tables;
- the OS/2 `Use Typo Metrics` flag;
- actual OS/2 typo, hhea, and win vertical metric values in the final font.

## What It Does

The tool prepares the source file by:

- setting `typoAscender`, `typoDescender`, `typoLineGap`, `hheaAscender`, `hheaDescender`, `hheaLineGap`, `winAscent`, and `winDescent` on every master;
- applying consistent vertical metrics across all masters and instances;
- matching `typo` and `hhea` values, setting line gaps to `0`, and using an initial typographic line height of 120% of the UPM;
- calculating `winAscent` and `winDescent` from the family-wide `yMax/yMin`, including positioned, rotated, and scaled components;
- enabling `Use Typo Metrics`;
- removing `Remove Table` parameters that block required OpenType tables (`cmap`, `head`, `hhea`, `hmtx`, `maxp`, `name`, `OS/2`, `post`) or required outline tables (`glyf`, `loca`, `CFF`, `CFF2`).

## Notes

The `.glyphs` file remains the editable source. After downloading the configured copy, open it in Glyphs, export the final `.ttf` or `.otf`, and validate that exported font with Fontspector or FontBakery.

Fontspector:

https://fonttools.github.io/fontspector/
