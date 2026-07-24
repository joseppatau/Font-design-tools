"use strict";

const REQUIRED_TABLES = new Set([
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
]);

const OUTLINE_TABLES = new Set([
  "glyf",
  "loca",
  "CFF",
  "CFF ",
  "CFF2",
]);

const METRIC_PARAMETER_NAMES = [
  "typoAscender",
  "typoDescender",
  "typoLineGap",
  "hheaAscender",
  "hheaDescender",
  "hheaLineGap",
  "winAscent",
  "winDescent",
];

const METRIC_NOTE_START = "Glyphs Export Prep vertical metrics:";
const METRIC_NOTE_END = "End Glyphs Export Prep vertical metrics.";

const DATA_FIELDS = [
  { id: "designer", input: "designerInput", property: "designers", localized: true },
  { id: "designerURL", input: "designerUrlInput", property: "designerURL", localized: false },
  { id: "manufacturerURL", input: "manufacturerUrlInput", property: "manufacturerURL", localized: false },
  { id: "copyright", input: "copyrightInput", property: "copyrights", localized: true },
  { id: "versionString", input: "versionStringInput", property: "versionString", localized: false },
  { id: "license", input: "licenseInput", property: "licenses", localized: true },
  { id: "trademark", input: "trademarkInput", property: "trademarks", localized: true },
  { id: "vendorID", input: "vendorIdInput", property: "vendorID", localized: false },
];

const elements = {
  fileInput: document.querySelector("#fileInput"),
  dataFileInput: document.querySelector("#dataFileInput"),
  dropzone: document.querySelector("#dropzone"),
  downloadButton: document.querySelector("#downloadButton"),
  loadDataButton: document.querySelector("#loadDataButton"),
  saveDataButton: document.querySelector("#saveDataButton"),
  resetButton: document.querySelector("#resetButton"),
  fileSummary: document.querySelector("#fileSummary"),
  fileName: document.querySelector("#fileName"),
  fileSize: document.querySelector("#fileSize"),
  statusPill: document.querySelector("#statusPill"),
  dataStatus: document.querySelector("#dataStatus"),
  metricsGrid: document.querySelector("#metricsGrid"),
  checklist: document.querySelector("#checklist"),
  masterRows: document.querySelector("#masterRows"),
  boundsPill: document.querySelector("#boundsPill"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".tab-panel")],
  dataInputs: {},
};

let fixedText = "";
let fixedName = "configured.glyphs";
let objectUrl = "";
let dataObjectUrl = "";

for (const field of DATA_FIELDS) {
  elements.dataInputs[field.id] = document.querySelector(`#${field.input}`);
}

elements.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleFile(file);
});

elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropzone.classList.add("is-dragging");
});

elements.dropzone.addEventListener("dragleave", () => {
  elements.dropzone.classList.remove("is-dragging");
});

elements.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

elements.downloadButton.addEventListener("click", () => {
  if (!fixedText) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  const blob = new Blob([fixedText], { type: "text/plain;charset=utf-8" });
  objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fixedName;
  link.click();
});

elements.resetButton.addEventListener("click", resetUi);

for (const tab of elements.tabs) {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

elements.loadDataButton.addEventListener("click", () => {
  elements.dataFileInput.click();
});

elements.dataFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadDataFile(file);
  elements.dataFileInput.value = "";
});

elements.saveDataButton.addEventListener("click", saveDataFile);

async function handleFile(file) {
  resetDownload();

  const lowerName = file.name.toLowerCase();
  const isGlyphs = lowerName.endsWith(".glyphs");
  const isFont = lowerName.endsWith(".ttf") || lowerName.endsWith(".otf");
  if (!isGlyphs && !isFont) {
    showError("Carrega un .glyphs per configurar-lo, o un .ttf/.otf per diagnosticar-lo.");
    return;
  }

  elements.fileSummary.hidden = false;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatBytes(file.size);
  setStatus("Llegint", "warn");

  try {
    if (isFont) {
      const result = inspectOpenTypeFont(await file.arrayBuffer());
      renderFontInspection(result);
    } else {
      const source = await file.text();
      const parser = new GlyphsParser(source);
      const document = parser.parse();
      const result = configureGlyphs(document, readDataFields());
      fixedText = serializeValue(document, 0) + "\n";
      fixedName = file.name.replace(/\.glyphs$/i, "") + "-configured.glyphs";
      renderReport(result);
      elements.downloadButton.disabled = false;
    }
  } catch (error) {
    console.error(error);
    showError(error.message || "No he pogut llegir l'arxiu.");
  }
}

