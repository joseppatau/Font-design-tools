# Glyphs Export Prep

App local per preparar un arxiu `.glyphs` abans d'exportar-lo des de Glyphs i revisar la font final amb eines reals de validacio.

## Ús

Obre `index.html` al navegador, carrega l'arxiu `.glyphs` i baixa la còpia `-configured.glyphs`.

També pots carregar un `.ttf` o `.otf` exportat per diagnosticar:

- taules OpenType requerides presents o absents;
- `Use Typo Metrics` dins OS/2;
- valors OS/2 typo, hhea i win reals de la font final.

L'app prepara el fitxer amb aquests canvis:

- Configura `typoAscender`, `typoDescender`, `typoLineGap`, `hheaAscender`, `hheaDescender`, `hheaLineGap`, `winAscent` i `winDescent` a cada màster.
- Aplica els mateixos valors verticals a tots els màsters i instances de la família.
- Usa `typo/hhea` iguals, line gaps a `0`, i un line-height tipogràfic inicial del 120% de l'UPM.
- Calcula `winAscent` i `winDescent` amb el `yMax/yMin` global de la família, incloent components amb posició, rotació i escala.
- Activa `Use Typo Metrics`.
- Elimina paràmetres `Remove Table` que bloquegin taules OpenType requerides (`cmap`, `head`, `hhea`, `hmtx`, `maxp`, `name`, `OS/2`, `post`) o taules d'outline necessàries (`glyf`, `loca`, `CFF`, `CFF2`).

## Notes

El `.glyphs` continua sent la font editable. Després de baixar-lo, exporta el font des de Glyphs i valida el `.ttf` o `.otf` final amb Fontspector o FontBakery real.

El web `https://v0-google-font-validator.vercel.app/` queda descartat: la versio publicada es una demo, no llegeix el contingut del fitxer i mostra resultats simulats.

Fontspector:

https://fonttools.github.io/fontspector/
