const API_BASE = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/ws/flash';

export async function obtenerPuertosUSB() {
  const res = await fetch(`${API_BASE}/ports`);
  return await res.json();
}

export async function compilarSketch(sketchName: string, fqbn: string, code: string) {
  const res = await fetch(`${API_BASE}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sketchName, fqbn, code })
  });
  return await res.json();
}

export function flashearPlacaWS(
  port: string,
  sketchPath: string,
  fqbn: string,
  onMensaje: (data: any) => void
) {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      action: 'START_FLASH',
      payload: { port, sketchPath, fqbn }
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMensaje(data);
    if (data.stage === 'DONE' || data.stage === 'FAILED') {
      ws.close();
    }
  };

  ws.onerror = () => {
    onMensaje({
      type: 'ERROR',
      stage: 'WS_ERROR',
      message: 'Error al conectar con el WebSocket ws://localhost:3000/ws/flash'
    });
  };

  return ws;
}