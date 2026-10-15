package app.kumo;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Kumo for Android, made for TVs (a Fire TV Stick) and the libraries the
 * computers at home share: it runs Kumo's server (KumoServer) and shows its
 * web UI, which on a TV is driven by the remote (TV mode, web/src/lib/tv.ts).
 */
public class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView web;
    private TextView message;
    private ScrollView messageScroll;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenDone;
    private WifiManager.MulticastLock multicast;
    private boolean loaded;
    private boolean starting;
    private boolean resumed;
    // Checks the server runs, while Kumo shows (see watch).
    private final Runnable watcher = this::watch;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 11, 15));
        web = newWebView();
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        message = new TextView(this);
        message.setTextColor(Color.rgb(230, 230, 235));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        message.setGravity(Gravity.CENTER);
        int pad = (int) (32 * getResources().getDisplayMetrics().density);
        message.setPadding(pad, pad, pad, pad);
        message.setText("Starting Kumo…");
        messageScroll = new ScrollView(this);
        messageScroll.setFillViewport(true);
        messageScroll.addView(message, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(messageScroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // The other Kumo apps announce themselves by multicast, which Wi-Fi
        // drops for apps without this.
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            multicast = wifi.createMulticastLock("kumo");
            multicast.setReferenceCounted(false);
            multicast.acquire();
        }
        startServer();
        onNewIntent(getIntent());
    }

    private WebView newWebView() {
        WebView w = new WebView(this);
        w.setBackgroundColor(Color.rgb(11, 11, 15));
        w.setVisibility(View.INVISIBLE);
        setUpWebView(w);
        return w;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setUpWebView(final WebView web) {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // The page's viewport decides the layout width (on a TV, wider than
        // the WebView's own: everything smaller, see web/src/lib/tv.ts),
        // scaled to fit the screen.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " KumoAndroid/" + versionName() + (isTV() ? " KumoTV" : ""));
        web.addJavascriptInterface(new Bridge(), "KumoAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return leave(req.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return leave(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!loaded && url.startsWith(KumoServer.URL)) {
                    loaded = true;
                    web.setVisibility(View.VISIBLE);
                    messageScroll.setVisibility(View.GONE);
                    web.requestFocus();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame() && !KumoServer.get(MainActivity.this).running()) {
                    restartServer("Starting Kumo…");
                }
            }

            // The page's process crashed (or Android ended it for memory):
            // a new WebView, the page opened again, rather than Kumo closing.
            @TargetApi(26)
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != MainActivity.this.web) return true;
                Log.e("kumo", "the page stopped" + (detail.didCrash() ? " (crashed)" : "") + ": opening it again");
                exitFullscreen();
                root.removeView(view);
                view.destroy();
                MainActivity.this.web = newWebView();
                root.addView(MainActivity.this.web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                loaded = false;
                messageScroll.setVisibility(View.VISIBLE);
                showMessage("Opening Kumo again…", false);
                if (KumoServer.get(MainActivity.this).running()) openPage(KumoServer.get(MainActivity.this));
                else startServer();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // Black until a video's first frame (Android draws a grey
            // picture with a play button otherwise).
            @Override
            public Bitmap getDefaultVideoPoster() {
                Bitmap b = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                b.eraseColor(Color.BLACK);
                return b;
            }

            // The player's fullscreen (on a phone; a TV is all screen).
            @Override
            public void onShowCustomView(View view, CustomViewCallback done) {
                exitFullscreen();
                fullscreen = view;
                fullscreenDone = done;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                web.setVisibility(View.INVISIBLE);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });
    }

    /** Only Kumo's pages show here: anything else (AniList, GitHub…) opens in a browser, if there's one, so the bridge stays Kumo's own. */
    private boolean leave(Uri u) {
        if ("127.0.0.1".equals(u.getHost()) && u.getPort() == KumoServer.PORT) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
            Toast.makeText(this, "No app here opens " + u.getHost(), Toast.LENGTH_LONG).show();
        }
        return true;
    }

    private void exitFullscreen() {
        if (fullscreen == null) return;
        root.removeView(fullscreen);
        fullscreen = null;
        if (fullscreenDone != null) fullscreenDone.onCustomViewHidden();
        fullscreenDone = null;
        web.setVisibility(View.VISIBLE);
    }

    /** Starts the server if needed, and shows Kumo once it answers. */
    private void startServer() {
        if (starting) return;
        starting = true;
        final KumoServer server = KumoServer.get(this);
        new Thread(() -> {
            String failure = null;
            try {
                server.start();
                long until = System.currentTimeMillis() + 40_000;
                while (!server.ready()) {
                    if (!server.running()) {
                        failure = "Kumo's server stopped.\n\n" + server.whyStopped();
                        break;
                    }
                    if (System.currentTimeMillis() > until) {
                        String lines = server.lastLines();
                        failure = "Kumo's server doesn't answer." + (lines.isEmpty() ? "" : "\n\n" + lines);
                        break;
                    }
                    Thread.sleep(250);
                }
            } catch (Exception e) {
                failure = "Kumo's server couldn't start: " + e.getMessage();
            }
            final String error = failure;
            main.post(() -> {
                starting = false;
                if (error != null) {
                    Log.e("kumo", error);
                    showMessage(error + "\n\nPress OK to try again.", true);
                    return;
                }
                showMessage("Starting Kumo…", false);
                openPage(server);
            });
        }, "kumo-start").start();
    }

    /** Opens Kumo's page (the server answers). */
    private void openPage(KumoServer server) {
        // The cookie that proves the WebView is Kumo's (KumoServer.token).
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setCookie(KumoServer.URL, "kumo_shell=" + server.token() + "; Path=/; HttpOnly; SameSite=Strict");
        cookies.flush();
        web.loadUrl(KumoServer.URL);
    }

    /** The server stopped: the starting screen, and the server again. */
    private void restartServer(String why) {
        loaded = false;
        web.setVisibility(View.INVISIBLE);
        messageScroll.setVisibility(View.VISIBLE);
        showMessage(why, false);
        startServer();
    }

    /** While Kumo shows: the server stopped (crashed, or Android ended it), it's started again. */
    private void watch() {
        main.removeCallbacks(watcher);
        if (!resumed) return;
        if (loaded && !starting && !KumoServer.get(this).running()) {
            Log.e("kumo", "the server stopped: starting it again");
            restartServer("Kumo's server stopped: starting it again…");
        }
        main.postDelayed(watcher, 5000);
    }

    /** The screen before Kumo shows: starting, or why it didn't. */
    private void showMessage(String text, boolean error) {
        message.setText(text);
        // An error has the details (the server's last lines): smaller, from the top, scrolling.
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, error ? 14 : 20);
        message.setGravity(error ? Gravity.START | Gravity.TOP : Gravity.CENTER);
        messageScroll.scrollTo(0, 0);
        // The remote's Up and Down scroll it.
        if (error) messageScroll.requestFocus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        web.onResume();
        // Android may have stopped it while Kumo was in the background.
        if (!starting && !KumoServer.get(this).running()) restartServer("Starting Kumo…");
        main.postDelayed(watcher, 5000);
    }

    /** Home pressed, or another app on top: a video playing pauses (its position is saved). */
    @Override
    protected void onPause() {
        resumed = false;
        main.removeCallbacks(watcher);
        js("document.querySelectorAll('video').forEach(function(v){v.pause()})");
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacks(watcher);
        if (multicast != null && multicast.isHeld()) multicast.release();
        if (isFinishing()) KumoServer.get(this).stop();
        web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ keys

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        switch (code) {
            case KeyEvent.KEYCODE_BACK:
                // On release, once: a long press doesn't go back twice.
                if (!down && !e.isCanceled()) back();
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                if (down && e.getRepeatCount() == 0) js("window.kumoKey&&window.kumoKey('playpause')");
                return true;
            // Play and Pause, on remotes that have both: only that.
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (down && e.getRepeatCount() == 0) js("window.kumoKey&&window.kumoKey('play')");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (down && e.getRepeatCount() == 0) js("window.kumoKey&&window.kumoKey('pause')");
                return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                // The next episode.
                if (down && e.getRepeatCount() == 0) js("window.kumoKey&&window.kumoKey('next')");
                return true;
            case KeyEvent.KEYCODE_MENU:
                // ☰: what a right-click opens.
                if (down && e.getRepeatCount() == 0) js("window.kumoKey&&window.kumoKey('menu')");
                return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                if (down) js("window.kumoKey&&window.kumoKey('rewind')");
                return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                if (down) js("window.kumoKey&&window.kumoKey('forward')");
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                // Kumo didn't start: OK tries again.
                if (!loaded && !starting && down) {
                    showMessage("Starting Kumo…", false);
                    startServer();
                    return true;
                }
                break;
            default:
                break;
        }
        return super.dispatchKeyEvent(e);
    }

    /**
     * Back: the page closes what's open or goes back; at Home, Kumo goes to
     * the background (to the TV's home), its server still there: opened
     * again, it's as it was, and the other devices still reach it.
     */
    private void back() {
        if (fullscreen != null) {
            exitFullscreen();
            return;
        }
        if (!loaded) {
            finish();
            return;
        }
        web.evaluateJavascript("(window.kumoBack&&window.kumoBack())?1:0", v -> {
            if (!"1".equals(v)) moveTaskToBack(true);
        });
    }

    private void js(String code) {
        if (loaded) web.evaluateJavascript(code, null);
    }

    // ------------------------------------------------------------ the bridge

    /** What the page asks of the app (window.KumoAndroid). */
    private final class Bridge {
        /** Keeps the screen on while a video plays. */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            main.post(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** Installs an update the server downloaded (Android asks first). */
        @JavascriptInterface
        public void installApk(final String path) {
            main.post(() -> Installer.install(MainActivity.this, path));
        }
    }

    // Android answers an install here (Installer).
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null || !Installer.ACTION.equals(intent.getAction())) return;
        // Only the answer to an install Kumo asked for: any app may start
        // this activity, and have it start what it gives (EXTRA_INTENT).
        if (!Installer.isOurs(this, intent)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) startActivity(confirm);
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(this, "The update wasn't installed" + (msg == null ? "" : ": " + msg), Toast.LENGTH_LONG).show();
        }
    }

    private boolean isTV() {
        UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        PackageManager pm = getPackageManager();
        return (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                || pm.hasSystemFeature("amazon.hardware.fire_tv");
    }

    private String versionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "0";
        }
    }
}
