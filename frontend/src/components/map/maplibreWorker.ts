// MapLibre 6 runs its parser in a module worker and, by default, looks for it next to its own file. Vite moves that
// file (dependency pre-bundling, hashed build chunks), so bundle the worker as a chunk of its own and point MapLibre
// at it. Must run before the first map is created: SpotMap imports this module for its side effect.
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

void workerUrl
