package com.marmol89.pulse;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente entre navigator.mediaSession (src/android/mediaSession.js) y PlaybackService: recibe la pista
 * y el estado, y devuelve a JS las acciones del sistema (notificación, pantalla de bloqueo, auriculares).
 */
@CapacitorPlugin(name = "PulsePlayback")
public class PlaybackPlugin extends Plugin {

    @Override
    public void load() {
        PlaybackService.setActionListener((action, seekTime) -> {
            JSObject data = new JSObject();
            data.put("action", action);
            if (seekTime >= 0) data.put("seekTime", seekTime);
            notifyListeners("action", data);
        });
    }

    @PluginMethod
    public void setMetadata(PluginCall call) {
        JSObject metadata = call.getObject("metadata");
        if (metadata == null) {
            PlaybackService.setTrack(getContext(), null);
        } else {
            PlaybackService.setTrack(
                getContext(),
                new PlaybackService.Track(
                    metadata.getString("title", ""),
                    metadata.getString("artist", ""),
                    metadata.getString("album", ""),
                    decode(metadata.getString("artwork"))
                )
            );
        }
        call.resolve();
    }

    @PluginMethod
    public void setState(PluginCall call) {
        String state = call.getString("state", "none");
        double position = call.getDouble("position", 0.0);
        double duration = call.getDouble("duration", 0.0);
        PlaybackService.setState(getContext(), state, (long) (position * 1000), (long) (duration * 1000));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        PlaybackService.setActionListener(null);
    }

    private static Bitmap decode(String base64) {
        if (base64 == null || base64.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException error) {
            return null;
        }
    }
}
