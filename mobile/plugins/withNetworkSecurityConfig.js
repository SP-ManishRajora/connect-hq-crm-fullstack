// Points the Android manifest at res/xml/network_security_config.xml.
//
// The config itself adds the ISRG roots to the trust store: devices frozen on an
// old security patch (the housekeeping handsets are Android 12 / 2024-02) do not
// carry ISRG Root X2 and so cannot complete a TLS handshake with the CRM.
//
// This lives as a config plugin rather than a hand-edit of the manifest because
// `expo prebuild` regenerates android/ from scratch and would drop the attribute.
const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withNetworkSecurityConfig(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    }
    return cfg;
  });
};
