package app.kumo;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;

/**
 * Videos played by Android's own player (Media3's ExoPlayer), on a surface
 * behind the page: the page stays see-through over it, with the player's
 * controls, menus and subtitles. The Fire TV's WebView plays a video's sound
 * under a grey picture (other apps' developers report grey, black or white
 * ones from about 2026-10-11, in any app, while Silk shows the same page's
 * video), and Android's player is a TV's own, made for its decoders.
 *
 * The page drives it as it would its video element (web/src/lib/nativeVideo.ts):
 * commands come in by KumoAndroid.video(json); what the player does goes back
 * to window.__anikoVideo(json), with the page's id for that video, so a video
 * the page already closed can't be taken for the next one.
 */
@OptIn(markerClass = UnstableApi.class)
final class NativeVideo implements Player.Listener {
    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private SurfaceView surface;
    // The page's id for the video playing (its commands and events carry it).
    private String id = "";
    private int videoWidth;
    private int videoHeight;
    private float pixelRatio = 1f;
    // What's playing: tried again as HLS when it turns out to be a playlist.
    private String url = "";
    private boolean hls;
    // Gone to another place, not there yet (the page's "seeked" waits for it).
    private boolean seeking;
    private final Runnable tick = this::tick;
    private final View.OnLayoutChangeListener refit = (v, l, t, r, b, ol, ot, or, ob) -> fit();

    NativeVideo(MainActivity activity) {
        this.activity = activity;
    }

    /** What the page asks (on the WebView's own thread): done on the main one. */
    void command(final String json) {
        main.post(() -> run(json));
    }

