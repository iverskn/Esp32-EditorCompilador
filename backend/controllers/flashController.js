// backend/controllers/flashController.js
const { spawn } = require('child_process');
const { SerialPort } = require('serialport');
const path = require('path');
const fs = require('fs');

// 1. Endpoint REST para listar puertos USB disponibles
const listarPuertos = async (req, res) => {
    try {
        const ports = await SerialPort.list();
        const puertosFormateados = ports.map(p => ({
            path: p.path, // Ej. "COM3" o "/dev/ttyUSB0"
            manufacturer: p.manufacturer || 'Desconocido',
            serialNumber: p.serialNumber || '',
            vendorId: p.vendorId || '',
            productId: p.productId || ''
        }));
        res.json({ success: true, ports: puertosFormateados });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Error al detectar puertos USB: ' + error.message 
        });
    }
};

// 2. Manejador de Flasheo por WebSocket en tiempo real
const iniciarFlasheoWS = (ws, payload) => {
    const { port, fqbn = 'esp32:esp32:esp32', sketchPath, baudrate = '115200' } = payload;

    if (!port || !sketchPath) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            stage: 'INIT',
            message: 'Faltan parámetros requeridos: puerto (port) o ruta del sketch (sketchPath).'
        }));
        return;
    }

    if (!fs.existsSync(sketchPath)) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            stage: 'INIT',
            message: `La ruta del sketch no existe: ${sketchPath}`
        }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'INFO',
        stage: 'CONNECTING',
        progress: 0,
        message: `Iniciando carga hacia placa ${fqbn} en puerto ${port}...`
    }));

    // Ejecutamos arduino-cli upload (que por debajo invoca a esptool para el ESP32)
    const args = [
        'upload',
        '-p', port,
        '--fqbn', fqbn,
        '--upload-property', `upload.speed=${baudrate}`,
        sketchPath,
        '--verbose'
    ];

    const proceso = spawn('arduino-cli', args);

    // Expresión regular para capturar el porcentaje de esptool: ej. "Writing at 0x00010000... (25 %)"
    const regexProgreso = /\((\d+)\s*%\)/;

    proceso.stdout.on('data', (data) => {
        const lineas = data.toString().split('\n');
        lineas.forEach(linea => {
            const texto = linea.trim();
            if (!texto) return;

            let progress = null;
            let stage = 'WRITING';

            const match = texto.match(regexProgreso);
            if (match) {
                progress = parseInt(match[1], 10);
            } else if (texto.includes('Connecting')) {
                stage = 'CONNECTING';
            } else if (texto.includes('Hash of data verified') || texto.includes('Leaving...')) {
                stage = 'VERIFYING';
                progress = 100;
            }

            ws.send(JSON.stringify({
                type: 'INFO',
                stage,
                progress,
                message: texto
            }));
        });
    });

    proceso.stderr.on('data', (data) => {
        const texto = data.toString().trim();
        if (!texto) return;

        // esptool a veces imprime progreso o avisos en stderr; distinguimos errores fatales
        const esErrorFatal = texto.toLowerCase().includes('error') || 
                             texto.toLowerCase().includes('failed') || 
                             texto.toLowerCase().includes('timed out');

        ws.send(JSON.stringify({
            type: esErrorFatal ? 'ERROR' : 'WARNING',
            stage: 'FLASHING',
            message: texto
        }));
    });

    proceso.on('close', (code) => {
        if (code === 0) {
            ws.send(JSON.stringify({
                type: 'SUCCESS',
                stage: 'DONE',
                progress: 100,
                message: 'Código cargado exitosamente en el ESP32.'
            }));
        } else {
            ws.send(JSON.stringify({
                type: 'ERROR',
                stage: 'FAILED',
                message: `El proceso de flasheo falló con código de salida ${code}. Verifica que el puerto ${port} no esté ocupado y presiona el botón BOOT en tu ESP32 si es necesario.`
            }));
        }
    });

    proceso.on('error', (err) => {
        ws.send(JSON.stringify({
            type: 'ERROR',
            stage: 'SPAWN_ERROR',
            message: `No se pudo ejecutar arduino-cli / esptool: ${err.message}`
        }));
    });
};

module.exports = {
    listarPuertos,
    iniciarFlasheoWS
};