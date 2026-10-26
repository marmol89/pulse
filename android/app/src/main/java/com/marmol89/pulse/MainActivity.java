package com.marmol89.pulse;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se registran antes de crear el puente.
        registerPlugin(PlaybackPlugin.class);
        registerPlugin(FoldersPlugin.class);
        super.onCreate(savedInstanceState);
        // El audio de las carpetas del móvil, con rangos (el resto sigue yendo a Capacitor).
        bridge.setWebViewClient(new LocalAudioWebViewClient(bridge));
    }
}
