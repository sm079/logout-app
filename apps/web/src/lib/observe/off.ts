/* Stands in for the error and analytics SDKs when the app is built without their keys, so neither is bundled */
const noop = () => {};
export const init = noop;
export const captureException = noop;
export default { init: noop, capture: noop, identify: noop, reset: noop };
