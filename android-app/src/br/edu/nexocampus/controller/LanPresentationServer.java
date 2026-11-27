package br.edu.nexocampus.controller;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Embedded Multi-Threaded HTTP + Server-Sent Events (SSE) + REST Server running on the Android device.
 * Serves the Classroom Projector view (projetor.html) to any PC on the same Wi-Fi network or Mobile Hotspot,
 * and broadcasts every slide, modal, chart, and timer update in real time.
 */
public class LanPresentationServer {
    private final AssetManager assetManager;
    private ServerSocket serverSocket;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private volatile boolean running = false;
    private int boundPort = 8080;

    // Latest JSON presentation state
    private volatile String currentStateJson = "{\"slideIndex\":0,\"linearNodeIndex\":0,\"speakerPhase\":\"yago\",\"generalElapsedSec\":0,\"speakerRemainingSec\":240,\"generalColor\":\"green\",\"speakerColor\":\"green\",\"theme\":\"dark\",\"fontScale\":1.0}";

    // Connected SSE streams (PC browsers viewing projetor.html)
    private final CopyOnWriteArrayList<OutputStream> sseClients = new CopyOnWriteArrayList<>();
    private final AtomicInteger recentPollClients = new AtomicInteger(0);
    private volatile long lastPollTimeMs = 0;

    public LanPresentationServer(Context context) {
        this.assetManager = context.getAssets();
    }

    public synchronized void start() {
        if (running) return;
        running = true;

        executor.submit(() -> {
            // Try binding port 8080..8090
            for (int p = 8080; p <= 8090; p++) {
                try {
                    serverSocket = new ServerSocket();
                    serverSocket.setReuseAddress(true);
                    serverSocket.bind(new InetSocketAddress("0.0.0.0", p));
                    boundPort = p;
                    break;
                } catch (IOException e) {
                    serverSocket = null;
                }
            }

            if (serverSocket == null) {
                running = false;
                return;
            }

            while (running && !serverSocket.isClosed()) {
                try {
                    final Socket client = serverSocket.accept();
                    client.setTcpNoDelay(true);
                    executor.submit(() -> handleClient(client));
                } catch (IOException e) {
                    if (!running) break;
                }
            }
        });
    }

    public synchronized void stop() {
        running = false;
        for (OutputStream out : sseClients) {
            try { out.close(); } catch (Exception ignored) {}
        }
        sseClients.clear();
        if (serverSocket != null) {
            try { serverSocket.close(); } catch (IOException ignored) {}
        }
    }

    public void updateAndBroadcastState(String newStateJson) {
        if (newStateJson == null || newStateJson.isEmpty()) return;
        this.currentStateJson = newStateJson;

        byte[] sseFrame = ("data: " + newStateJson + "\n\n").getBytes(StandardCharsets.UTF_8);
        for (OutputStream out : sseClients) {
            executor.submit(() -> {
                try {
                    synchronized (out) {
                        out.write(sseFrame);
                        out.flush();
                    }
                } catch (IOException e) {
                    sseClients.remove(out);
                    try { out.close(); } catch (Exception ignored) {}
                }
            });
        }
    }

    public int getConnectedClientsCount() {
        int sseCount = sseClients.size();
        if (sseCount > 0) return sseCount;
        // Fallback count if a browser only uses HTTP polling
        if (System.currentTimeMillis() - lastPollTimeMs < 3500) {
            return Math.max(1, recentPollClients.get());
        }
        return 0;
    }

    public int getBoundPort() {
        return boundPort;
    }

