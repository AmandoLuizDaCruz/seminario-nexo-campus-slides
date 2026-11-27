#!/usr/bin/env python3
"""
Servidor Local LAN Alternativo (Caso Nexo Campus - Grupo 3)
Implementa os mesmos endpoints (/api/state, /api/events, /api/info) do App Android
para testes em rede local a partir do PC ou notebook.
"""
import http.server
import json
import os
import socket
import socketserver
import threading
import time

PORT = 8080
CURRENT_STATE = {
    "slideIndex": 0,
    "linearNodeIndex": 0,
    "speakerPhase": "yago",
    "generalElapsedSec": 0,
    "speakerRemainingSec": 240,
    "generalColor": "green",
    "speakerColor": "green",
    "theme": "dark",
    "fontScale": 1.0,
    "timestamp": int(time.time() * 1000)
}
SSE_CLIENTS = []
SSE_LOCK = threading.Lock()


def get_lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    if not ips:
        ips.append("127.0.0.1")
    return [f"http://{ip}:{PORT}" for ip in ips]


class LanHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state":
            data = json.dumps(CURRENT_STATE).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/info":
            urls = get_lan_ips()
            with SSE_LOCK:
                clients_count = len(SSE_CLIENTS)
            info = {
                "primaryUrl": urls[0],
                "urls": urls,
                "port": PORT,
                "connectedClients": clients_count
            }
            data = json.dumps(info).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                self.wfile.write(f"data: {json.dumps(CURRENT_STATE)}\n\n".encode("utf-8"))
                self.wfile.flush()
                with SSE_LOCK:
                    SSE_CLIENTS.append(self.wfile)
                while True:
                    time.sleep(15)
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
            except Exception:
                with SSE_LOCK:
                    if self.wfile in SSE_CLIENTS:
                        SSE_CLIENTS.remove(self.wfile)
            return

        if path in ("/", "/projetor"):
            self.path = "/projetor.html"
        elif path == "/control":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        global CURRENT_STATE
        if self.path.split("?")[0] == "/api/state":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                CURRENT_STATE = json.loads(body)
            except Exception:
                pass
            frame = f"data: {json.dumps(CURRENT_STATE)}\n\n".encode("utf-8")
            with SSE_LOCK:
                dead = []
                for client in SSE_CLIENTS:
                    try:
                        client.write(frame)
                        client.flush()
                    except Exception:
                        dead.append(client)
                for d in dead:
                    SSE_CLIENTS.remove(d)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    urls = get_lan_ips()
    print("============================================================")
    print("  NEXO CAMPUS - SERVIDOR LOCAL LAN INICIADO")
    print(f"  -> Painel Mestre (Controle): {urls[0]}/control")
    print(f"  -> Tela da Sala (Projetor):  {urls[0]}/")
    print("============================================================")
    server = ThreadedHTTPServer(("0.0.0.0", PORT), LanHandler)
    server.serve_forever()
