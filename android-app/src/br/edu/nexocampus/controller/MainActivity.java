package br.edu.nexocampus.controller;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.KeyEvent;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Native Android Activity that runs the Master Presentation Controller UI
 * and hosts the embedded LanPresentationServer so any PC on the same Wi-Fi/Hotspot
 * can open the generated link and display projetor.html in real time.
 */
public class MainActivity extends Activity {
    private WebView webView;
    private LanPresentationServer lanServer;
    private WifiManager.WifiLock wifiLock;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#07090e"));
            getWindow().setNavigationBarColor(Color.parseColor("#0b0f19"));
        }

        // Acquire Wi-Fi High Performance Lock so local server has low latency
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "NexoCampus:LanServerLock");
                wifiLock.acquire();
            }
        } catch (Exception ignored) {}

        // Start Embedded LAN HTTP/SSE Server
        lanServer = new LanPresentationServer(this);
        lanServer.start();

        // Setup Full-Screen Hardware-Accelerated WebView for Master Controller
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#090b10"));
        webView.setVerticalScrollBarEnabled(true);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setScrollbarFadingEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidHost");

        setContentView(webView);

        // Load Master Controller UI from APK assets
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    /**
     * Allow the presenter to use the phone's physical Volume Up / Volume Down buttons
     * to advance or go back in the Doubly Linked List without looking at the screen!
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        int action = event.getAction();

        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            if (action == KeyEvent.ACTION_DOWN && webView != null) {
                webView.evaluateJavascript("if(window.nexoStepNext) window.nexoStepNext();", null);
            }
            return true;
        } else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (action == KeyEvent.ACTION_DOWN && webView != null) {
                webView.evaluateJavascript("if(window.nexoStepPrev) window.nexoStepPrev();", null);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onDestroy() {
        if (lanServer != null) {
            lanServer.stop();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try { wifiLock.release(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void pushState(String stateJson) {
            if (lanServer != null) {
                lanServer.updateAndBroadcastState(stateJson);
            }
        }

        @JavascriptInterface
        public String getServerInfo() {
            if (lanServer != null) {
                return lanServer.getServerInfoJson();
            }
            return "{\"primaryUrl\":\"http://127.0.0.1:8080\",\"port\":8080,\"connectedClients\":0,\"urls\":[]}";
        }

        @JavascriptInterface
        public void vibrate(int durationMs) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(Math.max(10, durationMs), VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(Math.max(10, durationMs));
                    }
                }
            } catch (Exception ignored) {}
        }
    }
}