function inspectOpenTypeFont(buffer) {
  const data = new DataView(buffer);
  if (data.byteLength < 12) throw new Error("La font és massa curta o està malmesa.");
  const sfntVersion = readTag(data, 0);
  const numTables = data.getUint16(4);
  const tables = new Map();

  for (let index = 0; index < numTables; index += 1) {
    const offset = 12 + index * 16;
    if (offset + 16 > data.byteLength) throw new Error("La taula de directoris està incompleta.");
    const tag = readTag(data, offset);
    const tableOffset = data.getUint32(offset + 8);
    const length = data.getUint32(offset + 12);
    tables.set(tag, { tag, offset: tableOffset, length });
  }

  const missingRequired = [...REQUIRED_TABLES].filter((tag) => !tables.has(tag));
  const outlineTables = [...OUTLINE_TABLES].filter((tag) => tables.has(tag));
  const os2 = tables.has("OS/2") ? inspectOs2(data, tables.get("OS/2")) : null;
  const hhea = tables.has("hhea") ? inspectHhea(data, tables.get("hhea")) : null;
  const metricsConsistent =
    !!os2 &&
    !!hhea &&
    os2.typoAscender === hhea.ascender &&
    os2.typoDescender === hhea.descender &&
    os2.typoLineGap === hhea.lineGap;

  return {
    sfntVersion,
    tables: [...tables.keys()].sort(),
    missingRequired,
    outlineTables,
    os2,
    hhea,
    metricsConsistent,
  };
}

function inspectOs2(data, table) {
  ensureTableLength(table, 78, "OS/2");
  return {
    version: data.getUint16(table.offset),
    fsSelection: data.getUint16(table.offset + 62),
    useTypoMetrics: !!(data.getUint16(table.offset + 62) & 0x80),
    typoAscender: data.getInt16(table.offset + 68),
    typoDescender: data.getInt16(table.offset + 70),
    typoLineGap: data.getInt16(table.offset + 72),
    winAscent: data.getUint16(table.offset + 74),
    winDescent: data.getUint16(table.offset + 76),
  };
}

function inspectHhea(data, table) {
  ensureTableLength(table, 10, "hhea");
  return {
    ascender: data.getInt16(table.offset + 4),
    descender: data.getInt16(table.offset + 6),
    lineGap: data.getInt16(table.offset + 8),
  };
}

function ensureTableLength(table, minimumLength, tag) {
  if (table.length < minimumLength) {
    throw new Error(`La taula ${tag} és massa curta.`);
  }
}

function readTag(data, offset) {
  let tag = "";
  for (let index = 0; index < 4; index += 1) {
    tag += String.fromCharCode(data.getUint8(offset + index));
  }
  return tag.trimEnd();
}

function configureGlyphs(font, data = {}) {
  if (!font || typeof font !== "object" || Array.isArray(font)) {
    throw new Error("L'arxiu no té l'estructura principal d'un .glyphs.");
  }

  const upm = toNumber(font.unitsPerEm, 1000);
  const masters = arrayFrom(font.fontMaster);
  if (!masters.length) {
    throw new Error("No he trobat cap fontMaster dins l'arxiu.");
  }

  const glyphs = arrayFrom(font.glyphs);
  const boundsByMaster = collectBoundsByMaster(glyphs, masters);
  const familyMetrics = computeFamilyMetrics(masters, upm, boundsByMaster);
  const metricEvidence = collectMetricEvidence(glyphs, masters);
  writeMetricNote(font, familyMetrics, metricEvidence);
  const axisResults = configureAxes(font, masters);
  const dataResults = applyFontData(font, data);
  const changedTables = removeRequiredTableBlocksEverywhere(font);
  const fontParams = ensureCustomParameters(font);
  const useTypoChanged = setCustomParameter(fontParams, "Use Typo Metrics", 1);
  const fontCustomParameterChanges = applyFontCustomParameters(font, fontParams, axisResults);

  const masterResults = masters.map((master, index) => {
    const id = String(master.id ?? index);
    const bounds = boundsByMaster.get(id) || { minY: Infinity, maxY: -Infinity };
    const metrics = familyMetrics;

    master.ascender = metrics.typoAscender;
    master.descender = metrics.typoDescender;
    master.customParameters = ensureCustomParameters(master);

    let changes = 0;
    changes += setCustomParameter(master.customParameters, "typoAscender", metrics.typoAscender);
    changes += setCustomParameter(master.customParameters, "typoDescender", metrics.typoDescender);
    changes += setCustomParameter(master.customParameters, "typoLineGap", 0);
    changes += setCustomParameter(master.customParameters, "hheaAscender", metrics.hheaAscender);
    changes += setCustomParameter(master.customParameters, "hheaDescender", metrics.hheaDescender);
    changes += setCustomParameter(master.customParameters, "hheaLineGap", 0);
    changes += setCustomParameter(master.customParameters, "winAscent", metrics.winAscent);
    changes += setCustomParameter(master.customParameters, "winDescent", metrics.winDescent);

    return {
      id,
      name: master.name || master.internalAxesValues || `Màster ${index + 1}`,
      bounds,
      metrics,
      changed: changes,
    };
  });

  const instanceCount = cleanInstances(font, familyMetrics);

  return {
    upm,
    glyphCount: glyphs.length,
    masterCount: masters.length,
    masterResults,
    changedTables,
    useTypoChanged,
    fontCustomParameterChanges,
    instanceCount,
    metricEvidence,
    axisResults,
    dataResults,
  };
}

