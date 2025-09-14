const axios = require("axios");
const { JsDecipher } = require("./jsDecipher");

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://youtubei.googleapis.com/youtubei/v1";

const decipher = new JsDecipher();

function getContext(clientName = "ANDROID") {
  const clients = {
    ANDROID: { clientName: "ANDROID", clientVersion: "19.50.37", androidSdkVersion: 34, osName: "Android", osVersion: "14", platform: "MOBILE" },
    WEB_REMIX: { clientName: "WEB_REMIX", clientVersion: "1.20241211.07.00", platform: "DESKTOP" },
    TV_EMBEDDED: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", platform: "TV" },
    IOS: { clientName: "IOS", clientVersion: "19.50.7", platform: "MOBILE" },
    WEB: { clientName: "WEB", clientVersion: "2.20241211.07.00", platform: "DESKTOP" },
  };
  return { client: { ...clients[clientName], hl: "en", gl: "US" } };
}

async function searchTracks(query) {
  const res = await axios.post(
    `${BASE_URL}/search?key=${API_KEY}`,
    { context: getContext("WEB_REMIX"), query, params: "EgWKAQIIAWoKEAoQAxAEEAMQBA%3D%3D" },
    { headers: { "Content-Type": "application/json" } }
  );

  const contents = res.data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const results = [];

  for (const section of contents) {
    const items = section?.musicShelfRenderer?.contents || [];
    for (const item of items) {
      const renderer = item.musicResponsiveListItemRenderer;
      if (!renderer) continue;
      const title = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      const artist = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      const videoId = renderer?.playlistItemData?.videoId || renderer?.navigationEndpoint?.watchEndpoint?.videoId;
      if (videoId && title && artist) {
        results.push({ videoId, title, artist, thumbnail: renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url });
      }
    }
  }
  return results;
}

async function getTrackMetadata(videoId) {
  const res = await axios.post(
    `${BASE_URL}/player?key=${API_KEY}`,
    { context: getContext("WEB_REMIX"), videoId },
    { headers: { "Content-Type": "application/json" } }
  );
  const details = res.data?.videoDetails;
  if (!details) return null;
  return { title: details.title, artist: details.author, duration: parseInt(details.lengthSeconds) || 0, thumbnails: details.thumbnail?.thumbnails || [], description: details.shortDescription || "" };
}

async function getStreamingUrls(videoId) {
  const clientsToTry = ["ANDROID", "WEB_REMIX", "TV_EMBEDDED", "IOS", "WEB"];
  let lastError = null;

  for (const clientType of clientsToTry) {
    try {
      const res = await axios.post(
        `${BASE_URL}/player?key=${API_KEY}`,
        { context: getContext(clientType), videoId },
        { headers: { "Content-Type": "application/json" } }
      );

      const data = res.data;
      const streamingData = data?.streamingData;
      if (!streamingData) continue;
      const urls = [];

      for (const fmt of streamingData.adaptiveFormats || []) {
        if (fmt.mimeType?.includes("audio")) {
          if (fmt.url) {
            urls.push({ url: fmt.url, mimeType: fmt.mimeType });
          } else if (fmt.signatureCipher) {
            const params = new URLSearchParams(fmt.signatureCipher);
            const url = params.get("url");
            const s = params.get("s");
            const sp = params.get("sp") || "sig";

            if (!decipher.ready) {
              const jsUrl = data?.playbackTracking?.atrUrl?.baseUrl || null;
              if (!jsUrl) throw new Error("No player JS url found in response");
              const jsResp = await axios.get(jsUrl);
              decipher.prepareFromSource(jsResp.data);
            }
            const sig = await decipher.decipher(s);
            urls.push({ url: `${url}&${sp}=${sig}`, mimeType: fmt.mimeType });
          }
        }
      }
      if (urls.length > 0) return urls;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error("No playable stream URLs found");
}

module.exports = { searchTracks, getTrackMetadata, getStreamingUrls };