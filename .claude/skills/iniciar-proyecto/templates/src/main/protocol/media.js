import { protocol } from 'electron';
import { MEDIA_SCHEME } from './urls.js';
import { respondToMedia } from './responses.js';

/** Debe llamarse antes de que la app esté lista. */
export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
  ]);
}

/** @param {{ isAllowed: (path: string) => boolean, readCover: (path: string) => Promise<object|null> }} deps */
export function handleMediaProtocol(deps) {
  protocol.handle(MEDIA_SCHEME, (request) => respondToMedia(request.url, request.headers.get('range'), deps));
}
