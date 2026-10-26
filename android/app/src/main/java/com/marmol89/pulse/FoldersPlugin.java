package com.marmol89.pulse;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Carpetas de música del móvil (src/android/folders.js): el usuario elige una con el selector del sistema
 * (Storage Access Framework) y Pulse recibe permiso de lectura de esa carpeta y nada más, que se guarda para
 * siempre (takePersistableUriPermission) hasta que la quita. Aquí solo se elige, se recorre y se devuelve el
 * permiso; el audio lo sirve LocalAudioWebViewClient.
 */
@CapacitorPlugin(name = "PulseFolders")
public class FoldersPlugin extends Plugin {

    private static final int MAX_DEPTH = 32;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /** Abre el selector de carpetas. Resuelve { uri, name } o {} si se cancela. */
    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Uri tree = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || tree == null) {
            call.resolve(new JSObject());
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException error) {
            call.reject("No se pudo obtener permiso para leer esa carpeta");
            return;
        }
        JSObject folder = new JSObject();
        folder.put("uri", tree.toString());
        folder.put("name", displayName(tree));
        call.resolve(folder);
    }

    /** Todos los archivos de la carpeta (y sus subcarpetas): { files: [{ uri, path, size, lastModified }] }. */
    @PluginMethod
    public void list(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Falta la carpeta");
            return;
        }
        worker.execute(() -> {
            try {
                Uri tree = Uri.parse(uri);
                JSArray files = new JSArray();
                walk(getContext().getContentResolver(), tree, DocumentsContract.getTreeDocumentId(tree), "", 0, files);
                JSObject data = new JSObject();
                data.put("files", files);
                call.resolve(data);
            } catch (Exception error) {
                call.reject("No se puede leer la carpeta", error);
            }
        });
    }

    /** Devuelve el permiso de una carpeta que el usuario ha quitado. */
    @PluginMethod
    public void release(PluginCall call) {
        String uri = call.getString("uri");
        try {
            if (uri != null) getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // ya no lo tenía
        }
        call.resolve();
    }

    private void walk(ContentResolver resolver, Uri tree, String parentId, String prefix, int depth, JSArray files) {
        if (depth > MAX_DEPTH) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        String[] columns = { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_LAST_MODIFIED };
        try (Cursor cursor = resolver.query(children, columns, null, null, null)) {
            if (cursor == null) throw new IllegalStateException("Sin permiso para leer la carpeta");
            while (cursor.moveToNext()) {
                String id = cursor.getString(0);
                String name = cursor.getString(1);
                if (id == null || name == null || name.startsWith(".")) continue;
                if (Document.MIME_TYPE_DIR.equals(cursor.getString(2))) {
                    walk(resolver, tree, id, prefix + name + "/", depth + 1, files);
                } else {
                    JSObject file = new JSObject();
                    file.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                    file.put("path", prefix + name);
                    file.put("size", cursor.isNull(3) ? 0 : cursor.getLong(3));
                    file.put("lastModified", cursor.isNull(4) ? 0 : cursor.getLong(4));
                    files.put(file);
                }
            }
        }
    }

    /** Nombre de la carpeta para la interfaz ("Music"), o su id si el proveedor no lo da. */
    private String displayName(Uri tree) {
        Uri document = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor cursor = getContext().getContentResolver().query(document, new String[] { Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) return cursor.getString(0);
        } catch (Exception ignored) {
            // se usa el id
        }
        return DocumentsContract.getTreeDocumentId(tree);
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdown();
    }
}
