package com.marmol89.pulse;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * Servicio en primer plano mientras hay una pista (sonando o en pausa). Sin él, Android silencia el
 * audio del WebView en cuanto la app pasa a segundo plano o se apaga la pantalla. Publica la pista en
 * una MediaSession (controles de la notificación, la pantalla de bloqueo y los auriculares) y mantiene
 * la CPU despierta solo mientras suena. Lo maneja PlaybackPlugin; el estado vive aquí, estático.
 */
public class PlaybackService extends Service {

    /** Acción del sistema que se reenvía a JS: play, pause, previoustrack, nexttrack o seekto. */
    public interface ActionListener {
        void onAction(String action, double seekTime);
    }

    public static final class Track {
        final String title;
        final String artist;
        final String album;
        final Bitmap artwork;

        public Track(String title, String artist, String album, Bitmap artwork) {
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.artwork = artwork;
        }
    }

    private static final String CHANNEL_ID = "reproduccion";
    private static final int NOTIFICATION_ID = 1;
    private static final String ACTION_TOGGLE = "com.marmol89.pulse.TOGGLE";
    private static final String ACTION_NEXT = "com.marmol89.pulse.NEXT";
    private static final String ACTION_PREVIOUS = "com.marmol89.pulse.PREVIOUS";
    /** Se renueva con cada posición (una por segundo): si JS se queda colgado, la CPU no queda despierta. */
    private static final long WAKE_LOCK_MS = 60_000;

    private static PlaybackService instance;
    private static ActionListener listener;
    private static Track track;
    private static String state = "none";
    private static long positionMs;
    private static long durationMs;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private boolean noisyRegistered;
    /** Lo que muestra la notificación: solo se rehace si cambia (la posición va por la MediaSession). */
    private Track shownTrack;
    private Boolean shownPlaying;

    /** Al quitar los auriculares (o desconectar el Bluetooth) se pausa, como cualquier reproductor. */
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) dispatch("pause", -1);
        }
    };

    static void setActionListener(ActionListener value) {
        listener = value;
    }

    static void setTrack(Context context, Track value) {
        track = value;
        if (instance != null) instance.refresh(false);
    }

    static void setState(Context context, String value, long position, long duration) {
        state = value;
        positionMs = position;
        durationMs = duration;
        if ("none".equals(value)) {
            if (instance != null) instance.stopSelf();
        } else if (instance != null) {
            instance.refresh(false);
        } else if ("playing".equals(value)) {
            try {
                context.startForegroundService(new Intent(context, PlaybackService.class));
            } catch (IllegalStateException error) {
                // Android no deja iniciarlo desde segundo plano: se intentará al volver a sonar.
            }
        }
    }

    private static void dispatch(String action, double seekTime) {
        if (listener != null) listener.onAction(action, seekTime);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);

        session = new MediaSession(this, "Pulse");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                dispatch("play", -1);
            }

            @Override
            public void onPause() {
                dispatch("pause", -1);
            }

            @Override
            public void onStop() {
                dispatch("pause", -1);
            }

            @Override
            public void onSkipToNext() {
                dispatch("nexttrack", -1);
            }

            @Override
            public void onSkipToPrevious() {
                dispatch("previoustrack", -1);
            }

            @Override
            public void onSeekTo(long position) {
                dispatch("seekto", position / 1000.0);
            }
        });
        session.setSessionActivity(openAppIntent());
        session.setActive(true);

        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Pulse:reproduccion");
        wakeLock.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_TOGGLE.equals(action)) dispatch("playing".equals(state) ? "pause" : "play", -1);
        else if (ACTION_NEXT.equals(action)) dispatch("nexttrack", -1);
        else if (ACTION_PREVIOUS.equals(action)) dispatch("previoustrack", -1);
        // Siempre en primer plano: startForegroundService() lo exige en unos segundos.
        refresh(true);
        return START_NOT_STICKY;
    }

    /** Pasa el estado actual a la MediaSession, la notificación, el wake lock y el aviso de auriculares. */
    private void refresh(boolean force) {
        boolean playing = "playing".equals(state);
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, positionMs, playing ? 1f : 0f, SystemClock.elapsedRealtime())
            .build());
        MediaMetadata.Builder metadata = new MediaMetadata.Builder().putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        if (track != null) {
            metadata.putString(MediaMetadata.METADATA_KEY_TITLE, track.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, track.artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, track.album);
            if (track.artwork != null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, track.artwork);
        }
        session.setMetadata(metadata.build());

        if (force || track != shownTrack || !Boolean.valueOf(playing).equals(shownPlaying)) {
            shownTrack = track;
            shownPlaying = playing;
            Notification notification = buildNotification(playing);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        }

        if (playing) wakeLock.acquire(WAKE_LOCK_MS);
        else if (wakeLock.isHeld()) wakeLock.release();
        if (playing && !noisyRegistered) {
            registerReceiver(noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
            noisyRegistered = true;
        } else if (!playing && noisyRegistered) {
            unregisterReceiver(noisyReceiver);
            noisyRegistered = false;
        }
    }

    private Notification buildNotification(boolean playing) {
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_pulse)
            .setContentTitle(track != null ? track.title : getString(R.string.app_name))
            .setContentText(track != null ? track.artist : "")
            .setContentIntent(openAppIntent())
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .addAction(action(android.R.drawable.ic_media_previous, R.string.playback_previous, ACTION_PREVIOUS, 1))
            .addAction(playing
                ? action(android.R.drawable.ic_media_pause, R.string.playback_pause, ACTION_TOGGLE, 2)
                : action(android.R.drawable.ic_media_play, R.string.playback_play, ACTION_TOGGLE, 2))
            .addAction(action(android.R.drawable.ic_media_next, R.string.playback_next, ACTION_NEXT, 3))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (track != null && track.artwork != null) builder.setLargeIcon(track.artwork);
        return builder.build();
    }

    private Notification.Action action(int icon, int title, String action, int requestCode) {
        Intent intent = new Intent(this, PlaybackService.class).setAction(action);
        PendingIntent pending = PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), getString(title), pending).build();
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Al cerrar la app desde recientes, se para todo con ella. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (noisyRegistered) unregisterReceiver(noisyReceiver);
        noisyRegistered = false;
        if (wakeLock.isHeld()) wakeLock.release();
        session.setActive(false);
        session.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
