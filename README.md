ESP32 Editor & Compilador (Módulo IDE)

Repositorio del módulo de edición, compilación y flasheo para placas ESP32. El proyecto está dividido en un frontend ligero con Monaco Editor (Vite + TypeScript) y un backend en Node.js + Express que se comunica localmente con arduino-cli y esptool para compilar código y cargarlo a la placa física por USB.

Requisitos previos

Antes de correr el proyecto en otra máquina, es necesario tener instalado:

Node.js (v18 o superior).

Arduino CLI instalado y agregado al PATH del sistema.

Configuración rápida de arduino-cli (en Windows)

Si no tienes configurado el core de ESP32 en tu compu, corre estos comandos en PowerShell:

# Instalar arduino-cli con winget
winget install ArduinoSA.CLI

# Inicializar configuración y agregar el índice de Espressif
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index

# Instalar el soporte para placas ESP32 (descarga compilador y esptool)
arduino-cli core install esp32:esp32


Instalación y ejecución

Clona el repositorio e instala las dependencias tanto de la raíz (frontend) como de la carpeta backend:

git clone https://github.com/iverskn/Esp32-EditorCompilador.git
cd Esp32-EditorCompilador

# 1. Instalar paquetes del Frontend
npm install

# 2. Instalar paquetes del Backend
cd backend
npm install


Para trabajar localmente necesitas tener dos terminales abiertas:

Terminal 1 — Levantar el Backend (Puerto 3000):

cd backend
node server.js


Terminal 2 — Levantar el Frontend (Puerto 5173):

# Desde la raíz del proyecto
npm run dev


Abre http://localhost:5173 en el navegador para usar el editor.

Estructura del proyecto

Esp32-EditorCompilador/
├── backend/
│   ├── controllers/
│   │   ├── compileController.js   # Compilación con arduino-cli y manejo de sketches
│   │   └── flashController.js     # Detección de puertos USB y flasheo por WebSocket
│   ├── utils/
│   │   └── errorParser.js         # Parseo de errores de salida del compilador
│   ├── workspace/                 # Carpeta temporal donde se generan los .ino y .bin (ignorada en git)
│   ├── package.json
│   └── server.js                  # Servidor HTTP Express + WebSocketServer
├── docs/
│   └── contracts/                 # Esquemas JSON de peticiones/respuestas
├── src/
│   ├── api/
│   │   └── compilerClient.ts      # Cliente HTTP y WebSocket hacia localhost:3000
│   ├── editor/                    # Configuración de Monaco y pestañas
│   ├── main.ts                    # Lógica principal de la interfaz
│   └── style.css
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts


Endpoints del Backend

El servidor corre en http://localhost:3000.

API REST

GET /api/health — Verifica que el servidor esté encendido.

GET /api/ports — Devuelve la lista de puertos seriales (COM) detectados por USB usando serialport.

POST /api/compile — Recibe el código desde el editor, crea la estructura del sketch en backend/workspace/ y ejecuta arduino-cli compile.

Body (JSON):

{
  "sketchName": "PruebaBlink",
  "fqbn": "esp32:esp32:esp32",
  "code": "void setup() {} void loop() {}"
}


GET /api/sketches — Lista los sketches guardados en el directorio de trabajo local.

GET /api/boards — Lista las placas de la familia ESP32 disponibles en arduino-cli.

GET /api/libraries/search?q=nombre — Busca librerías en el índice de Arduino.

POST /api/libraries/install — Instala una librería pasándole {"libraryName": "Nombre"}.

WebSocket (Flasheo en tiempo real)

URL: ws://localhost:3000/ws/flash

Flujo: Al enviar el mensaje con la acción START_FLASH, el backend ejecuta arduino-cli upload con child_process.spawn, captura la salida de esptool línea por línea, calcula el porcentaje de escritura y lo transmite en vivo a la consola inferior de la interfaz.

Payload de inicio:

{
  "action": "START_FLASH",
  "payload": {
    "port": "COM4",
    "fqbn": "esp32:esp32:esp32",
    "sketchPath": "C:\\ruta\\al\\workspace\\PruebaBlink"
  }
}


Notas de solución de problemas comunes

No aparece ningún puerto COM: Verifica que tu cable USB sea de datos (no solo de carga) y que tengas instalado el driver CP210x o CH340 según el chip de tu ESP32.

Error al subir el código (Timed out waiting for packet header): Algunas placas ESP32 requieren que mantengas presionado el botón físico BOOT cuando en la consola aparezca el estado CONNECTING hasta que empiece a subir el porcentaje.

El puerto COM dice acceso denegado: Asegúrate de no tener abierto el Monitor Serial de Arduino IDE u otro programa ocupando el mismo puerto COM al momento de flashear.