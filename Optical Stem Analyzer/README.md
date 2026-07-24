# Optical Stem Analyzer

Eina HTML local per analitzar compensacions optiques entre astes rectes i corbes a partir d'un SVG emplenat.

Forma part del conjunt **Font Design Tools**.

## Us

Obre `index.html` al navegador i carrega un SVG exportat des de Glyphs o una altra eina vectorial.

L'eina:

- rasteritza el SVG en un canvas;
- detecta el contorn fosc segons un llindar ajustable;
- mesura gruixos per seccions horitzontals o verticals;
- compara el gruix recte amb el gruix corb;
- calcula una corba suggerida amb una taula de compensacio optica en unitats;
- permet activar un crossbeam per triar manualment el punt exacte de mesura;
- permet calibrar manualment els valors reals si l'SVG esta escalat respecte al glif original.

## Crossbeam

Activa `Crossbeam` per mostrar dues guies independents:

- el tirador esquerre mou la guia horitzontal;
- el tirador superior mou la guia vertical;
- els camps petits permeten introduir valors reals de gruix.

Quan escrius un valor real en un camp, l'altre s'actualitza mantenint la proporcio mesurada al SVG.

## Notes

La lectura automatica funciona millor amb formes com `D`, `O`, `C`, `G`, `o`, `c` i equivalents. En tipografies incises, serifades o de contrast alt, el crossbeam manual dona resultats mes fiables que l'escaneig general.