function computeFamilyMetrics(masters, upm, boundsByMaster) {
  const capHeight = Math.max(
    ...masters.map((master) => toNumber(master.capHeight, NaN)).filter(Number.isFinite),
    Math.round(upm * 0.7),
  );
  const targetLineHeight = Math.round(upm * 1.2);
  const descenderDepth = Math.max(1, Math.round((targetLineHeight - capHeight) / 2));
  let typoAscender = capHeight + descenderDepth;
  let typoDescender = -descenderDepth;

  for (const master of masters) {
    const existingAscender = readMetric(master, "typoAscender", "ascender");
    const existingDescender = readMetric(master, "typoDescender", "descender");
    if (Number.isFinite(existingAscender) && Number.isFinite(existingDescender)) {
      const existingTotal = Math.round(existingAscender - existingDescender);
      if (existingTotal >= upm * 1.15 && existingTotal <= upm * 1.35) {
        typoAscender = Math.max(typoAscender, Math.round(existingAscender));
        typoDescender = Math.min(typoDescender, Math.round(existingDescender));
      }
    }
  }

  const familyBounds = [...boundsByMaster.values()].reduce(
    (result, bounds) => ({
      minY: Math.min(result.minY, bounds.minY),
      maxY: Math.max(result.maxY, bounds.maxY),
    }),
    { minY: Infinity, maxY: -Infinity },
  );
  const hasBounds = Number.isFinite(familyBounds.minY) && Number.isFinite(familyBounds.maxY);
  const yMax = hasBounds ? Math.ceil(familyBounds.maxY) : typoAscender;
  const yMin = hasBounds ? Math.floor(familyBounds.minY) : typoDescender;

  return {
    typoAscender,
    typoDescender,
    hheaAscender: typoAscender,
    hheaDescender: typoDescender,
    winAscent: Math.max(typoAscender, capHeight, yMax),
    winDescent: Math.max(Math.abs(typoDescender), Math.abs(yMin)),
  };
}

function cleanInstances(font, metrics) {
  let count = 0;
  for (const instance of arrayFrom(font.instances)) {
    if (!instance || typeof instance !== "object") continue;
    count += removeRequiredTableBlocks(instance);
    const params = ensureCustomParameters(instance);
    setCustomParameter(params, "Use Typo Metrics", 1);
    setCustomParameter(params, "typoAscender", metrics.typoAscender);
    setCustomParameter(params, "typoDescender", metrics.typoDescender);
    setCustomParameter(params, "typoLineGap", 0);
    setCustomParameter(params, "hheaAscender", metrics.hheaAscender);
    setCustomParameter(params, "hheaDescender", metrics.hheaDescender);
    setCustomParameter(params, "hheaLineGap", 0);
    setCustomParameter(params, "winAscent", metrics.winAscent);
    setCustomParameter(params, "winDescent", metrics.winDescent);
  }
  return count;
}

function applyFontData(font, data) {
  const normalized = normalizeFontData(data);
  let applied = 0;

  for (const field of DATA_FIELDS) {
    const value = normalized[field.id];
    if (!value) continue;
    setGlyphsProperty(font, field.property, value, field.localized);
    applied += 1;
  }

  return {
    applied,
  };
}

function normalizeFontData(data) {
  const result = {};
  for (const field of DATA_FIELDS) {
    let value = data?.[field.id] ?? "";
    value = String(value).trim();
    if (field.id === "vendorID") value = value.slice(0, 4).toUpperCase();
    result[field.id] = value;
  }
  return result;
}

function setGlyphsProperty(font, key, value, localized) {
  const properties = arrayFrom(font.properties);
  const existing = properties.find((item) => item?.key === key);
  const property = existing || { key };

  if (localized) {
    property.values = [
      {
        language: "dflt",
        value,
      },
    ];
    delete property.value;
  } else {
    property.value = value;
    delete property.values;
  }

  if (!existing) properties.push(property);
  font.properties = properties;
}

function setLegacyFontData(font, id, value) {
  // Intentionally empty: Glyphs 3 stores these fields in font.properties.
  // Writing them as top-level tokens creates files that Glyphs cannot open.
}


function applyFontCustomParameters(font, fontParams, axisResults) {
  let changes = 0;

  // Font > Custom Parameters
  // Equivalent to the options shown in Glyphs 3:
  // Use Typo Metrics, Use Extension Kerning, Enforce Compatibility Check,
  // fsType Embedding = Installable, and Variable Font Origin when axes exist.
  changes += setCustomParameter(fontParams, "Use Extension Kerning", 1);
  changes += setCustomParameter(fontParams, "Enforce Compatibility Check", 1);
  changes += setCustomParameter(fontParams, "fsType", 0);

  if (axisResults?.axisCount > 0) {
    changes += setCustomParameter(fontParams, "Variable Font Origin", "Regular VF");
  } else {
    changes += removeCustomParameter(fontParams, "Variable Font Origin");
  }

  return changes;
}

function removeCustomParameter(params, name) {
  const originalLength = params.length;
  for (let index = params.length - 1; index >= 0; index -= 1) {
    if (params[index] && params[index].name === name) {
      params.splice(index, 1);
    }
  }
  return originalLength - params.length;
}

