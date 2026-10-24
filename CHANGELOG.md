# Changelog

## [0.2.0](https://github.com/marmol89/pulse/compare/v0.1.0...v0.2.0) (2026-10-24)


### Novedades

* **android:** Pulse también como APK de Android ([#4](https://github.com/marmol89/pulse/issues/4)) ([40d2bad](https://github.com/marmol89/pulse/commit/40d2bad90949b78e8da17730f0c7aa35d1692d9f))
* **android:** sigue sonando en segundo plano, con controles del sistema ([#8](https://github.com/marmol89/pulse/issues/8)) ([72296ac](https://github.com/marmol89/pulse/commit/72296ac08ab273a29eea3d33c143f0ed37d624c4))


### Correcciones

* el appId de Electron es com.marmol89.pulse, igual que en Android ([#6](https://github.com/marmol89/pulse/issues/6)) ([0503a02](https://github.com/marmol89/pulse/commit/0503a027dc1d469d2cf48b2d802fce58a5690805))

## 0.1.0 (2026-10-24)


### Novedades

* añade el icono de la app generado a partir del diseño ([54ee199](https://github.com/marmol89/pulse/commit/54ee199b8481dbcf0fda47fd2d2a2583f6d486b8))
* **colleagues:** añade AudioEngine sobre HTMLAudioElement ([d388a68](https://github.com/marmol89/pulse/commit/d388a68937b4cfe12f13b6e58b0b85d6e9d1285c))
* **colleagues:** añade el modelo Catalog (biblioteca) ([dcf1eff](https://github.com/marmol89/pulse/commit/dcf1eff7ddc1f8fd33d65ac7e590c00c380dffe6))
* **colleagues:** añade el modelo Playlist (cola de reproducción) ([76228ff](https://github.com/marmol89/pulse/commit/76228fff6b79ddc6a0914a1a400ec73a7be6a558))
* **colleagues:** añade KeyboardShortcuts ([30348fa](https://github.com/marmol89/pulse/commit/30348fa52d068829f7757ab595b63245d574ac8f))
* **colleagues:** añade la vista ControlsView (player bar) ([80de15c](https://github.com/marmol89/pulse/commit/80de15cbe8605319ca066f372268eb05e717ec26))
* **colleagues:** añade la vista HomeView (pantalla Inicio) ([ea153a1](https://github.com/marmol89/pulse/commit/ea153a16d18db44081b5e5c9d50329127c081705))
* **colleagues:** añade la vista NowPlayingView (pantalla Reproduciendo) ([653fd82](https://github.com/marmol89/pulse/commit/653fd82d43ba9655baa162cf1191f2c2e7abed67))
* **colleagues:** añade las vistas PlaylistView y SearchView ([6b854cf](https://github.com/marmol89/pulse/commit/6b854cfec2a42abe4fb4515981a0c13672ac3d7e))
* **colleagues:** añade las vistas Router y ToastView ([d94f597](https://github.com/marmol89/pulse/commit/d94f597befb952b0ef24acb15f8489ffd828472a))
* **colleagues:** añade LibraryService y MediaSessionBridge ([c36f09c](https://github.com/marmol89/pulse/commit/c36f09c637e5a048f9817570387dd467dd75b7ab))
* **colleagues:** añade los modelos Favorites y Recents ([f5eea9c](https://github.com/marmol89/pulse/commit/f5eea9cab1fb80df802213cf4beae964f440aa1f))
* **colleagues:** interruptor "Datos de internet" en la sidebar ([aa01a78](https://github.com/marmol89/pulse/commit/aa01a7800294f6fdd525b936c94ae2bf8f9d0f31))
* **colleagues:** quitar pistas cuyo archivo ya no existe ([5c21643](https://github.com/marmol89/pulse/commit/5c216438074812fa5932e4e08c88df2b4f9a7934))
* **colleagues:** Settings, búsqueda en internet en LibraryService y Playlist.replace ([28682cf](https://github.com/marmol89/pulse/commit/28682cf5dad135a52b7ad9e561bd22aaff754d9b))
* **colleagues:** tarjeta Información en Reproduciendo ([dfb6297](https://github.com/marmol89/pulse/commit/dfb62974a94438eb0bc55d2fe516838229fac8be))
* **core:** añade las clases base Mediator y Colleague ([fd81fa8](https://github.com/marmol89/pulse/commit/fd81fa85914a5eb26f3f79ef23c975bfc09efaa4))
* **lib:** añade adaptador de almacenamiento y utilidades de texto ([f75a2f5](https://github.com/marmol89/pulse/commit/f75a2f56e021138c544b6fa582281bfb6ab26374))
* **main:** añade el acceso de solo lectura al bucket S3 ([6a0db23](https://github.com/marmol89/pulse/commit/6a0db23a7863a9b844dcd0d96d08ba99caf25a3f))
* **main:** añade el enriquecedor de pistas con datos de internet ([6444ee3](https://github.com/marmol89/pulse/commit/6444ee364a9693b48b84395ce1e6e71e570fce20))
* **main:** añade el escaneo y la persistencia de la biblioteca ([93d88f0](https://github.com/marmol89/pulse/commit/93d88f01a23885003a0a6f571e391af5d2e671e2))
* **main:** añade el importador y los canales IPC de la biblioteca ([c703649](https://github.com/marmol89/pulse/commit/c703649d269b67c5743fc3ca8e63221c80d656b8))
* **main:** añade el protocolo media:// con soporte de rangos ([222a95f](https://github.com/marmol89/pulse/commit/222a95faa8c4f0d80e75666ce4beb32e15dd09b7))
* **main:** añade la coincidencia de canciones para buscar en internet ([a7462ec](https://github.com/marmol89/pulse/commit/a7462ec46283183cc258e51a2a87878f4f394bef))
* **main:** añade la cola que completa la biblioteca en segundo plano ([99fe026](https://github.com/marmol89/pulse/commit/99fe026ae9dc597cf26322f0e1e38336953075ac))
* **main:** añade la conexión S3 guardada y cifrada ([2ff50d5](https://github.com/marmol89/pulse/commit/2ff50d503a0d12247f8c6f244149f2babef5bde4))
* **main:** añade la ventana principal y el preload ([cee0e01](https://github.com/marmol89/pulse/commit/cee0e01319b0547c614ff0cd444f5258f51a3bed))
* **main:** añade los clientes de iTunes Search y LRCLIB ([9c3787e](https://github.com/marmol89/pulse/commit/9c3787ef416d3f60450ed0e0b82a346a91ea230d))
* **main:** canales para subir canciones desde la ventana ([6c629bc](https://github.com/marmol89/pulse/commit/6c629bce4104ac3fae42aaa6d7020b9ab584c73b))
* **main:** conecta la vigilancia de archivos desaparecidos con la ventana ([55ac428](https://github.com/marmol89/pulse/commit/55ac428381c1d70c55818a7bcf861aa549d3e3cd))
* **main:** conecta los datos de internet con la ventana ([c73cfa3](https://github.com/marmol89/pulse/commit/c73cfa3d2314fc70aae543e5a563a9c8fdb58dcb))
* **main:** copia de los metadatos en la carpeta metadatos/ del bucket ([9e09ab5](https://github.com/marmol89/pulse/commit/9e09ab5bca291ad1d268f202b9c56e6b61ade694))
* **main:** el almacenamiento S3 puede subir canciones ([482f986](https://github.com/marmol89/pulse/commit/482f986f5f595839a0359b7fb43ab5d8a0a41c9b))
* **main:** la biblioteca sale del bucket S3 en vez de archivos locales ([bc759f3](https://github.com/marmol89/pulse/commit/bc759f32faf34dea558ee9016ee3e2ce96b370ad))
* **main:** la biblioteca se guarda y se recupera de metadatos/ del bucket ([3d54b27](https://github.com/marmol89/pulse/commit/3d54b277273b25e1df16a010a7c3b2e888f39c56))
* **main:** los registros saben si el título salió del nombre del archivo ([7c162d4](https://github.com/marmol89/pulse/commit/7c162d420c842b3ed3baca110294117c56391e95))
* **main:** reimportar recupera pistas desaparecidas; la cola las ignora ([fd36d44](https://github.com/marmol89/pulse/commit/fd36d44c8a4c2976023c7bf772d097d7e991213a))
* **main:** subir canciones del ordenador al bucket ([ef10972](https://github.com/marmol89/pulse/commit/ef109728cda79573a7b0039da8a7345cc211f2ac))
* **main:** vigila que los archivos de la biblioteca sigan en el disco ([a95c1aa](https://github.com/marmol89/pulse/commit/a95c1aa2b5660d5887d1ee8b85ded7922d446770))
* **mediator:** añade el catálogo de eventos y las acciones compartidas ([00a5e2b](https://github.com/marmol89/pulse/commit/00a5e2b145f90e2241824f6bd8ff829b66ffa348))
* **mediator:** añade el módulo online para datos de internet ([e9a756b](https://github.com/marmol89/pulse/commit/e9a756bd13587ab6bcd9507d0c3db0a963d4f0e2))
* **mediator:** añade handlers de biblioteca y de vistas ([957d6ce](https://github.com/marmol89/pulse/commit/957d6ced55f4fb25505a02134164b9e8a2ea3b41))
* **mediator:** añade handlers de favoritos, recientes y errores ([2c89771](https://github.com/marmol89/pulse/commit/2c89771c343d44c93a452646a55d2c72e6a2bd06))
* **mediator:** añade handlers de navegación entre pistas y modos ([01d93f8](https://github.com/marmol89/pulse/commit/01d93f80365ffbefce6c1e0a2335a854730a449c))
* **mediator:** añade handlers de reproducción y salida de audio ([8237db8](https://github.com/marmol89/pulse/commit/8237db8a46cc47621f1e458fac101a988c31f245))
* **mediator:** añade PlayerMediator, que solo compone ([61a7953](https://github.com/marmol89/pulse/commit/61a7953b36fec16575c522db6a748d2f651a8457))
* **online:** cliente de Deezer como segunda fuente de datos y carátula ([8e9c2b4](https://github.com/marmol89/pulse/commit/8e9c2b4f5f5c6dc6c89b6b2d0995aa071070ab69))
* **online:** nombres de archivo «Título - Artista» también se reconocen ([16f09b3](https://github.com/marmol89/pulse/commit/16f09b326e254c5c3bb5cebfb5d31c74e40c2b34))
* **renderer:** añade index.html y la raíz de composición app.js ([95c0bed](https://github.com/marmol89/pulse/commit/95c0bed7fc1080b6ef28bad25810fc5fd498f4d7))
* **renderer:** conexión S3 en la interfaz y adiós a los archivos locales ([af80182](https://github.com/marmol89/pulse/commit/af801823c8306d5dad791743ff6a788c056e59a9))
* **renderer:** coordinar la subida de canciones al bucket ([c6da5ca](https://github.com/marmol89/pulse/commit/c6da5ca5a111e57d96c185efd2cda9f11bb8a4d5))
* **renderer:** registra Settings en la raíz de composición ([07588b6](https://github.com/marmol89/pulse/commit/07588b68371da783ac33f2a8bafc7217aef69079))
* **ui:** añade componentes compartidos de lista de pistas y transporte ([67bf387](https://github.com/marmol89/pulse/commit/67bf38756542575614604c2cdb33113a2937aad0))
* **ui:** añade los estilos de estructura y componentes ([2c324a5](https://github.com/marmol89/pulse/commit/2c324a547a6194db1712e44e4e021e50019be0c3))
* **ui:** añade los iconos del diseño y helpers del DOM ([d86bc32](https://github.com/marmol89/pulse/commit/d86bc32f774ad79b5ae762c8a5e38465ce359e3d))
* **ui:** añade los tokens del diseño y las utilidades de formato ([65cc3d0](https://github.com/marmol89/pulse/commit/65cc3d072eb1851553d78a96009dc6a84912062a))
* **ui:** añade portadas generadas para pistas sin carátula ([64d67e8](https://github.com/marmol89/pulse/commit/64d67e8535d094fe06d7df27858c27fcfb3a18ae))
* **ui:** botón «Subir canciones» y arrastrar a la ventana ([629c6c2](https://github.com/marmol89/pulse/commit/629c6c2457c25ac4fdd4e2bed670fe826f5d4ab6))
* **ui:** las listas repintan solo la fila de una pista actualizada ([4dc8efd](https://github.com/marmol89/pulse/commit/4dc8efdbed37330d04d03c27e0ccd8041c266d37))
* **ui:** las vistas pueden quitar pistas y la player bar vaciarse ([826f60c](https://github.com/marmol89/pulse/commit/826f60c8ce3d1fb829da7d8008f84033453306ba))


### Correcciones

* **colleagues:** carátula en los controles multimedia del sistema ([f228f43](https://github.com/marmol89/pulse/commit/f228f43d8bd3d53f4f32c0661390f8e22dc64659))
* **core:** un handler lento ya no retrasa a los demás del mismo evento ([be39204](https://github.com/marmol89/pulse/commit/be3920404ed51897428c22c0087747fc3bd1560c))
* **main:** cifrado de la clave con la API asíncrona de safeStorage ([06557f0](https://github.com/marmol89/pulse/commit/06557f0198bf4ea52ced741262c0beba7342cdc0))
* **main:** letras limpias de LRCLIB en colaboraciones ([6b8ac15](https://github.com/marmol89/pulse/commit/6b8ac150bb826ba7ddfcbf035b4ca7b036167b10))
* **main:** no confundir la canción con otras versiones al buscar en internet ([86a9124](https://github.com/marmol89/pulse/commit/86a9124e6e5ae15d7ea5f119d4ccc20a4c1baa4d))
* **main:** reintentar la subida de metadatos si el servidor la rechaza ([a9e143d](https://github.com/marmol89/pulse/commit/a9e143de26ac252733f91c0f4578f68561bea621))
* **main:** un fallo de red al leer etiquetas no deja la canción a medias ([d18b29f](https://github.com/marmol89/pulse/commit/d18b29fbfbd99bdbd5ec846b79e2980a74dda79f))
* **mediator:** las canciones cuyo archivo desaparece se quitan sin error ([5d4f2dd](https://github.com/marmol89/pulse/commit/5d4f2dd480a751f824d3ef2700a315677bca76d0))
* **online:** completar canciones que iTunes no tiene y buscar bien su letra ([0a5a877](https://github.com/marmol89/pulse/commit/0a5a877dd3dcaf342998bd03cb4fc6ae8684f214))
* **online:** un fallo pasajero de LRCLIB no tira los datos ya encontrados ([f193209](https://github.com/marmol89/pulse/commit/f1932092e255b9e94c327d9a5399821e956cdfcb))
* **online:** un fallo pasajero de LRCLIB ya no sale como error en la consola ([04dc207](https://github.com/marmol89/pulse/commit/04dc20775df8efa9f850325a9c68e737f3d4a2f6))
* salidas de audio legibles y en español ([2481bd0](https://github.com/marmol89/pulse/commit/2481bd02fb5f430120e981a68b9e875474bd64b8))
* **ui:** la portada de Reproduciendo queda arriba y a la vista ([70b3a10](https://github.com/marmol89/pulse/commit/70b3a101c4bb885bbb073a68badd603084a25149))
* **ui:** permite portadas como span dentro de botones ([c0f16b4](https://github.com/marmol89/pulse/commit/c0f16b491a9dcf3636054128a011f505554503e3))
* **ui:** un solo anillo de foco y separación en los resultados de Buscar ([8adf7fc](https://github.com/marmol89/pulse/commit/8adf7fcf649c397434c3bdf79ecbb2770d3671af))