    public List<String> getDetectedLanUrls() {
        List<String> urls = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces != null) {
                for (NetworkInterface nif : Collections.list(interfaces)) {
                    if (!nif.isUp() || nif.isLoopback()) continue;
                    String name = nif.getName().toLowerCase();
                    // Prioritize Wi-Fi (wlan), Hotspot/AP (ap, swlan), and USB Tethering (rndis)
                    Enumeration<InetAddress> addrs = nif.getInetAddresses();
                    for (InetAddress addr : Collections.list(addrs)) {
                        if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                            String ip = addr.getHostAddress();
                            String url = "http://" + ip + ":" + boundPort;
                            if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("rndis")) {
                                urls.add(0, url);
                            } else {
                                urls.add(url);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        if (urls.isEmpty()) {
            urls.add("http://192.168.43.1:" + boundPort);
        }
        return urls;
    }

    public String getServerInfoJson() {
        List<String> urls = getDetectedLanUrls();
        String primary = urls.get(0);
        StringBuilder sb = new StringBuilder();
        sb.append("{\"primaryUrl\":\"").append(primary).append("\",");
        sb.append("\"port\":").append(boundPort).append(",");
        sb.append("\"connectedClients\":").append(getConnectedClientsCount()).append(",");
        sb.append("\"urls\":[");
        for (int i = 0; i < urls.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(urls.get(i)).append("\"");
        }
        sb.append("]}");
        return sb.toString();
    }

    private void handleClient(Socket socket) {
        try {
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));

            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) {
                socket.close();
                return;
            }

            String[] parts = requestLine.split(" ");
            String method = parts[0];
            String rawPath = parts.length > 1 ? parts[1] : "/";
            int qIdx = rawPath.indexOf('?');
            String path = qIdx >= 0 ? rawPath.substring(0, qIdx) : rawPath;

            int contentLength = 0;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("content-length:")) {
                    try {
                        contentLength = Integer.parseInt(line.substring(15).trim());
                    } catch (NumberFormatException ignored) {}
                }
            }

            // CORS Preflight
            if ("OPTIONS".equalsIgnoreCase(method)) {
                sendResponse(out, "204 No Content", "text/plain", new byte[0]);
                socket.close();
                return;
            }

            // 1. Server-Sent Events Stream (/api/events)
            if ("/api/events".equals(path)) {
                String headers = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: text/event-stream; charset=utf-8\r\n" +
                        "Cache-Control: no-cache\r\n" +
                        "Connection: keep-alive\r\n" +
                        "Access-Control-Allow-Origin: *\r\n\r\n";
                synchronized (out) {
                    out.write(headers.getBytes(StandardCharsets.UTF_8));
                    out.write(("data: " + currentStateJson + "\n\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                }
                sseClients.add(out);
                // Keep socket open until client disconnects
                try {
                    while (running && !socket.isClosed()) {
                        Thread.sleep(15000);
                        synchronized (out) {
                            out.write(": keepalive\n\n".getBytes(StandardCharsets.UTF_8));
                            out.flush();
                        }
                    }
                } catch (Exception e) {
                    sseClients.remove(out);
                    try { socket.close(); } catch (Exception ignored) {}
                }
                return;
            }

            // 2. GET / POST Presentation State (/api/state)
            if ("/api/state".equals(path)) {
                if ("POST".equalsIgnoreCase(method) && contentLength > 0) {
                    char[] buf = new char[contentLength];
                    int readTotal = 0;
                    while (readTotal < contentLength) {
                        int r = reader.read(buf, readTotal, contentLength - readTotal);
                        if (r == -1) break;
                        readTotal += r;
                    }
                    String body = new String(buf, 0, readTotal);
                    updateAndBroadcastState(body);
                    sendResponse(out, "200 OK", "application/json; charset=utf-8",
                            "{\"ok\":true}".getBytes(StandardCharsets.UTF_8));
                } else {
                    lastPollTimeMs = System.currentTimeMillis();
                    recentPollClients.set(1);
                    sendResponse(out, "200 OK", "application/json; charset=utf-8",
                            currentStateJson.getBytes(StandardCharsets.UTF_8));
                }
                socket.close();
                return;
            }

            // 3. GET Server Network Info (/api/info)
            if ("/api/info".equals(path)) {
                sendResponse(out, "200 OK", "application/json; charset=utf-8",
                        getServerInfoJson().getBytes(StandardCharsets.UTF_8));
                socket.close();
                return;
            }

            // 4. Static Asset Routing:
            // Root "/" opens the Classroom Projector View (projetor.html) for the PC!
            String assetPath;
            if ("/".equals(path) || "/projetor".equals(path) || "/projetor.html".equals(path)) {
                assetPath = "www/projetor.html";
            } else if ("/control".equals(path) || "/index.html".equals(path)) {
                assetPath = "www/index.html";
            } else {
                String clean = path.startsWith("/") ? path.substring(1) : path;
                assetPath = "www/" + clean;
            }

            byte[] data = readAssetBytes(assetPath);
            if (data != null) {
                sendResponse(out, "200 OK", guessMimeType(assetPath), data);
            } else {
                sendResponse(out, "404 Not Found", "text/plain; charset=utf-8",
                        ("404 Not Found: " + path).getBytes(StandardCharsets.UTF_8));
            }
            socket.close();
        } catch (Exception e) {
            try { socket.close(); } catch (Exception ignored) {}
        }
    }

    private byte[] readAssetBytes(String assetPath) {
        try (InputStream is = assetManager.open(assetPath);
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int n;
            while ((n = is.read(chunk)) != -1) {
                buffer.write(chunk, 0, n);
            }
            return buffer.toByteArray();
        } catch (IOException e) {
            return null;
        }
    }

    private String guessMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        return "application/octet-stream";
    }

    private void sendResponse(OutputStream out, String status, String contentType, byte[] body) throws IOException {
        String headers = "HTTP/1.1 " + status + "\r\n" +
                "Content-Type: " + contentType + "\r\n" +
                "Content-Length: " + body.length + "\r\n" +
                "Cache-Control: no-store, no-cache, must-revalidate\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type\r\n" +
                "Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }
}
