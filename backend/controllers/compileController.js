/**
 * compileController.js
 *
 * Esta es la parte que le toca a Paul: recibir el codigo del editor y
 * llamar al toolchain real (arduino-cli, que a su vez usa ESP-IDF para
 * el target ESP32), siguiendo compile-request.schema.json y devolviendo
 * compile-response.schema.json.
 *
 * Requiere que arduino-cli este instalado y el core de ESP32 agregado:
 *   arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
 *   arduino-cli core install esp32:esp32 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
 */

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const { parseCompilerOutput, summarizeFailure } = require("../utils/errorParser");

const DEFAULT_FQBN = "esp32:esp32:esp32";
const COMPILE_TIMEOUT_MS = 60_000;

function runArduinoCli(args) {
  return new Promise((resolve) => {
    execFile(
      "arduino-cli",
      args,
      { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // No rechazamos la promesa: un error de compilacion es un
        // resultado valido (exit code != 0), no una falla del backend.
        resolve({
          error,
          stdout: stdout || "",
          stderr: stderr || "",
          notFound: error && error.code === "ENOENT",
        });
      }
    );
  });
}

function validateCompileRequest(body) {
  if (!body || typeof body !== "object") return "El body debe ser un objeto JSON.";
  if (!body.fqbn || typeof body.fqbn !== "string") return "Falta 'fqbn' (Fully Qualified Board Name).";
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return "'files' debe ser un arreglo con al menos un archivo.";
  }
  for (const f of body.files) {
    if (!f || typeof f.name !== "string" || typeof f.content !== "string") {
      return "Cada elemento de 'files' necesita 'name' y 'content' como texto.";
    }
    if (!/^[a-zA-Z0-9_-]+\.(ino|cpp|h|c)$/.test(f.name)) {
      return `Nombre de archivo invalido: ${f.name}`;
    }
  }
  if (!body.files.some((f) => f.name.endsWith(".ino"))) {
    return "Se necesita al menos un archivo .ino como punto de entrada del sketch.";
  }
  return null;
}

/**
 * POST /api/compile
 * body: { fqbn, files: [{ name, content }] }
 */
async function compile(req, res) {
  const validationError = validateCompileRequest(req.body);
  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
      hexBinary: null,
      errors: [],
    });
  }

  const { files } = req.body;
  const fqbn = req.body.fqbn || DEFAULT_FQBN;

  // arduino-cli exige que la carpeta del sketch tenga el mismo nombre
  // que el archivo .ino principal.
  const mainFile = files.find((f) => f.name.endsWith(".ino"));
  const sketchName = path.basename(mainFile.name, ".ino");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "esp32ide-"));
  const sketchDir = path.join(workDir, sketchName);
  const outputDir = path.join(workDir, "build");

  try {
    await fs.mkdir(sketchDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    await Promise.all(
      files.map((f) => fs.writeFile(path.join(sketchDir, f.name), f.content, "utf8"))
    );

    const { stdout, stderr, notFound } = await runArduinoCli([
      "compile",
      "--fqbn",
      fqbn,
      "--output-dir",
      outputDir,
      sketchDir,
    ]);

    if (notFound) {
      return res.status(500).json({
        success: false,
        message:
          "arduino-cli no esta instalado o no esta en el PATH del servidor. Instalalo y agrega el core esp32:esp32.",
        hexBinary: null,
        errors: [],
      });
    }

    const combinedOutput = `${stdout}\n${stderr}`;
    const errors = parseCompilerOutput(combinedOutput);
    const success = errors.every((e) => e.severity !== "error") && !combinedOutput.toLowerCase().includes("error:");

    let hexBinary = null;
    if (success) {
      const binPath = await findBinFile(outputDir, sketchName);
      if (binPath) {
        const binContent = await fs.readFile(binPath);
        hexBinary = binContent.toString("base64");
      }
    }

    return res.status(200).json({
      success,
      message: success ? "Compilacion exitosa." : summarizeFailure(errors),
      hexBinary,
      errors,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Error inesperado del backend al compilar: ${err.message}`,
      hexBinary: null,
      errors: [],
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function findBinFile(outputDir, sketchName) {
  try {
    const entries = await fs.readdir(outputDir);
    const binName = entries.find((name) => name.endsWith(".bin") && name.includes(sketchName));
    return binName ? path.join(outputDir, binName) : null;
  } catch {
    return null;
  }
}

module.exports = { compile };
