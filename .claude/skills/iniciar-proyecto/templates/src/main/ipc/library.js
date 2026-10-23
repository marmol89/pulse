import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.opus', '.webm']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [full] : [];
  }));
  return files.flat();
}

async function toTrack(filePath) {
  const base = {
    path: filePath,
    url: `media://${encodeURIComponent(filePath)}`,
    title: path.basename(filePath, path.extname(filePath)),
    artist: 'Desconocido',
    album: '',
    genre: '',
    lyrics: '',
    duration: 0,
    cover: null,
  };
  try {
    const { common, format } = await parseFile(filePath, { duration: false });
    const picture = common.picture?.[0];
    return {
      ...base,
      title: common.title || base.title,
      artist: common.artist || base.artist,
      album: common.album || '',
      genre: common.genre?.[0] || '',
      lyrics: common.lyrics?.map((l) => (typeof l === 'string' ? l : l.text ?? '')).join('\n') || '',
      duration: format.duration ?? 0,
      cover: picture
        ? `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
        : null,
    };
  } catch {
    return base;
  }
}

export function registerLibraryIpc() {
  ipcMain.handle('library:pick-files', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender),
      {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS].map((e) => e.slice(1)) }],
      },
    );
    return canceled ? [] : Promise.all(filePaths.map(toTrack));
  });

  ipcMain.handle('library:pick-folder', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender),
      { properties: ['openDirectory'] },
    );
    if (canceled || !filePaths[0]) return [];
    const files = (await walk(filePaths[0])).sort((a, b) => a.localeCompare(b));
    return Promise.all(files.map(toTrack));
  });
}
