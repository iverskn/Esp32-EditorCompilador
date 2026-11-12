// backend/controllers/compileController.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseCompilerErrors } = require('../utils/errorParser');

const WORKSPACE_DIR = path.join(__dirname, '..', 'workspace');

// Asegurar que exista el directorio de trabajo para los Sketches
if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

const compilarCodigo = (req, res) => {
    const { code, fqbn = 'esp32:esp32:esp32', sketchName = 'TempSketch' } = req.body;

    if (!code) {
        return res.status(400).json({ 
            success: false, 
            message: 'El código fuente está vacío.' 
        });
    }

    // arduino-cli exige que el archivo .ino esté dentro de una carpeta con el mismo nombre
    const sketchFolder = path.join(WORKSPACE_DIR, sketchName);
    const sketchFile = path.join(sketchFolder, `${sketchName}.ino`);
    const buildDir = path.join(sketchFolder, 'build');

    try {
        fs.mkdirSync(sketchFolder, { recursive: true });
        fs.writeFileSync(sketchFile, code, 'utf-8');
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Error al escribir el archivo temporal en disco: ' + err.message
        });
    }

    const comando = `arduino-cli compile --fqbn ${fqbn} --output-dir "${buildDir}" "${sketchFolder}"`;

    exec(comando, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
            const erroresParseados = parseCompilerErrors ? parseCompilerErrors(stderr) : [];
            return res.status(400).json({
                success: false,
                status: 'ERROR',
                stdout,
                stderr,
                errors: erroresParseados,
                sketchPath: sketchFolder
            });
        }

        res.json({
            success: true,
            status: 'SUCCESS',
            stdout,
            stderr,
            errors: [],
            sketchPath: sketchFolder,
            binaryPath: path.join(buildDir, `${sketchName}.ino.bin`)
        });
    });
};

// Funcionalidad avanzada: Listar archivos del Sketchbook local
const listarSketches = (req, res) => {
    try {
        const carpetas = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const inoPath = path.join(WORKSPACE_DIR, dirent.name, `${dirent.name}.ino`);
                return {
                    name: dirent.name,
                    path: path.join(WORKSPACE_DIR, dirent.name),
                    content: fs.existsSync(inoPath) ? fs.readFileSync(inoPath, 'utf-8') : ''
                };
            });
        res.json({ success: true, sketches: carpetas });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    compilarCodigo,
    listarSketches
};