    private void run(String json) {
        JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (JSONException e) {
            return;
        }
        String op = o.optString("op");
        if ("open".equals(op)) {
            open(o);
            return;
        }
        // Only for the video playing: not one the page has moved on from.
        if (player == null || !id.equals(o.optString("id"))) return;
        switch (op) {
            case "play":
                if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0);
                player.play();
                break;
            case "pause":
                player.pause();
                break;
            case "seek":
                seeking = true;
                player.seekTo(Math.max(0, Math.round(o.optDouble("t", 0) * 1000)));
                break;
            case "rate":
                player.setPlaybackSpeed((float) Math.max(0.25, Math.min(4, o.optDouble("rate", 1))));
                break;
            case "volume":
                player.setVolume((float) Math.max(0, Math.min(1, o.optDouble("volume", 1))));
                break;
            case "close":
                close();
                break;
            default:
                break;
        }
    }

    private void open(JSONObject o) {
        String url = o.optString("url");
        // Only videos from Aniko's own server (which has the token).
        if (!url.startsWith(AnikoServer.URL)) return;
        close();
        id = o.optString("id");
        this.url = url;
        hls = o.optBoolean("hls");
        seeking = false;
        videoWidth = 0;
        videoHeight = 0;
        pixelRatio = 1f;
        // Aniko's server answers its own app only (AnikoServer.token): the
        // WebView proves it with a cookie, this player with the header.
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("Aniko/" + activity.versionName() + " (Android player)")
                .setConnectTimeoutMs(15_000)
                // A converted video's first bytes can take a while (the
                // computer's or the hub's disk waking up, the converter starting).
                .setReadTimeoutMs(90_000)
                .setDefaultRequestProperties(Collections.singletonMap("X-Kumo-Shell", AnikoServer.get(activity).token()));
        player = new ExoPlayer.Builder(activity)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
                .setHandleAudioBecomingNoisy(true)
                .build();
        player.addListener(this);
        // The page draws the subtitles: none decoded here.
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
        player.setMediaItem(item(), Math.max(0, Math.round(o.optDouble("start", 0) * 1000)));
        player.setVolume((float) Math.max(0, Math.min(1, o.optDouble("volume", 1))));
        player.setPlaybackSpeed((float) Math.max(0.25, Math.min(4, o.optDouble("rate", 1))));
        player.setPlayWhenReady(!o.optBoolean("paused"));
        showSurface();
        player.setVideoSurfaceView(surface);
        player.prepare();
        main.post(tick);
    }

    private MediaItem item() {
        MediaItem.Builder item = new MediaItem.Builder()
                .setUri(url)
                // A playlist that grows while the video is converted plays on
                // at its own speed, not sped up to its end like live TV.
                .setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().setMinPlaybackSpeed(1f).setMaxPlaybackSpeed(1f).build());
        // Aniko's addresses don't end in .m3u8: the page says what it is.
        if (hls) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        return item.build();
    }

    /** The video closed (the page's player closed, or plays another): the page shows as before. */
    void close() {
        main.removeCallbacks(tick);
        if (player != null) {
            player.removeListener(this);
            player.release();
            player = null;
        }
        id = "";
        url = "";
        FrameLayout root = activity.rootView();
        root.removeOnLayoutChangeListener(refit);
        if (surface != null && surface.getParent() != null) root.removeView(surface);
        WebView web = activity.webView();
        if (web != null) web.setBackgroundColor(MainActivity.FRAME);
    }

    /** Home pressed, or another app on top: the video pauses. */
    void pause() {
        if (player != null) player.pause();
    }

    /**
     * The surface goes under the page, which is see-through while the video
     * plays (the page's own background too, web/src/index.css): Android draws
     * a surface below the window, the window's views over it.
     */
    private void showSurface() {
        FrameLayout root = activity.rootView();
        if (surface == null) {
            surface = new SurfaceView(activity);
            // The remote's keys stay with the page.
            surface.setFocusable(false);
            surface.setFocusableInTouchMode(false);
        }
        if (surface.getParent() == null) {
            root.addView(surface, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        }
        root.addOnLayoutChangeListener(refit);
        WebView web = activity.webView();
        if (web != null) web.setBackgroundColor(Color.TRANSPARENT);
    }

    /** The picture at its own shape, as big as the screen lets it (black bars around it). */
    private void fit() {
        if (surface == null || surface.getParent() == null) return;
        FrameLayout root = activity.rootView();
        int rw = root.getWidth();
        int rh = root.getHeight();
        int w = ViewGroup.LayoutParams.MATCH_PARENT;
        int h = ViewGroup.LayoutParams.MATCH_PARENT;
        if (rw > 0 && rh > 0 && videoWidth > 0 && videoHeight > 0) {
            double aspect = videoWidth * (double) pixelRatio / videoHeight;
            w = rw;
            h = (int) Math.round(rw / aspect);
            if (h > rh) {
                h = rh;
                w = (int) Math.round(rh * aspect);
            }
        }
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) surface.getLayoutParams();
        if (lp != null && lp.width == w && lp.height == h) return;
        surface.setLayoutParams(new FrameLayout.LayoutParams(w, h, Gravity.CENTER));
    }

    private void tick() {
        main.removeCallbacks(tick);
        if (player == null) return;
        // A seek is done once the player has the picture there.
        if (seeking && player.getPlaybackState() == Player.STATE_READY) {
            seeking = false;
            send("seeked", null);
        }
        send("time", null);
        main.postDelayed(tick, 250);
    }

    /** Where the player is, to the page. */
    private void send(String type, JSONObject extra) {
        if (player == null) return;
        JSONObject o = extra != null ? extra : new JSONObject();
        try {
            o.put("id", id);
            o.put("type", type);
            o.put("t", player.getCurrentPosition() / 1000.0);
            long d = player.getDuration();
            o.put("d", d == C.TIME_UNSET ? -1 : d / 1000.0);
            o.put("b", player.getBufferedPosition() / 1000.0);
            o.put("playing", player.isPlaying());
            o.put("paused", !player.getPlayWhenReady());
            o.put("state", player.getPlaybackState());
            o.put("seeking", seeking);
            o.put("seekable", player.isCurrentMediaItemSeekable());
            o.put("w", videoWidth);
            o.put("h", videoHeight);
        } catch (JSONException ignored) {
            return;
        }
        activity.js("window.__anikoVideo&&window.__anikoVideo(" + o + ")");
    }

    @Override
    public void onPlaybackStateChanged(int state) {
        if (state == Player.STATE_READY && seeking) {
            seeking = false;
            send("seeked", null);
        }
        send("state", null);
    }

    @Override
    public void onIsPlayingChanged(boolean playing) {
        send("state", null);
    }

    @Override
    public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
        send("state", null);
    }

    @Override
    public void onVideoSizeChanged(VideoSize size) {
        if (size.width <= 0 || size.height <= 0) return;
        videoWidth = size.width;
        videoHeight = size.height;
        pixelRatio = size.pixelWidthHeightRatio > 0 ? size.pixelWidthHeightRatio : 1f;
        fit();
        send("state", null);
    }

    @Override
    public void onRenderedFirstFrame() {
        send("frame", null);
    }

    /**
     * As a video element's errors: 2 the connection broke, 3 it can't decode
     * the video, 4 anything else (a format it doesn't play, an address that
     * answers with an error: the page then checks the address itself).
     */
    @Override
    public void onPlayerError(PlaybackException e) {
        int code = e.errorCode;
        Log.e("aniko", "Android's player: " + e.getErrorCodeName(), e);
        // An online stream that's a playlist without saying so (the web
        // view's player found that out by itself): once more, as one.
        if (code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED && !hls && player != null) {
            hls = true;
            long at = player.getCurrentPosition();
            player.setMediaItem(item(), at);
            player.prepare();
            return;
        }
        int media = code == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED || code == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ? 2
                : code >= 4000 && code < 5000 && code != PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
                        && code != PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ? 3 : 4;
        JSONObject o = new JSONObject();
        try {
            o.put("code", media);
            String why = e.getMessage();
            o.put("message", e.getErrorCodeName() + (why != null && !why.isEmpty() ? ": " + why : ""));
        } catch (JSONException ignored) {
            // without the details
        }
        send("error", o);
    }
}
