/**
 * errorParser.js
 *
 * Convierte la salida de texto de arduino-cli / ESP-IDF (estilo gcc) en el
 * arreglo de errores definido en docs/contracts/compile-response.schema.json:
 *   { file, line, column, severity, message }
 *
 * Esta es la pieza que permite que la tarea de esta semana ("parseo de
 * errores del compilador, mapeo a lineas del editor") funcione: el editor
 * de Jesus solo necesita este formato para poder marcar la linea exacta
 * del error dentro de Monaco/CodeMirror.
 */

// Formato tipico de gcc / arduino-cli:
//   /tmp/xyz/sketch/sketch.ino:12:3: error: expected ';' before '}' token
//   /tmp/xyz/sketch/sketch.ino:20:1: warning: unused variable 'x' [-Wunused-variable]
const LINE_PATTERN = /^(.*?):(\d+):(\d+):\s*(error|warning|note)\s*:\s*(.+)$/;

// El compilador reporta rutas absolutas del archivo temporal donde se
// escribio el sketch; el editor solo conoce los nombres originales de
// archivo (ver compileController.js). Esta funcion recupera solo el
// nombre de archivo para que coincida con lo que el usuario ve en el IDE.
function toEditorFileName(absolutePath) {
  const parts = absolutePath.split(/[\\/]/);
  return parts[parts.length - 1] || absolutePath;
}

// El schema solo acepta "error" | "warning" | "info"
function mapSeverity(gccSeverity) {
  if (gccSeverity === "note") return "info";
  return gccSeverity; // "error" | "warning"
}

/**
 * @param {string} rawOutput  stdout+stderr crudo de arduino-cli/ESP-IDF
 * @returns {{file:string, line:number, column:number, severity:string, message:string}[]}
 */
function parseCompilerOutput(rawOutput) {
  if (!rawOutput) return [];

  const errors = [];
  const lines = rawOutput.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(LINE_PATTERN);
    if (!match) continue;

    const [, filePath, lineNo, columnNo, severity, message] = match;

    errors.push({
      file: toEditorFileName(filePath),
      line: parseInt(lineNo, 10),
      column: parseInt(columnNo, 10),
      severity: mapSeverity(severity),
      message: message.trim(),
    });
  }

  return errors;
}

// Mensaje de resumen corto para el campo "message" de compile-response
// cuando la compilacion falla, sin repetir todo el log.
function summarizeFailure(errors) {
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;

  if (errorCount === 0 && warningCount === 0) {
    return "La compilacion falló, pero no se pudo interpretar el detalle del error.";
  }

  const parts = [];
  if (errorCount > 0) parts.push(`${errorCount} error(es)`);
  if (warningCount > 0) parts.push(`${warningCount} advertencia(s)`);
  return `Compilación fallida: ${parts.join(" y ")}.`;
}

module.exports = { parseCompilerOutput, summarizeFailure, toEditorFileName, mapSeverity };
