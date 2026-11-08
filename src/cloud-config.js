// Only public browser configuration belongs here. Build-time values are checked
// by build.mjs; secret/service-role keys must never enter the generated bundle.
export const CLOUD_CONFIG = typeof __CLOUD_CONFIG__ === 'undefined'
  ? { url: '', publishableKey: '', googleEnabled: false }
  : __CLOUD_CONFIG__;
