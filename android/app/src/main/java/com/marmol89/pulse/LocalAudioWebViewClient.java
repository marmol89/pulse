package com.marmol89.pulse;

import android.content.ContentResolver;
import android.content.Context;
import android.content.UriPermission;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sirve al WebView el audio de las carpetas elegidas (src/android/folders.js): http://localhost/_pulse_local_/?uri=…
 * con rangos de verdad, que es lo que necesita el <audio> para saltar (el servidor de Capacitor responde a los
 * rangos de content:// con el archivo desde el principio). Solo documentos de carpetas con permiso guardado
 * (FoldersPlugin): no sirve nada más del móvil. El resto de peticiones siguen a Capacitor.
 */
public class LocalAudioWebViewClient extends BridgeWebViewClient {

    static final String PATH = "/_pulse_local_/";
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private final Bridge bridge;

    public LocalAudioWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (bridge.getHost().equals(url.getHost()) && PATH.equals(url.getPath())) {
            return serve(url.getQueryParameter("uri"), request.getRequestHeaders());
        }
        return super.shouldInterceptRequest(view, request);
    }

    private WebResourceResponse serve(String uri, Map<String, String> requestHeaders) {
        Context context = bridge.getContext();
        ContentResolver resolver = context.getContentResolver();
        Uri document = uri == null ? null : Uri.parse(uri);
        if (document == null || !allowed(context, resolver, document)) return status(403, "Forbidden");
        ParcelFileDescriptor descriptor;
        try {
            descriptor = resolver.openFileDescriptor(document, "r");
        } catch (Exception error) {
            return status(404, "Not Found");
        }
        if (descriptor == null) return status(404, "Not Found");
        try {
            long size = descriptor.getStatSize();
            FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
            String mime = resolver.getType(document);
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-store");
            String range = header(requestHeaders, "Range");
            Matcher match = range == null || size < 0 ? null : RANGE.matcher(range.trim());
            if (match == null || !match.matches() || (match.group(1).isEmpty() && match.group(2).isEmpty())) {
                if (size >= 0) headers.put("Content-Length", String.valueOf(size));
                return new WebResourceResponse(mime, null, 200, "OK", headers, input);
            }
            long start;
            long end;
            if (match.group(1).isEmpty()) {
                start = Math.max(0, size - Long.parseLong(match.group(2)));
                end = size - 1;
            } else {
                start = Long.parseLong(match.group(1));
                end = match.group(2).isEmpty() ? size - 1 : Math.min(Long.parseLong(match.group(2)), size - 1);
            }
            if (start > end || start >= size) {
                input.close();
                headers.put("Content-Range", "bytes */" + size);
                return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0]));
            }
            // El stream va desde el principio: con un Range, el WebView calcula el trozo con available() y salta
            // él mismo hasta el inicio (si se le da ya colocado, los rangos que no empiezan en 0 fallan).
            headers.put("Content-Length", String.valueOf(end - start + 1));
            headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            return new WebResourceResponse(mime, null, 206, "Partial Content", headers, new LimitedInputStream(input, end + 1));
        } catch (IOException error) {
            return status(500, "Internal Server Error");
        }
    }

    /** ¿Es un documento de una carpeta que el usuario eligió (y cuyo permiso sigue guardado)? */
    private static boolean allowed(Context context, ContentResolver resolver, Uri document) {
        try {
            if (!DocumentsContract.isDocumentUri(context, document)) return false;
            String tree = DocumentsContract.getTreeDocumentId(document);
            for (UriPermission permission : resolver.getPersistedUriPermissions()) {
                Uri granted = permission.getUri();
                if (
                    permission.isReadPermission() &&
                    document.getAuthority() != null &&
                    document.getAuthority().equals(granted.getAuthority()) &&
                    tree.equals(DocumentsContract.getTreeDocumentId(granted))
                ) return true;
            }
        } catch (IllegalArgumentException error) {
            // no es una URI de un árbol de documentos
        }
        return false;
    }

    private static String header(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> entry : headers.entrySet()) if (entry.getKey().equalsIgnoreCase(name)) return entry.getValue();
        return null;
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    /** Los primeros `remaining` bytes de un stream: hasta el final del rango pedido. */
    private static class LimitedInputStream extends FilterInputStream {

        private long remaining;

        LimitedInputStream(InputStream input, long remaining) {
            super(input);
            this.remaining = remaining;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = super.read();
            if (value >= 0) remaining--;
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            if (remaining <= 0) return -1;
            int count = super.read(buffer, offset, (int) Math.min(length, remaining));
            if (count > 0) remaining -= count;
            return count;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), remaining);
        }
    }
}
