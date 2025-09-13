function makeContext(clientName = "WEB_REMIX") {
  const clients = {
    WEB_REMIX: { clientName: "WEB_REMIX", clientVersion: "1.20241211.07.00", hl: "en", gl: "US" },
    ANDROID_MUSIC: { clientName: "ANDROID_MUSIC", clientVersion: "7.32.51", hl: "en", gl: "US" },
    WEB: { clientName: "WEB", clientVersion: "2.20241211.07.00", hl: "en", gl: "US" }
  };
  const c = clients[clientName] || clients.WEB_REMIX;
  return { client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: c.hl, gl: c.gl }, user: { lockedSafetyMode: false } };
}
module.exports = makeContext;
