/**
 * server.js
 * Backend del modulo editor/compilador - IDE ESP32.
 *
 * Expone POST /api/compile, que recibe un sketch (ver
 * docs/contracts/compile-request.schema.json) y responde con el resultado
 * de la compilacion (ver docs/contracts/compile-response.schema.json).
 *
 * Nota de equipo: este archivo es un punto de partida minimo para poder
 * probar compileController.js de punta a punta. Iver: siéntete libre de
 * ampliarlo (más rutas, el websocket de flasheo, manejo de errores HTTP
 * mas fino, logging, etc.) - esta es la base de infraestructura que te
 * toca a ti.
 */

// backend/server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');

const { compilarCodigo, listarSketches } = require('./controllers/compileController');
const { listarPuertos, iniciarFlasheoWS } = require('./controllers/flashController');

const app = express();
const server = http.createServer(app);

// Configuración de Middlewares
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- RUTAS REST ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', service: 'ESP32 IDE Backend' });
});

// Compilación y Sketchbook
app.post('/api/compile', compilarCodigo);
app.get('/api/sketches', listarSketches);

// Gestión de Puertos USB
app.get('/api/ports', listarPuertos);

// Funcionalidad Avanzada 1: Listar placas ESP32 instaladas y versiones
app.get('/api/boards', (req, res) => {
    exec('arduino-cli board listall esp32 --format json', (err, stdout) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, boards: JSON.parse(stdout || '{}') });
    });
});

// Funcionalidad Avanzada 2: Buscar e instalar librerías (Centro de bibliotecas)
app.get('/api/libraries/search', (req, res) => {
    const query = req.query.q || 'esp32';
    exec(`arduino-cli lib search "${query}" --format json`, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, result: JSON.parse(stdout || '{}') });
    });
});

app.post('/api/libraries/install', (req, res) => {
    const { libraryName } = req.body;
    if (!libraryName) return res.status(400).json({ success: false, error: 'Nombre de librería requerido' });
    exec(`arduino-cli lib install "${libraryName}"`, (err, stdout, stderr) => {
        if (err) return res.status(400).json({ success: false, error: stderr || err.message });
        res.json({ success: true, message: `Librería ${libraryName} instalada`, stdout });
    });
});

// --- SERVIDOR WEBSOCKET (Flasheo y Monitor Serial en tiempo real) ---
const wss = new WebSocketServer({ server, path: '/ws/flash' });

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
        type: 'INFO',
        stage: 'CONNECTED',
        message: 'Canal WebSocket conectado con el backend de flasheo.'
    }));

    ws.on('message', (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage.toString());

            if (data.action === 'START_FLASH') {
                iniciarFlasheoWS(ws, data.payload);
            } else {
                ws.send(JSON.stringify({
                    type: 'WARNING',
                    message: `Acción no reconocida: ${data.action}`
                }));
            }
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Formato JSON inválido en mensaje WebSocket.'
            }));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Backend + WebSocket corriendo en http://localhost:${PORT}`);
    console.log(`WebSocket de Flasheo listo en ws://localhost:${PORT}/ws/flash`);
});