function configureAxes(font, masters) {
  const axes = arrayFrom(font.axes)
    .map((axis, index) => ({
      name: String(axis?.name || axis?.tag || `Axis ${index + 1}`),
      tag: String(axis?.tag || `AX${index + 1}`),
      index,
    }))
    .filter((axis) => axis.name && axis.tag);

  if (!axes.length) {
    return {
      axisCount: 0,
      mappingCount: 0,
      locationCount: 0,
    };
  }

  const mappings = buildAxisMappings(axes, masters);
  setCustomParameter(ensureCustomParameters(font), "Axis Mappings", mappings);

  let locationCount = 0;
  for (const master of masters) {
    if (setAxisLocation(master, axes)) locationCount += 1;
  }
  for (const instance of arrayFrom(font.instances)) {
    if (setAxisLocation(instance, axes)) locationCount += 1;
  }

  return {
    axisCount: axes.length,
    mappingCount: axes.length,
    locationCount,
  };
}

function buildAxisMappings(axes, masters) {
  const mappings = {};
  for (const axis of axes) {
    const values = uniqueSortedNumbers(
      masters
        .map((master) => numericArray(master?.axesValues)[axis.index])
        .filter(Number.isFinite),
    );
    mappings[axis.tag] = {};
    for (const value of values) {
      mappings[axis.tag][formatNumber(value)] = value;
    }
  }
  return mappings;
}

function setAxisLocation(container, axes) {
  if (!container || typeof container !== "object") return false;
  const values = numericArray(container.axesValues);
  if (!values.length) return false;
  const locations = axes
    .map((axis) => {
      const value = values[axis.index];
      if (!Number.isFinite(value)) return null;
      return {
        Axis: axis.name,
        Location: value,
      };
    })
    .filter(Boolean);
  if (!locations.length) return false;
  setCustomParameter(ensureCustomParameters(container), "Axis Location", locations);
  return true;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map((value) => formatNumber(value)))].map(Number).sort((a, b) => a - b);
}

function collectMetricEvidence(glyphs, masters) {
  const layersByGlyph = buildLayerIndex(glyphs, masters);
  const rows = [];

  for (const glyph of glyphs) {
    const glyphName = glyph?.glyphname;
    if (!glyphName) continue;

    for (const layer of arrayFrom(glyph.layers)) {
      const masterId = findMasterId(layer, masters);
      if (!masterId) continue;
      const bounds = collectLayerBounds(layer, String(masterId), layersByGlyph, new Set());
      if (!Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)) continue;
      const master = masters.find((item) => String(item.id) === String(masterId));
      rows.push({
        glyphName: String(glyphName),
        masterName: String(master?.name || master?.internalAxesValues || masterId),
        minY: bounds.minY,
        maxY: bounds.maxY,
      });
    }
  }

  if (!rows.length) {
    return {
      maxY: NaN,
      minY: NaN,
      ascentGlyphs: [],
      descentGlyphs: [],
    };
  }

  const maxY = Math.max(...rows.map((row) => row.maxY));
  const minY = Math.min(...rows.map((row) => row.minY));

  return {
    maxY,
    minY,
    ascentGlyphs: rows
      .filter((row) => row.maxY === maxY)
      .sort(compareEvidenceRows)
      .map(formatEvidenceRow),
    descentGlyphs: rows
      .filter((row) => row.minY === minY)
      .sort(compareEvidenceRows)
      .map(formatEvidenceRow),
  };
}

function compareEvidenceRows(a, b) {
  return a.glyphName.localeCompare(b.glyphName) || a.masterName.localeCompare(b.masterName);
}

function formatEvidenceRow(row) {
  return `${row.glyphName} (${row.masterName})`;
}

function writeMetricNote(font, metrics, evidence) {
  const note = buildMetricNote(metrics, evidence);
  const existing = String(font.note ?? "").trimEnd();
  const pattern = new RegExp(`\\n*${escapeRegExp(METRIC_NOTE_START)}[\\s\\S]*?${escapeRegExp(METRIC_NOTE_END)}\\n*`, "g");
  const cleaned = existing.replace(pattern, "").trimEnd();
  font.note = cleaned ? `${cleaned}\n\n${note}` : note;
}

