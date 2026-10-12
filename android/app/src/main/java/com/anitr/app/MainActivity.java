package com.anitr.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private WebView webView;
    private FrameLayout rootLayout;
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View customView;
    private Process serverProcess;
    private ProgressBar progressBar;
    private TextView statusText;
    private LinearLayout splashLayout;
    private static final String SERVER_URL = "http://127.0.0.1:3000";
    private boolean isServerReady = false;
    private long lastBackPressTime = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Crash Guard: Catches any uncaught crash and shows it on screen
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            new Handler(Looper.getMainLooper()).post(() -> {
                showFatalError("Kritik Hata: " + throwable.getMessage() + "\n" + android.util.Log.getStackTraceString(throwable));
            });
        });

        super.onCreate(savedInstanceState);

        try {
            // Setup Window safely
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(Color.parseColor("#0b0c10"));
                window.setNavigationBarColor(Color.parseColor("#0b0c10"));
            }

            // Build UI Programmatically to avoid any XML Inflation crashes
            createProgrammaticUI();

            // Start embedded Go server and load UI
            startLocalServerAndLoad();

        } catch (Throwable t) {
            showFatalError("Başlatma Hatası: " + t.getMessage() + "\n" + android.util.Log.getStackTraceString(t));
        }
    }

    private void createProgrammaticUI() {
        rootLayout = new FrameLayout(this);
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        rootLayout.setBackgroundColor(Color.parseColor("#0b0c10"));

        // 1. WebView
        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setVisibility(View.GONE);
        webView.setBackgroundColor(Color.parseColor("#0b0c10"));
        setupWebView();
        rootLayout.addView(webView);

        // 2. Fullscreen Video Container
        customViewContainer = new FrameLayout(this);
        customViewContainer.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        customViewContainer.setBackgroundColor(Color.BLACK);
        customViewContainer.setVisibility(View.GONE);
        rootLayout.addView(customViewContainer);

        // 3. Splash / Loading Screen
        splashLayout = new LinearLayout(this);
        splashLayout.setOrientation(LinearLayout.VERTICAL);
        splashLayout.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams splashParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        splashLayout.setLayoutParams(splashParams);

        progressBar = new ProgressBar(this);
        progressBar.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        progressBar.setIndeterminate(true);
        splashLayout.addView(progressBar);

        statusText = new TextView(this);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        textParams.topMargin = 40;
        statusText.setLayoutParams(textParams);
        statusText.setText("Anitr Web Başlatılıyor...");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(15);
        statusText.setGravity(Gravity.CENTER);
        splashLayout.addView(statusText);

        rootLayout.addView(splashLayout);
        setContentView(rootLayout);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " AnitrAndroid/1.0");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (splashLayout != null) splashLayout.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                customViewContainer.setVisibility(View.VISIBLE);
                customViewContainer.addView(view);

                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                hideSystemUI();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                customViewContainer.removeView(customView);
                customViewContainer.setVisibility(View.GONE);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                showSystemUI();
            }
        });
    }

    private void startLocalServerAndLoad() {
        new Thread(() -> {
            try {
                // 1. Check if server already responding
                if (checkServerRunning()) {
                    onServerReady();
                    return;
                }

                // 2. Find and execute libanitr.so
                File binFile = new File(getApplicationInfo().nativeLibraryDir, "libanitr.so");
                if (!binFile.exists()) {
                    updateStatus("HATA: Motor dosyası bulunamadı (" + binFile.getAbsolutePath() + ")");
                    return;
                }

                binFile.setExecutable(true, false);
                updateStatus("Sunucu başlatılıyor...");

                ProcessBuilder pb = new ProcessBuilder(binFile.getAbsolutePath());
                pb.environment().put("PORT", "3000");
                pb.redirectErrorStream(true);
                serverProcess = pb.start();

                // Read output in background
                new Thread(() -> {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(serverProcess.getInputStream()))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            android.util.Log.d("AnitrCore", line);
                        }
                    } catch (Exception ignored) {}
                }).start();

                // 3. Poll until ready (up to 15 seconds)
                int attempts = 0;
                while (attempts < 60 && !isServerReady) {
                    if (checkServerRunning()) {
                        onServerReady();
                        return;
                    }
                    Thread.sleep(250);
                    attempts++;
                }

                updateStatus("Sunucu yanıt vermedi. Lütfen uygulamayı yeniden başlatın.");

            } catch (Exception e) {
                updateStatus("Sunucu Hatası: " + e.getMessage() + "\n" + android.util.Log.getStackTraceString(e));
            }
        }).start();
    }

    private boolean checkServerRunning() {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(SERVER_URL).openConnection();
            conn.setConnectTimeout(400);
            conn.setReadTimeout(400);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            conn.disconnect();
            return (code >= 200 && code < 400);
        } catch (Exception e) {
            return false;
        }
    }

    private void onServerReady() {
        isServerReady = true;
        new Handler(Looper.getMainLooper()).post(() -> {
            if (webView != null) webView.loadUrl(SERVER_URL);
        });
    }

    private void updateStatus(String msg) {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (statusText != null) statusText.setText(msg);
        });
    }

    private void showFatalError(String msg) {
        if (statusText != null) {
            statusText.setText(msg);
            statusText.setTextColor(Color.parseColor("#ef4444"));
        } else {
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        }
    }

    private void hideSystemUI() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    private void showSystemUI() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            if (webView != null && webView.getWebChromeClient() != null) {
                ((WebChromeClient) webView.getWebChromeClient()).onHideCustomView();
            }
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        if (System.currentTimeMillis() - lastBackPressTime < 2000) {
            super.onBackPressed();
        } else {
            lastBackPressTime = System.currentTimeMillis();
            Toast.makeText(this, "Çıkmak için tekrar basın", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (serverProcess != null) {
            serverProcess.destroy();
        }
    }
}
