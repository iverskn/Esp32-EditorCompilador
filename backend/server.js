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

const express = require("express");
const cors = require("cors");
const { compile } = require("./controllers/compileController");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// POST /api/compile
// body: { fqbn: string, files: [{ name, content }] }  (compile-request.schema.json)
// resp: { success, message, hexBinary, errors }        (compile-response.schema.json)
app.post("/api/compile", compile);

app.listen(PORT, () => {
  console.log(`[backend] Editor/Compilador IDE ESP32 escuchando en puerto ${PORT}`);
});

module.exports = app;