function buildMetricNote(metrics, evidence) {
  const ascentGlyphs = evidence.ascentGlyphs.length ? evidence.ascentGlyphs.join(", ") : "No detectats";
  const descentGlyphs = evidence.descentGlyphs.length ? evidence.descentGlyphs.join(", ") : "No detectats";
  const maxY = Number.isFinite(evidence.maxY) ? formatNumber(evidence.maxY) : "--";
  const minY = Number.isFinite(evidence.minY) ? formatNumber(evidence.minY) : "--";

  return [
    METRIC_NOTE_START,
    `winAscent = ${metrics.winAscent} (maxY ${maxY})`,
    `Caracters/glifs: ${ascentGlyphs}`,
    `winDescent = ${metrics.winDescent} (minY ${minY})`,
    `Caracters/glifs: ${descentGlyphs}`,
    METRIC_NOTE_END,
  ].join("\n");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeRequiredTableBlocksEverywhere(font) {
  let changes = 0;
  changes += removeRequiredTableBlocks(font);
  for (const master of arrayFrom(font.fontMaster)) changes += removeRequiredTableBlocks(master);
  for (const instance of arrayFrom(font.instances)) changes += removeRequiredTableBlocks(instance);
  return changes;
}

function removeRequiredTableBlocks(container) {
  if (!container || typeof container !== "object") return 0;
  const params = arrayFrom(container.customParameters);
  const originalLength = params.length;
  container.customParameters = params.filter((param) => {
    if (!param || param.name !== "Remove Table") return true;
    const tableName = String(param.value);
    return !REQUIRED_TABLES.has(tableName) && !OUTLINE_TABLES.has(tableName);
  });
  return originalLength - container.customParameters.length;
}

function collectBoundsByMaster(glyphs, masters) {
  const boundsByMaster = new Map();
  const layersByGlyph = buildLayerIndex(glyphs, masters);

  for (const glyph of glyphs) {
    for (const layer of arrayFrom(glyph?.layers)) {
      const masterId = findMasterId(layer, masters);
      if (!masterId) continue;
      const bounds = boundsByMaster.get(String(masterId)) || {
        minY: Infinity,
        maxY: -Infinity,
      };
      const layerBounds = collectLayerBounds(layer, String(masterId), layersByGlyph, new Set());
      mergeBounds(bounds, layerBounds);

      boundsByMaster.set(String(masterId), bounds);
    }
  }

  return boundsByMaster;
}

function buildLayerIndex(glyphs, masters) {
  const index = new Map();
  for (const glyph of glyphs) {
    const glyphName = glyph?.glyphname;
    if (!glyphName) continue;
    const layers = new Map();
    for (const layer of arrayFrom(glyph.layers)) {
      const masterId = findMasterId(layer, masters);
      if (masterId) layers.set(String(masterId), layer);
    }
    index.set(String(glyphName), layers);
  }
  return index;
}

function findMasterId(layer, masters) {
  const directId = layer?.associatedMasterId ?? layer?.layerId;
  if (!directId) return "";
  const direct = String(directId);
  if (masters.some((master) => String(master.id) === direct)) return direct;
  return "";
}

function collectLayerBounds(layer, masterId, layersByGlyph, stack) {
  const bounds = { minY: Infinity, maxY: -Infinity };
  collectShapeBounds(arrayFrom(layer.paths), bounds, masterId, layersByGlyph, stack, [1, 0, 0, 1, 0, 0]);
  collectShapeBounds(arrayFrom(layer.shapes), bounds, masterId, layersByGlyph, stack, [1, 0, 0, 1, 0, 0]);
  return bounds;
}

function collectShapeBounds(shapes, bounds, masterId, layersByGlyph, stack, transform) {
  for (const shape of shapes) {
    if (!shape || typeof shape !== "object") continue;

    for (const node of arrayFrom(shape.nodes)) {
      const point = parseNodePoint(node);
      if (!point) continue;
      const transformed = applyTransform(point, transform);
      bounds.minY = Math.min(bounds.minY, transformed.y);
      bounds.maxY = Math.max(bounds.maxY, transformed.y);
    }

    collectShapeBounds(arrayFrom(shape.paths), bounds, masterId, layersByGlyph, stack, transform);
    collectShapeBounds(arrayFrom(shape.shapes), bounds, masterId, layersByGlyph, stack, transform);

    const ref = shape.ref ?? shape.name;
    if (!ref) continue;
    const refKey = String(ref);
    const stackKey = `${masterId}:${refKey}`;
    if (stack.has(stackKey)) continue;
    const refLayer = layersByGlyph.get(refKey)?.get(masterId);
    if (!refLayer) continue;

    stack.add(stackKey);
    const componentTransform = composeTransforms(transform, componentTransformFromShape(shape));
    const refBounds = { minY: Infinity, maxY: -Infinity };
    collectShapeBounds(arrayFrom(refLayer.paths), refBounds, masterId, layersByGlyph, stack, componentTransform);
    collectShapeBounds(arrayFrom(refLayer.shapes), refBounds, masterId, layersByGlyph, stack, componentTransform);
    mergeBounds(bounds, refBounds);
    stack.delete(stackKey);
  }
}

function mergeBounds(target, source) {
  if (!Number.isFinite(source.minY) || !Number.isFinite(source.maxY)) return;
  target.minY = Math.min(target.minY, source.minY);
  target.maxY = Math.max(target.maxY, source.maxY);
}

function componentTransformFromShape(shape) {
  const transform = numericArray(shape.transform);
  let matrix = transform.length === 6 ? transform : [1, 0, 0, 1, 0, 0];
  const scale = parseScaleValue(shape.scale);
  if (scale) {
    matrix = composeTransforms(matrix, [scale.x, 0, 0, scale.y, 0, 0]);
  }
  const angle = toNumber(shape.angle, 0);
  if (angle) {
    const radians = (angle * Math.PI) / 180;
    const cos = cleanFloat(Math.cos(radians));
    const sin = cleanFloat(Math.sin(radians));
    matrix = composeTransforms(matrix, [cos, sin, -sin, cos, 0, 0]);
  }
  const position = parsePointValue(shape.pos);
  if (position) {
    matrix = composeTransforms([1, 0, 0, 1, position.x, position.y], matrix);
  }
  return matrix;
}

function parseScaleValue(value) {
  if (value === undefined || value === null) return null;
  const numbers = numericArray(value);
  if (!numbers.length) return null;
  return {
    x: numbers[0],
    y: numbers.length > 1 ? numbers[1] : numbers[0],
  };
}

function composeTransforms(first, second) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function applyTransform(point, transform) {
  return {
    x: transform[0] * point.x + transform[2] * point.y + transform[4],
    y: transform[1] * point.x + transform[3] * point.y + transform[5],
  };
}

function parseNodePoint(node) {
  if (Array.isArray(node)) {
    return parsePointValue(node);
  }

  if (typeof node === "string") {
    const numbers = node.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) return null;
    return { x: Number(numbers[0]), y: Number(numbers[1]) };
  }

  if (node && typeof node === "object") {
    const x = toNumber(node.x, NaN);
    const y = toNumber(node.y, NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }

  return null;
}

function parsePointValue(value) {
  const numbers = numericArray(value);
  if (numbers.length < 2) return null;
  return { x: numbers[0], y: numbers[1] };
}

function numericArray(value) {
  return arrayFrom(value).map((item) => Number(item)).filter(Number.isFinite);
}

function cleanFloat(value) {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

function readMetric(master, parameterName, fallbackKey) {
  const custom = getCustomParameter(arrayFrom(master.customParameters), parameterName);
  if (custom !== undefined) return toNumber(custom, NaN);
  return toNumber(master[fallbackKey], NaN);
}

function ensureCustomParameters(container) {
  if (!Array.isArray(container.customParameters)) {
    container.customParameters = arrayFrom(container.customParameters);
  }
  return container.customParameters;
}

function setCustomParameter(params, name, value) {
  const existing = params.find((param) => param && param.name === name);
  if (existing) {
    const changed = existing.value !== value ? 1 : 0;
    existing.value = value;
    return changed;
  }
  params.push({ name, value });
  return 1;
}

function getCustomParameter(params, name) {
  const item = params.find((param) => param && param.name === name);
  return item ? item.value : undefined;
}

function arrayFrom(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function renderReport(result) {
  setStatus("Preparat", "ok");
  const tablesLabel = result.changedTables ? `${result.changedTables} netejades` : "OK";
  elements.metricsGrid.innerHTML = `
    <div><span>Màsters</span><strong>${result.masterCount}</strong></div>
    <div><span>UPM</span><strong>${result.upm}</strong></div>
    <div><span>Glifs</span><strong>${result.glyphCount}</strong></div>
    <div><span>Taules</span><strong>${escapeHtml(tablesLabel)}</strong></div>
  `;

  const checks = [
    {
      text: "Vertical Metrics configurades amb typoLineGap i hheaLineGap a 0.",
      state: "ok",
    },
    {
      text: "typo/hhea comparteixen els mateixos valors en tots els màsters i instances.",
      state: "ok",
    },
    {
      text: "Use Typo Metrics activat per ajudar a establir OS/2 fsSelection bit 7.",
      state: "ok",
    },
    {
      text: result.changedTables
        ? `S'han eliminat ${result.changedTables} bloquejos de taules OpenType obligatòries.`
        : "No hi havia bloquejos de taules OpenType requerides o d'outline.",
      state: "ok",
    },
    {
      text: "S'ha escrit una nota a Font Info amb winAscent/winDescent i els glifs que els provoquen.",
      state: "ok",
    },
    {
      text: result.axisResults.axisCount
        ? `Axis Mappings i ${result.axisResults.locationCount} Axis Location configurats per ${result.axisResults.axisCount} eix/os.`
        : "No s'han trobat eixos variables per configurar Axis Mappings.",
      state: result.axisResults.axisCount ? "ok" : "warn",
    },
    {
      text: result.dataResults.applied
        ? `${result.dataResults.applied} camps de Font Info > General aplicats des de Data.`
        : "Cap camp de Data aplicat a Font Info > General.",
      state: result.dataResults.applied ? "ok" : "warn",
    },
  ];

  elements.checklist.innerHTML = checks
    .map((check) => `<li class="${check.state === "ok" ? "" : check.state}">${escapeHtml(check.text)}</li>`)
    .join("");

  const hasBounds = result.masterResults.some(
    (master) => Number.isFinite(master.bounds.minY) && Number.isFinite(master.bounds.maxY),
  );
  elements.boundsPill.textContent = hasBounds ? "Bounds llegits" : "Bounds inferits";
  elements.boundsPill.className = `status-pill ${hasBounds ? "ok" : "warn"}`;

  elements.masterRows.innerHTML = result.masterResults
    .map((master) => {
      const m = master.metrics;
      return `
        <tr>
          <td>${escapeHtml(String(master.name))}</td>
          <td>${m.typoAscender}</td>
          <td>${m.typoDescender}</td>
          <td>${m.hheaAscender}</td>
          <td>${m.hheaDescender}</td>
          <td>${m.winAscent}</td>
          <td>${m.winDescent}</td>
        </tr>
      `;
    })
    .join("");
}

function renderFontInspection(result) {
  const hasTableErrors = result.missingRequired.length > 0;
  const hasMetricErrors = !result.metricsConsistent || !result.os2?.useTypoMetrics;
  setStatus(hasTableErrors || hasMetricErrors ? "Revisar" : "OK", hasTableErrors || hasMetricErrors ? "warn" : "ok");
  elements.downloadButton.disabled = true;

  elements.metricsGrid.innerHTML = `
    <div><span>Taules</span><strong>${result.tables.length}</strong></div>
    <div><span>Falten</span><strong>${result.missingRequired.length}</strong></div>
    <div><span>Use Typo</span><strong>${result.os2?.useTypoMetrics ? "Sí" : "No"}</strong></div>
    <div><span>Outline</span><strong>${escapeHtml(result.outlineTables.join(", ") || "--")}</strong></div>
  `;

  const checks = [];
  if (result.missingRequired.length) {
    checks.push({
      state: "bad",
      text: `Falten taules requerides: ${result.missingRequired.join(", ")}.`,
    });
  } else {
    checks.push({
      state: "ok",
      text: "La font exportada conté totes les taules OpenType requerides pel validador.",
    });
  }

  if (!result.os2) {
    checks.push({ state: "bad", text: "No s'ha trobat la taula OS/2." });
  } else if (!result.os2.useTypoMetrics) {
    checks.push({ state: "bad", text: "OS/2 fsSelection bit 7 no està activat: Use Typo Metrics no ha arribat a l'export." });
  } else {
    checks.push({ state: "ok", text: "Use Typo Metrics està activat dins OS/2." });
  }

  if (!result.hhea) {
    checks.push({ state: "bad", text: "No s'ha trobat la taula hhea." });
  } else if (!result.metricsConsistent) {
    checks.push({ state: "bad", text: "OS/2 typo metrics i hhea metrics no coincideixen." });
  } else {
    checks.push({ state: "ok", text: "OS/2 typo metrics i hhea metrics coincideixen." });
  }

  if (result.os2 && result.hhea) {
    checks.push({
      state: "ok",
      text: `OS/2 typo ${result.os2.typoAscender}/${result.os2.typoDescender}/${result.os2.typoLineGap}, hhea ${result.hhea.ascender}/${result.hhea.descender}/${result.hhea.lineGap}, win ${result.os2.winAscent}/${result.os2.winDescent}.`,
    });
  }

  elements.checklist.innerHTML = checks
    .map((check) => `<li class="${check.state === "ok" ? "" : check.state}">${escapeHtml(check.text)}</li>`)
    .join("");

  elements.boundsPill.textContent = "Font exportada";
  elements.boundsPill.className = "status-pill quiet";
  elements.masterRows.innerHTML = `
    <tr>
      <td>OS/2</td>
      <td>${result.os2?.typoAscender ?? "--"}</td>
      <td>${result.os2?.typoDescender ?? "--"}</td>
      <td>${result.hhea?.ascender ?? "--"}</td>
      <td>${result.hhea?.descender ?? "--"}</td>
      <td>${result.os2?.winAscent ?? "--"}</td>
      <td>${result.os2?.winDescent ?? "--"}</td>
    </tr>
  `;
}

function showError(message) {
  setStatus("Error", "bad");
  elements.checklist.innerHTML = `<li class="bad">${escapeHtml(message)}</li>`;
  elements.downloadButton.disabled = true;
}

function activateTab(name) {
  for (const tab of elements.tabs) {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  }
  for (const panel of elements.panels) {
    panel.classList.toggle("is-active", panel.id === `${name}Panel`);
  }
}

async function loadDataFile(file) {
  try {
    const data = JSON.parse(await file.text());
    writeDataFields(data);
    setDataStatus("Dades carregades", "ok");
  } catch (error) {
    console.error(error);
    setDataStatus("JSON no vàlid", "bad");
  }
}

function saveDataFile() {
  const data = readDataFields();
  if (dataObjectUrl) URL.revokeObjectURL(dataObjectUrl);
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  dataObjectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = dataObjectUrl;
  link.download = "glyphs-font-data.json";
  link.click();
  setDataStatus("Dades desades", "ok");
}

function readDataFields() {
  const data = {};
  for (const field of DATA_FIELDS) {
    data[field.id] = elements.dataInputs[field.id]?.value || "";
  }
  return data;
}

function writeDataFields(data) {
  for (const field of DATA_FIELDS) {
    const input = elements.dataInputs[field.id];
    if (!input) continue;
    input.value = String(data?.[field.id] ?? "");
  }
}

function setStatus(text, state) {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${state || ""}`;
}

function setDataStatus(text, state) {
  elements.dataStatus.textContent = text;
  elements.dataStatus.className = `status-pill ${state || "quiet"}`;
}

function resetUi() {
  resetDownload();
  elements.fileInput.value = "";
  elements.fileSummary.hidden = true;
  elements.fileName.textContent = "Sense arxiu";
  elements.fileSize.textContent = "";
  setStatus("Esperant arxiu", "");
  elements.metricsGrid.innerHTML = `
    <div><span>Màsters</span><strong>--</strong></div>
    <div><span>UPM</span><strong>--</strong></div>
    <div><span>Glifs</span><strong>--</strong></div>
    <div><span>Taules</span><strong>--</strong></div>
  `;
  elements.checklist.innerHTML = "<li>Carrega un arxiu per començar.</li>";
  elements.masterRows.innerHTML = '<tr><td colspan="7">Encara no hi ha cap arxiu carregat.</td></tr>';
  elements.boundsPill.textContent = "Sense dades";
  elements.boundsPill.className = "status-pill quiet";
}

function resetDownload() {
  fixedText = "";
  fixedName = "configured.glyphs";
  elements.downloadButton.disabled = true;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class GlyphsParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.tokens = tokenize(source);
  }

  parse() {
    const value = this.parseValue();
    if (this.index < this.tokens.length) {
      throw new Error(`Contingut inesperat a prop de "${this.peek()?.value}".`);
    }
    return value;
  }

  parseValue() {
    const token = this.next();
    if (!token) throw new Error("Final inesperat de l'arxiu.");

    if (token.value === "{") return this.parseDictionary();
    if (token.value === "(") return this.parseArray();
    if (token.type === "string") return token.value;
    return atomValue(token.value);
  }

  parseDictionary() {
    const result = {};
    while (!this.match("}")) {
      const keyToken = this.next();
      if (!keyToken) throw new Error("Diccionari sense tancar.");
      const key = keyToken.value;
      this.expect("=");
      result[key] = this.parseValue();
      this.match(";");
      this.match(",");
    }
    return result;
  }

  parseArray() {
    const result = [];
    while (!this.match(")")) {
      result.push(this.parseValue());
      this.match(",");
      this.match(";");
    }
    return result;
  }

  peek() {
    return this.tokens[this.index];
  }

  next() {
    return this.tokens[this.index++];
  }

  match(value) {
    if (this.peek()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  expect(value) {
    const token = this.next();
    if (token?.value !== value) {
      throw new Error(`S'esperava "${value}" i s'ha trobat "${token?.value ?? "final"}".`);
    }
  }
}

function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }

    if (char === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    if ("{}()=;,".includes(char)) {
      tokens.push({ type: "punct", value: char });
      i += 1;
      continue;
    }

    if (char === '"') {
      let value = "";
      i += 1;
      while (i < source.length) {
        const current = source[i++];
        if (current === '"') break;
        if (current === "\\") {
          const escaped = source[i++];
          value += decodeEscape(escaped);
        } else {
          value += current;
        }
      }
      tokens.push({ type: "string", value });
      continue;
    }

    let value = "";
    while (i < source.length && !/\s/.test(source[i]) && !"{}()=;,".includes(source[i])) {
      value += source[i++];
    }
    tokens.push({ type: "atom", value });
  }

  return tokens;
}

function decodeEscape(char) {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  return char ?? "";
}

function atomValue(value) {
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function serializeValue(value, depth) {
  if (Array.isArray(value)) return serializeArray(value, depth);
  if (value && typeof value === "object") return serializeDictionary(value, depth);
  if (typeof value === "number" && Number.isFinite(value)) return formatNumber(value);
  return quoteString(String(value ?? ""));
}

function serializeDictionary(value, depth) {
  const indent = "\t".repeat(depth);
  const childIndent = "\t".repeat(depth + 1);
  const lines = ["{"];

  for (const key of Object.keys(value)) {
    lines.push(`${childIndent}${quoteKey(key)} = ${serializeValue(value[key], depth + 1)};`);
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

function serializeArray(value, depth) {
  if (!value.length) return "()";
  if (isFlatScalarArray(value)) {
    return `(${value.map((item) => serializeValue(item, depth)).join(", ")})`;
  }

  const indent = "\t".repeat(depth);
  const childIndent = "\t".repeat(depth + 1);
  const lines = ["("];

  for (const item of value) {
    lines.push(`${childIndent}${serializeValue(item, depth + 1)},`);
  }

  lines.push(`${indent})`);
  return lines.join("\n");
}

function isFlatScalarArray(value) {
  return value.every((item) => !Array.isArray(item) && (!item || typeof item !== "object"));
}

function quoteKey(value) {
  return isBareWord(value) ? String(value) : quoteString(String(value));
}

function quoteString(value) {
  if (isBareWord(value) && !/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

function isBareWord(value) {
  return /^[A-Za-z0-9_.+:/-]+$/.test(value);
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

window.__glyphsValidatorFixer = {
  GlyphsParser,
  configureGlyphs,
  serializeValue,
  METRIC_PARAMETER_NAMES,
};
