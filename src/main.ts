import * as monaco from 'monaco-editor';
import { obtenerPuertosUSB, compilarSketch, flashearPlacaWS } from './api/compilerClient';

const CODIGO_INICIAL = `// Sketch de prueba para ESP32
void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
}

void loop() {
  digitalWrite(2, HIGH);
  delay(500);
  digitalWrite(2, LOW);
  delay(500);
  Serial.println("ESP32 funcionando desde el IDE!");
}
`;

// Inicializar Monaco Editor
const editorContainer = document.getElementById('editor-container')!;
const editor = monaco.editor.create(editorContainer, {
  value: CODIGO_INICIAL,
  language: 'cpp',
  theme: 'vs-dark',
  automaticLayout: true,
  fontSize: 14,
  minimap: { enabled: true }
});

// Referencias UI
const btnVerify = document.getElementById('btn-verify') as HTMLButtonElement;
const btnUpload = document.getElementById('btn-upload') as HTMLButtonElement;
const btnRefreshPorts = document.getElementById('btn-refresh-ports') as HTMLButtonElement;
const btnClearConsole = document.getElementById('btn-clear-console') as HTMLButtonElement;
const portSelect = document.getElementById('port-select') as HTMLSelectElement;
const boardSelect = document.getElementById('board-select') as HTMLSelectElement;
const sketchNameInput = document.getElementById('sketch-name') as HTMLInputElement;
const consoleOutput = document.getElementById('console-output') as HTMLDivElement;
const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLSpanElement;

let ultimoSketchPath = '';

function agregarLog(mensaje: string, tipo: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO') {
  const linea = document.createElement('div');
  linea.className = `log-${tipo.toLowerCase()}`;
  const hora = new Date().toLocaleTimeString();
  linea.textContent = `[${hora}] [${tipo}] ${mensaje}`;
  consoleOutput.appendChild(linea);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// 1. Cargar puertos USB disponibles desde el Backend
async function cargarPuertos() {
  try {
    const data = await obtenerPuertosUSB();
    portSelect.innerHTML = '';
    if (data.success && data.ports.length > 0) {
      data.ports.forEach((p: any) => {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = `${p.path} (${p.manufacturer})`;
        portSelect.appendChild(opt);
      });
      agregarLog(`Puertos detectados: ${data.ports.map((p: any) => p.path).join(', ')}`, 'INFO');
    } else {
      portSelect.innerHTML = '<option value="">Sin placas conectadas</option>';
      agregarLog('No se detectaron placas ESP32 conectadas por USB.', 'WARNING');
    }
  } catch (err: any) {
    agregarLog('No se pudo conectar al backend en http://localhost:3000. ¿Está corriendo node server.js?', 'ERROR');
  }
}

// 2. Botón Verificar / Compilar
btnVerify.addEventListener('click', async () => {
  const code = editor.getValue();
  const sketchName = sketchNameInput.value.trim() || 'TempSketch';
  const fqbn = boardSelect.value;

  btnVerify.disabled = true;
  btnUpload.disabled = true;
  agregarLog(`Compilando "${sketchName}" para placa ${fqbn}... (esto puede tardar unos segundos)`, 'INFO');

  try {
    const res = await compilarSketch(sketchName, fqbn, code);
    if (res.success) {
      ultimoSketchPath = res.sketchPath;
      agregarLog(res.stdout || 'Compilación terminada.', 'SUCCESS');
      agregarLog(`Binario generado en: ${res.binaryPath}`, 'SUCCESS');
    } else {
      agregarLog(res.stderr || res.message || 'Error al compilar.', 'ERROR');
    }
  } catch (err: any) {
    agregarLog(`Error de red al compilar: ${err.message}`, 'ERROR');
  } finally {
    btnVerify.disabled = false;
    btnUpload.disabled = false;
  }
});

// 3. Botón Cargar a Placa (Compila primero si es necesario y luego Flashea por WebSocket)
btnUpload.addEventListener('click', async () => {
  const port = portSelect.value;
  if (!port) {
    agregarLog('Selecciona un puerto USB válido antes de cargar a la placa.', 'WARNING');
    return;
  }

  const code = editor.getValue();
  const sketchName = sketchNameInput.value.trim() || 'TempSketch';
  const fqbn = boardSelect.value;

  btnVerify.disabled = true;
  btnUpload.disabled = true;
  agregarLog(`Paso 1/2: Compilando "${sketchName}" antes de subir...`, 'INFO');

  try {
    const comp = await compilarSketch(sketchName, fqbn, code);
    if (!comp.success) {
      agregarLog(comp.stderr || 'Fallo en la compilación previa al flasheo.', 'ERROR');
      btnVerify.disabled = false;
      btnUpload.disabled = false;
      return;
    }

    ultimoSketchPath = comp.sketchPath;
    agregarLog('Compilación exitosa. Paso 2/2: Iniciando flasheo por WebSocket...', 'SUCCESS');

    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    flashearPlacaWS(port, ultimoSketchPath, fqbn, (evento) => {
      if (evento.progress !== null && evento.progress !== undefined) {
        progressFill.style.width = `${evento.progress}%`;
        progressText.textContent = `${evento.progress}%`;
      }
      agregarLog(`(${evento.stage || 'FLASH'}) ${evento.message}`, evento.type || 'INFO');

      if (evento.stage === 'DONE' || evento.stage === 'FAILED') {
        btnVerify.disabled = false;
        btnUpload.disabled = false;
      }
    });
  } catch (err: any) {
    agregarLog(`Error durante el proceso de carga: ${err.message}`, 'ERROR');
    btnVerify.disabled = false;
    btnUpload.disabled = false;
  }
});

btnRefreshPorts.addEventListener('click', cargarPuertos);
btnClearConsole.addEventListener('click', () => { consoleOutput.innerHTML = ''; });

// Inicializar al abrir la página
cargarPuertos();