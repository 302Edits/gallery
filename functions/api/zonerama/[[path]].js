import { createZoneramaHandler } from '../../../shared/zonerama.mjs';
const handle = createZoneramaHandler();
export function onRequest({ request }) { return handle(request); }
