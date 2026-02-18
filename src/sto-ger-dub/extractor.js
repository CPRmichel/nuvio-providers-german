var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
const PROVIDER_NAME = "s.to (GER DUB)";
const DEFAULT_QUALITY = "720p";
function normalizeTitle(value) {
  if (!value)
    return "";
  return String(value).toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
}
function resolveMediaInfo(tmdbId, mediaType, season, episode, args) {
  let title2 = null;
  let year = null;
  if (tmdbId && typeof tmdbId === "object") {
    title2 = tmdbId.title || tmdbId.name || tmdbId.original_title || tmdbId.original_name || title2;
    const date = tmdbId.release_date || tmdbId.first_air_date || tmdbId.air_date;
    if (date && typeof date === "string" && date.length >= 4) {
      year = date.slice(0, 4);
    }
    if (!year && tmdbId.year)
      year = String(tmdbId.year);
  }
  if (!title2 && args && typeof args[4] === "string") {
    title2 = args[4];
  }
  if (!title2 && args && args[4] && typeof args[4] === "object") {
    const meta = args[4];
    title2 = meta.title || meta.name || title2;
    if (!year && meta.year)
      year = String(meta.year);
  }
  return {
    title: title2 ? String(title2).trim() : null,
    year
  };
}
function pickBestResult(results, title2) {
  if (!results || results.length === 0)
    return null;
  if (!title2)
    return results[0];
  const normalized = normalizeTitle(title2);
  let exact = results.find((r) => normalizeTitle(r.title) === normalized);
  if (exact)
    return exact;
  let contains = results.find((r) => {
    const candidate = normalizeTitle(r.title);
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
  return contains || results[0];
}
function pickSeasonLink(seasonLinks, seasonNumber) {
  if (!seasonLinks || seasonLinks.length === 0)
    return null;
  if (!seasonNumber || Number(seasonNumber) <= 0)
    return null;
  const seasonTag = `staffel-${seasonNumber}`;
  const direct = seasonLinks.find((link) => link.includes(seasonTag));
  if (direct)
    return direct;
  const index = Number(seasonNumber) - 1;
  if (index >= 0 && index < seasonLinks.length)
    return seasonLinks[index];
  return null;
}
function pickMovieSeasonLink(seasonLinks) {
  if (!seasonLinks || seasonLinks.length === 0)
    return null;
  return seasonLinks.find((link) => link.includes("/filme")) || seasonLinks.find((link) => link.includes("staffel-0")) || seasonLinks[0];
}
function fetchText(url2) {
  return __async(this, null, function* () {
    const response2 = yield soraFetch(url2);
    return response2 && response2.text ? yield response2.text() : response2;
  });
}
function buildStreamsFromEpisodeUrl(url2) {
  return __async(this, null, function* () {
    const streams = yield extractStreamUrl(url2);
    if (!Array.isArray(streams) || streams.length === 0)
      return [];
    return streams.filter((stream) => stream && stream.streamUrl).map((stream) => ({
      name: PROVIDER_NAME,
      title: stream.title || PROVIDER_NAME,
      url: stream.streamUrl,
      quality: DEFAULT_QUALITY,
      headers: stream.headers
    }));
  });
}
function getStreams(_0, _1, _2, _3) {
  return __async(this, arguments, function* (tmdbId, mediaType, season, episode) {
    try {
      const info = resolveMediaInfo(tmdbId, mediaType, season, episode, arguments);
      const title2 = info.title;
      if (!title2) {
        console.log("[s.to] Missing title metadata; cannot search.");
        return [];
      }
      const results = yield searchResults(title2);
      const chosen = pickBestResult(results, title2);
      if (!chosen || !chosen.href)
        return [];
      const showHtml = yield fetchText(chosen.href);
      const seasonLinks = getSeasonLinks(showHtml || "");
      if (mediaType === "movie") {
        const movieSeasonLink = pickMovieSeasonLink(seasonLinks);
        if (movieSeasonLink) {
          const episodes2 = yield fetchSeasonEpisodes(movieSeasonLink);
          if (episodes2 && episodes2.length > 0) {
            return yield buildStreamsFromEpisodeUrl(episodes2[0].href);
          }
        }
        return yield buildStreamsFromEpisodeUrl(chosen.href);
      }
      const selectedSeasonLink = pickSeasonLink(seasonLinks, season) || pickMovieSeasonLink(seasonLinks);
      if (!selectedSeasonLink)
        return [];
      const episodes = yield fetchSeasonEpisodes(selectedSeasonLink);
      if (!episodes || episodes.length === 0)
        return [];
      const episodeNumber = Number(episode) || 1;
      const selectedEpisode = episodes.find((ep) => Number(ep.number) === episodeNumber) || episodes[episodeNumber - 1];
      if (!selectedEpisode || !selectedEpisode.href)
        return [];
      return yield buildStreamsFromEpisodeUrl(selectedEpisode.href);
    } catch (error) {
      console.log("[s.to] getStreams error:", error && error.message ? error.message : error);
      return [];
    }
  });
}
function searchResults(keyword) {
  return __async(this, null, function* () {
    try {
      const baseUrl = "https://s.to";
      const encodedKeyword = encodeURIComponent(keyword);
      const searchApiUrl = `https://s.to/suche?term=${encodedKeyword}`;
      const response2 = yield soraFetch(searchApiUrl);
      const text = response2.text ? yield response2.text() : yield response2;
      const searchRegex = /<a\s+href="([^"]+)"\s+class="d-block\s+show-cover"[\s\S]*?<img\s+src="([^"]+)"[\s\S]*?class="show-title[^"]*"[^>]*>([\s\S]*?)<\//g;
      const results = [];
      let match;
      while ((match = searchRegex.exec(text)) !== null) {
        const [_, href, image, title2] = match;
        if (results.some((result) => result.href === baseUrl + href.trim())) {
          continue;
        }
        results.push({ title: title2.trim(), image: baseUrl + image.trim(), href: baseUrl + href.trim() });
      }
      console.log("Search Results: " + JSON.stringify(results));
      return results;
    } catch (error) {
      sendLog("Fetch error:" + error);
      return [];
    }
  });
}
function extractDetails(url2) {
  return __async(this, null, function* () {
    try {
      const fetchUrl = `${url2}`;
      const response2 = yield soraFetch(fetchUrl);
      const text = response2.text ? yield response2.text() : yield response2;
      const descriptionRegex = /<span class="description-text"[^>]*>([\s\S]*?)<\/span>/;
      const descriptionMatch = descriptionRegex.exec(text);
      let description = descriptionMatch ? descriptionMatch[1].trim() : "No description available";
      description = description.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const yearRegex = /<a class="small text-muted" href="https:\/\/s\.to\/jahr\/\d{4}">(\d{4})<\/a>/;
      const yearMatch = yearRegex.exec(text);
      const airdateMatch = yearMatch ? `${yearMatch[1]}` : "Unknown Year";
      const genresRegex = /<li class="series-group">\s*<strong class="me-1">Genre:<\/strong>([\s\S]*?)<\/li>/;
      const genresMatch = genresRegex.exec(text);
      let genres = "";
      if (genresMatch) {
        const genreLinksRegex = /<a href="https:\/\/s\.to\/genre\/[^"]+" class="link-light">([^<]+)<\/a>/g;
        let genreMatch;
        while ((genreMatch = genreLinksRegex.exec(genresMatch[1])) !== null) {
          genres += genreMatch[1] + ", ";
        }
        genres = genres.replace(/, $/, "");
      }
      const transformedResults = [{
        description: description || "No description available",
        aliases: genres || "",
        airdate: airdateMatch
      }];
      return transformedResults;
    } catch (error) {
      sendLog("Details error:" + error);
      return [{
        description: "Error loading description",
        aliases: "Duration: Unknown",
        airdate: "Aired: Unknown"
      }];
    }
  });
}
function extractEpisodes(url2) {
  return __async(this, null, function* () {
    try {
      const baseUrl = "https://s.to";
      const fetchUrl = `${url2}`;
      const response2 = yield soraFetch(fetchUrl);
      const html2 = response2.text ? yield response2.text() : response2;
      const finishedList = [];
      const seasonLinks = getSeasonLinks(html2);
      sendLog("Season Links: " + JSON.stringify(seasonLinks));
      for (const seasonLink of seasonLinks) {
        const seasonEpisodes = yield fetchSeasonEpisodes(`${seasonLink}`);
        finishedList.push(...seasonEpisodes);
      }
      sendLog("Finished Episode List: " + JSON.stringify(finishedList));
      return finishedList;
    } catch (error) {
      sendLog("Fetch error:" + error);
      return [];
    }
  });
}
function extractStreamUrl(url2) {
  return __async(this, null, function* () {
    try {
      sendLog("ExtractStreamUrl called with URL: " + url2);
      const language = [1, 3, 2, 4];
      const fetchUrl = `${url2}`;
      const response2 = yield soraFetch(fetchUrl);
      const text = response2.text ? yield response2.text() : response2;
      const videoLinks = getVideoLinks(text);
      let providerArray = selectHoster(videoLinks, language);
      sendLog("Provider List: " + JSON.stringify(providerArray));
      try {
        let streams = yield multiExtractor(providerArray);
        let returnedStreams = {
          streams
        };
        sendLog("Returned Streams: " + JSON.stringify(returnedStreams));
        if (streams.length === 0) {
          sendLog("No streams found");
          return [];
        }
        return streams;
      } catch (error) {
        sendLog("Error in multiExtractor: " + error);
        return [];
      }
    } catch (error) {
      sendLog("ExtractStreamUrl error:" + error);
      return [];
    }
  });
}
function selectHoster(finishedList, preferredLang) {
  let provider2 = {};
  const languages = {
    "Deutsch": 1,
    "Englisch": 2,
    "Ger-Sub": 3,
    "Eng-Sub": 4
  };
  console.log("Hoster List: " + JSON.stringify(finishedList));
  for (const lang of preferredLang) {
    for (const video of finishedList) {
      if (video.language === lang) {
        provider2[video.href] = video.provider;
      }
    }
    if (Object.keys(provider2).length > 0) {
      break;
    }
  }
  sendLog("Provider List: " + JSON.stringify(provider2));
  return provider2;
}
function sendLog(message) {
  return __async(this, null, function* () {
    console.log(message);
    return;
    yield fetch("http://192.168.2.130/sora-module/log.php?action=add&message=" + encodeURIComponent(message)).catch((error) => {
      console.error("Error sending log:", error);
    });
  });
}
function getSeasonLinks(html2) {
  const seasonLinks = [];
  const baseUrl = "https://s.to";
  const seasonRegex = /<nav class="mb-2" id="season-nav">[\s\S]*?<ul class="nav list-items-nav">([\s\S]*?)<\/ul>/;
  const seasonMatch = seasonRegex.exec(html2);
  if (seasonMatch) {
    const seasonList = seasonMatch[1];
    const seasonLinkRegex = /<a\s+[^>]*?href="([^"]+)"[^>]*?class="[^"]*alphabet-link/g;
    let seasonLinkMatch;
    const filmeLinks = [];
    while ((seasonLinkMatch = seasonLinkRegex.exec(seasonList)) !== null) {
      const [_, seasonLink] = seasonLinkMatch;
      if (seasonLink.endsWith("/filme") || seasonLink.includes("staffel-0")) {
        filmeLinks.push(seasonLink);
      } else {
        seasonLinks.push(seasonLink);
      }
    }
    seasonLinks.push(...filmeLinks);
  }
  for (let i = 0; i < seasonLinks.length; i++) {
    if (seasonLinks[i].startsWith("/")) {
      seasonLinks[i] = baseUrl + seasonLinks[i];
    }
  }
  return seasonLinks;
}
function fetchSeasonEpisodes(url2) {
  return __async(this, null, function* () {
    var _a;
    try {
      const baseUrl = "https://s.to";
      const fetchUrl = `${url2}`;
      const response2 = yield soraFetch(fetchUrl);
      const text = (_a = yield response2 == null ? void 0 : response2.text()) != null ? _a : yield response2;
      const episodeDivRegex = /<nav class="mb-3" id="episode-nav">[\s\S]*?<ul class="nav list-items-nav">([\s\S]*?)<\/ul>/;
      const episodeDivMatch = episodeDivRegex.exec(text);
      const episodeList = [];
      if (episodeDivMatch) {
        const episodeListHtml = episodeDivMatch[1];
        const episodeLinkRegex = /<a\s+[^>]*?href="([^"]+)"[^>]*?class="[^"]*alphabet-link[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
        let episodeLinkMatch;
        let number = 0;
        while ((episodeLinkMatch = episodeLinkRegex.exec(episodeListHtml)) !== null) {
          const [_, episodeLink] = episodeLinkMatch;
          number += 1;
          episodeList.push({ number, href: episodeLink });
        }
        console.log("Episode List for season " + url2 + ": " + JSON.stringify(episodeList));
      }
      for (let i = 0; i < episodeList.length; i++) {
        if (episodeList[i].href.startsWith("/")) {
          episodeList[i].href = baseUrl + episodeList[i].href;
        }
      }
      return episodeList;
    } catch (error) {
      sendLog("FetchSeasonEpisodes helper function error:" + error);
      return [{ number: "0", href: "https://error.org" }];
    }
  });
}
function getVideoLinks(html2) {
  const baseUrl = "https://s.to";
  const videoLinks = [];
  const videoLinkRegex = /<button\s+type="button"[^>]*?class="link-box btn btn-dark w-100 text-start gap-2"[^>]*?data-play-url="([^"]+)"[^>]*?data-provider-name="([^"]+)"[^>]*?data-language-id="([^"]+)"[^>]*?>/g;
  let videoLinkMatch;
  while ((videoLinkMatch = videoLinkRegex.exec(html2)) !== null) {
    const [_, href, provider2, language] = videoLinkMatch;
    videoLinks.push({ href: `${baseUrl}${href}`, provider: provider2.toLowerCase(), language: parseInt(language) });
  }
  console.log("Video Links: " + JSON.stringify(videoLinks));
  return videoLinks;
}
function _0xCheck() {
  var _0x1a = typeof _0xB4F2 === "function";
  var _0x2b = typeof _0x7E9A === "function";
  return _0x1a && _0x2b ? function(_0x3c) {
    return _0x7E9A(_0x3c);
  }(_0xB4F2()) : false;
}
function _0x7E9A(_) {
  return ((___, ____, _____, ______, _______, ________, _________, __________, ___________, ____________) => (____ = typeof ___, _____ = ___ && ___[String.fromCharCode(...[108, 101, 110, 103, 116, 104])], ______ = [...String.fromCharCode(...[99, 114, 97, 110, 99, 105])], _______ = ___ ? [...___[String.fromCharCode(...[116, 111, 76, 111, 119, 101, 114, 67, 97, 115, 101])]()] : [], (________ = ______[String.fromCharCode(...[115, 108, 105, 99, 101])]()) && _______[String.fromCharCode(...[102, 111, 114, 69, 97, 99, 104])]((_________2, __________2) => (___________ = ________[String.fromCharCode(...[105, 110, 100, 101, 120, 79, 102])](_________2)) >= 0 && ________[String.fromCharCode(...[115, 112, 108, 105, 99, 101])](___________, 1)), ____ === String.fromCharCode(...[115, 116, 114, 105, 110, 103]) && _____ === 16 && ________[String.fromCharCode(...[108, 101, 110, 103, 116, 104])] === 0))(_);
}
function base64Decode(str) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  str = String(str).replace(/=+$/, "");
  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}
/**
 * @name global_extractor.js
 * @description A global extractor for various streaming providers to be used in Sora Modules.
 * @author Cufiy
 * @url https://github.com/JMcrafter26/sora-global-extractor
 * @license CUSTOM LICENSE - see https://github.com/JMcrafter26/sora-global-extractor/blob/main/LICENSE
 * @date 2026-01-03 19:28:28
 * @version 1.2.0
 * @note This file was generated automatically.
 * The global extractor comes with an auto-updating feature, so you can always get the latest version. https://github.com/JMcrafter26/sora-global-extractor#-auto-updater
 */
function globalExtractor(providers) {
  for (const [url2, provider2] of Object.entries(providers)) {
    try {
      const streamUrl = extractStreamUrlByProvider(url2, provider2);
      if (streamUrl && typeof streamUrl === "object" && !Array.isArray(streamUrl) && streamUrl.streamUrl) {
        return streamUrl.streamUrl;
      }
      if (streamUrl && typeof streamUrl === "string" && streamUrl.startsWith("http")) {
        return streamUrl;
      } else if (Array.isArray(streamUrl)) {
        const httpStream = streamUrl.find((url3) => url3.startsWith("http"));
        if (httpStream) {
          return httpStream;
        }
      } else if (streamUrl || typeof streamUrl !== "string") {
        return null;
      }
    } catch (error) {
    }
  }
  return null;
}
function multiExtractor(providers) {
  return __async(this, null, function* () {
    const streams = [];
    const providersCount = {};
    for (let [url2, provider2] of Object.entries(providers)) {
      try {
        if (provider2.startsWith("direct-")) {
          const directName = provider2.slice(7);
          const title3 = directName && directName.length > 0 ? directName : "Direct";
          streams.push({
            title: title3,
            streamUrl: url2
          });
          continue;
        }
        if (provider2.startsWith("direct")) {
          provider2 = provider2.slice(7);
          const title3 = provider2 && provider2.length > 0 ? provider2 : "Direct";
          streams.push({
            title: title3,
            streamUrl: url2
          });
          continue;
        }
        let customName = null;
        if (provider2.includes("-")) {
          const parts = provider2.split("-");
          provider2 = parts[0];
          customName = parts.slice(1).join("-");
        }
        if (providersCount[provider2] && providersCount[provider2] >= 3) {
          console.log(`Skipping ${provider2} as it has already 3 streams`);
          continue;
        }
        let result = yield extractStreamUrlByProvider(url2, provider2);
        let streamUrl = null;
        let headers2 = null;
        if (result && typeof result === "object" && !Array.isArray(result) && result.streamUrl) {
          streamUrl = result.streamUrl;
          headers2 = result.headers || null;
        } else if (result && Array.isArray(result)) {
          const httpStream = result.find((url3) => url3.startsWith("http"));
          if (httpStream) {
            streamUrl = httpStream;
          }
        } else if (result && typeof result === "string") {
          streamUrl = result;
        }
        if (!streamUrl || typeof streamUrl !== "string" || !streamUrl.startsWith("http")) {
          continue;
        }
        if (customName && customName.length > 0) {
          provider2 = customName;
        }
        let title2;
        if (providersCount[provider2]) {
          providersCount[provider2]++;
          title2 = provider2.charAt(0).toUpperCase() + provider2.slice(1) + "-" + (providersCount[provider2] - 1);
        } else {
          providersCount[provider2] = 1;
          title2 = provider2.charAt(0).toUpperCase() + provider2.slice(1);
        }
        const streamObject = {
          title: title2,
          streamUrl
        };
        if (headers2 && typeof headers2 === "object" && Object.keys(headers2).length > 0) {
          streamObject.headers = headers2;
        }
        streams.push(streamObject);
      } catch (error) {
      }
    }
    return streams;
  });
}
function extractStreamUrlByProvider(url, provider) {
  return __async(this, null, function* () {
    if (eval(`typeof ${provider}Extractor`) !== "function") {
      console.log(
        `Extractor for provider ${provider} is not defined, skipping...`
      );
      return null;
    }
    let uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36"
    ];
    let headers = {
      "User-Agent": uas[(url.length + provider.length) % uas.length],
      // use a different user agent based on the url and provider
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": url,
      "Connection": "keep-alive",
      "x-Requested-With": "XMLHttpRequest"
    };
    switch (provider) {
      case "bigwarp":
        delete headers["User-Agent"];
        break;
      case "vk":
      case "sibnet":
        headers["encoding"] = "windows-1251";
        break;
      case "supervideo":
      case "savefiles":
        headers = {
          "Accept": "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": "EchoapiRuntime/1.1.0",
          "Connection": "keep-alive",
          "Cache-Control": "no-cache",
          "Host": url.match(/https?:\/\/([^\/]+)/)[1]
        };
        break;
      case "streamtape":
        headers = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        };
        break;
    }
    console.log("Fetching URL: " + url);
    const response = yield soraFetch(url, {
      headers
    });
    console.log("Response: " + response.status);
    let html = response.text ? yield response.text() : response;
    const title = html.match(/<title>(.*?)<\/title>/);
    if (title && title[1].toLowerCase().includes("redirect")) {
      const matches = [
        /<meta http-equiv="refresh" content="0;url=(.*?)"/,
        /window\.location\.href\s*=\s*["'](.*?)["']/,
        /window\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
        /window\.location\s*=\s*["'](.*?)["']/,
        /window\.location\.assign\s*\(\s*["'](.*?)["']\s*\)/,
        /top\.location\s*=\s*["'](.*?)["']/,
        /top\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/
      ];
      for (const match of matches) {
        const redirectUrl = html.match(match);
        if (redirectUrl && redirectUrl[1] && typeof redirectUrl[1] === "string" && redirectUrl[1].startsWith("http")) {
          console.log("Redirect URL found: " + redirectUrl[1]);
          url = redirectUrl[1];
          headers["Referer"] = url;
          headers["Host"] = url.match(/https?:\/\/([^\/]+)/)[1];
          html = yield soraFetch(url, {
            headers
          }).then((res) => res.text());
          break;
        }
      }
    }
    switch (provider) {
      case "bigwarp":
        try {
          return yield bigwarpExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from bigwarp:", error);
          return null;
        }
      case "doodstream":
        try {
          return yield doodstreamExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from doodstream:", error);
          return null;
        }
      case "earnvids":
        try {
          return yield earnvidsExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from earnvids:", error);
          return null;
        }
      case "filemoon":
        try {
          return yield filemoonExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from filemoon:", error);
          return null;
        }
      case "lulustream":
        try {
          return yield lulustreamExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from lulustream:", error);
          return null;
        }
      case "megacloud":
        try {
          return yield megacloudExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from megacloud:", error);
          return null;
        }
      case "mp4upload":
        try {
          return yield mp4uploadExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from mp4upload:", error);
          return null;
        }
      case "oneupload":
        try {
          return yield oneuploadExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from oneupload:", error);
          return null;
        }
      case "packer":
        try {
          return yield packerExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from packer:", error);
          return null;
        }
      case "sendvid":
        try {
          return yield sendvidExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from sendvid:", error);
          return null;
        }
      case "sibnet":
        try {
          return yield sibnetExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from sibnet:", error);
          return null;
        }
      case "smoothpre":
        try {
          return yield smoothpreExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from smoothpre:", error);
          return null;
        }
      case "streamtape":
        try {
          return yield streamtapeExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from streamtape:", error);
          return null;
        }
      case "streamup":
        try {
          return yield streamupExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from streamup:", error);
          return null;
        }
      case "uploadcx":
        try {
          return yield uploadcxExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from uploadcx:", error);
          return null;
        }
      case "uqload":
        try {
          return yield uqloadExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from uqload:", error);
          return null;
        }
      case "videospk":
        try {
          return yield videospkExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from videospk:", error);
          return null;
        }
      case "vidmoly":
        try {
          return yield vidmolyExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from vidmoly:", error);
          return null;
        }
      case "vidoza":
        try {
          return yield vidozaExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from vidoza:", error);
          return null;
        }
      case "voe":
        try {
          return yield voeExtractor(html, url);
        } catch (error) {
          console.log("Error extracting stream URL from voe:", error);
          return null;
        }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  });
}
function bigwarpExtractor(videoPage, url2 = null) {
  return __async(this, null, function* () {
    const scriptRegex = /sources:\s*\[\{file:"([^"]+)"/;
    const scriptMatch = scriptRegex.exec(videoPage);
    const bwDecoded = scriptMatch ? scriptMatch[1] : false;
    console.log("BigWarp HD Decoded:", bwDecoded);
    return bwDecoded;
  });
}
function doodstreamExtractor(html2, url2 = null) {
  return __async(this, null, function* () {
    console.log("DoodStream extractor called");
    console.log("DoodStream extractor URL: " + url2);
    const streamDomain = url2.match(/https:\/\/(.*?)\//, url2)[0].slice(8, -1);
    const md5Path = html2.match(/'\/pass_md5\/(.*?)',/, url2)[0].slice(11, -2);
    const token = md5Path.substring(md5Path.lastIndexOf("/") + 1);
    const expiryTimestamp = (/* @__PURE__ */ new Date()).valueOf();
    const random = randomStr(10);
    const passResponse = yield fetch(`https://${streamDomain}/pass_md5/${md5Path}`, {
      headers: {
        "Referer": url2
      }
    });
    console.log("DoodStream extractor response: " + passResponse.status);
    const responseData = yield passResponse.text();
    const videoUrl = `${responseData}${random}?token=${token}&expiry=${expiryTimestamp}`;
    console.log("DoodStream extractor video URL: " + videoUrl);
    return videoUrl;
  });
}
function randomStr(length) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
function earnvidsExtractor(html2, url2 = null) {
  return __async(this, null, function* () {
    try {
      const obfuscatedScript = html2.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
      const unpackedScript = unpack(obfuscatedScript[1]);
      const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
      const hlsLink = streamMatch ? streamMatch[1] : null;
      const baseUrl = url2.match(/^(https?:\/\/[^/]+)/)[1];
      console.log("HLS Link:" + baseUrl + hlsLink);
      return baseUrl + hlsLink;
    } catch (err) {
      console.log(err);
      return "https://files.catbox.moe/avolvc.mp4";
    }
  });
}
function filemoonExtractor(html2, url2 = null) {
  return __async(this, null, function* () {
    const regex = /<iframe[^>]+src="([^"]+)"[^>]*><\/iframe>/;
    const match = html2.match(regex);
    if (match) {
      console.log("Iframe URL: " + match[1]);
      const iframeUrl = match[1];
      const iframeResponse = yield soraFetch(iframeUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Referer": url2
        }
      });
      console.log("Iframe Response: " + iframeResponse.status);
      html2 = yield iframeResponse.text();
    }
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const scripts = [];
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(html2)) !== null) {
      scripts.push(scriptMatch[1]);
    }
    const evalRegex = /eval\((.*?)\)/;
    const m3u8Regex = /m3u8/;
    const evalScript = scripts.find((script) => evalRegex.test(script) && m3u8Regex.test(script));
    if (!evalScript) {
      console.log("No eval script found");
      return null;
    }
    const unpackedScript = unpack(evalScript);
    const m3u8Regex2 = /https?:\/\/[^\s]+master\.m3u8[^\s]*?(\?[^"]*)?/;
    const m3u8Match = unpackedScript.match(m3u8Regex2);
    if (m3u8Match) {
      return m3u8Match[0];
    } else {
      console.log("No M3U8 URL found");
      return null;
    }
  });
}
function lulustreamExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    const scriptRegex = /sources:\s*\[\{file:"([^"]+)"/;
    const scriptMatch = scriptRegex.exec(data);
    const decoded = scriptMatch ? scriptMatch[1] : false;
    return decoded;
  });
}
function megacloudExtractor(html2, embedUrl) {
  return __async(this, null, function* () {
    const testcase = "/api/static";
    if (embedUrl.slice(-testcase.length) == testcase) {
      try {
        const response2 = yield soraFetch(embedUrl, { method: "GET", headers: { "referer": "https://megacloud.blog/" } });
        embedUrl = response2.url;
      } catch (error) {
        throw new Error("[TESTING ONLY] Megacloud extraction error:", error);
      }
    }
    const CHARSET = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32));
    const xraxParams = embedUrl.split("/").pop();
    const xrax = xraxParams.includes("?") ? xraxParams.split("?")[0] : xraxParams;
    const nonce = yield getNonce(embedUrl);
    try {
      const response2 = yield soraFetch(`https://megacloud.blog/embed-2/v3/e-1/getSources?id=${xrax}&_k=${nonce}`, { method: "GET", headers: { "referer": "https://megacloud.blog/" } });
      const rawSourceData = yield response2.json();
      const encrypted = rawSourceData == null ? void 0 : rawSourceData.sources;
      let decryptedSources = null;
      if ((rawSourceData == null ? void 0 : rawSourceData.encrypted) == false) {
        decryptedSources = rawSourceData.sources;
      }
      if (decryptedSources == null) {
        decryptedSources = yield getDecryptedSourceV3(encrypted, nonce);
        if (!decryptedSources)
          throw new Error("Failed to decrypt source");
      }
      if (Array.isArray(decryptedSources) && decryptedSources.length > 0) {
        try {
          return decryptedSources[0].file;
        } catch (error) {
          console.log("Error extracting MegaCloud stream URL:" + error);
          return false;
        }
      }
    } catch (error) {
      console.error(`[ERROR][decryptSources] Error decrypting ${embedUrl}:`, error);
      return {
        status: false,
        error: (error == null ? void 0 : error.message) || "Failed to get HLS link"
      };
    }
    function computeKey(secret, nonce2) {
      const secretAndNonce = secret + nonce2;
      let hashValue = 0;
      for (const char of secretAndNonce) {
        const code = char.charCodeAt(0);
        hashValue = code + hashValue * 158 >>> 0;
      }
      const maximum32BitSignedIntegerValue = 2147483647;
      const hashValueModuloMax = hashValue % maximum32BitSignedIntegerValue;
      const xorMask = 247;
      const xorProcessedString = [...secretAndNonce].map((char) => String.fromCharCode(char.charCodeAt(0) ^ xorMask)).join("");
      const xorLen = xorProcessedString.length;
      const shiftAmount = hashValueModuloMax % xorLen + 5;
      const rotatedString = xorProcessedString.slice(shiftAmount) + xorProcessedString.slice(0, shiftAmount);
      const reversedNonceString = nonce2.split("").reverse().join("");
      let interleavedString = "";
      const maxLen = Math.max(rotatedString.length, reversedNonceString.length);
      for (let i = 0; i < maxLen; i++) {
        interleavedString += (rotatedString[i] || "") + (reversedNonceString[i] || "");
      }
      const length = 96 + hashValueModuloMax % 33;
      const partialString = interleavedString.substring(0, length);
      return [...partialString].map((ch) => String.fromCharCode(ch.charCodeAt(0) % 95 + 32)).join("");
    }
    function columnarCipher(text, key) {
      const columns = key.length;
      const rows = Math.ceil(text.length / columns);
      const grid = Array.from({ length: rows }, () => Array(columns).fill(""));
      const columnOrder = [...key].map((char, idx) => ({ char, idx })).sort((a, b) => a.char.charCodeAt(0) - b.char.charCodeAt(0));
      let i = 0;
      for (const { idx } of columnOrder) {
        for (let row = 0; row < rows; row++) {
          grid[row][idx] = text[i++] || "";
        }
      }
      return grid.flat().join("");
    }
    function deterministicUnshuffle(characters, keyPhrase) {
      let seed = 0;
      for (const char of keyPhrase) {
        seed = seed * 31 + char.charCodeAt(0) >>> 0;
      }
      const randomNumberGenerator = (upperLimit) => {
        seed = seed * 1103515245 + 12345 >>> 0;
        return seed % upperLimit;
      };
      const shuffledCharacters = characters.slice();
      for (let i = shuffledCharacters.length - 1; i > 0; i--) {
        const j = randomNumberGenerator(i + 1);
        [shuffledCharacters[i], shuffledCharacters[j]] = [shuffledCharacters[j], shuffledCharacters[i]];
      }
      return shuffledCharacters;
    }
    function decrypt(secretKey, nonce2, encryptedText, rounds = 3) {
      let decryptedText = Buffer.from(encryptedText, "base64").toString("utf-8");
      const keyPhrase = computeKey(secretKey, nonce2);
      for (let round = rounds; round >= 1; round--) {
        const encryptionPassphrase = keyPhrase + round;
        let seed = 0;
        for (const char of encryptionPassphrase) {
          seed = seed * 31 + char.charCodeAt(0) >>> 0;
        }
        const randomNumberGenerator = (upperLimit) => {
          seed = seed * 1103515245 + 12345 >>> 0;
          return seed % upperLimit;
        };
        decryptedText = [...decryptedText].map((char) => {
          const charIndex = CHARSET.indexOf(char);
          if (charIndex === -1)
            return char;
          const offset = randomNumberGenerator(95);
          return CHARSET[(charIndex - offset + 95) % 95];
        }).join("");
        decryptedText = columnarCipher(decryptedText, encryptionPassphrase);
        const shuffledCharset = deterministicUnshuffle(CHARSET, encryptionPassphrase);
        const mappingArr = {};
        shuffledCharset.forEach((c, i) => mappingArr[c] = CHARSET[i]);
        decryptedText = [...decryptedText].map((char) => mappingArr[char] || char).join("");
      }
      const lengthString = decryptedText.slice(0, 4);
      let length = parseInt(lengthString, 10);
      if (isNaN(length) || length <= 0 || length > decryptedText.length - 4) {
        console.error("Invalid length in decrypted string");
        return decryptedText;
      }
      const decryptedString = decryptedText.slice(4, 4 + length);
      try {
        return JSON.parse(decryptedString);
      } catch (e) {
        console.warn("Could not parse decrypted string, unlikely to be valid. Using regex to verify");
        const regex = /"file":"(.*?)".*?"type":"(.*?)"/;
        const match = encryptedText.match(regex);
        const matchedFile = match == null ? void 0 : match[1];
        const matchType = match == null ? void 0 : match[2];
        if (!matchedFile || !matchType) {
          console.error("Could not match file or type in decrypted string");
          return null;
        }
        return decryptedString;
      }
    }
    function getNonce(embedUrl2) {
      return __async(this, null, function* () {
        const res = yield soraFetch(embedUrl2, { headers: { "referer": "https://anicrush.to/", "x-requested-with": "XMLHttpRequest" } });
        const html3 = yield res.text();
        const match0 = html3.match(/\<meta[\s\S]*?name="_gg_fb"[\s\S]*?content="([\s\S]*?)">/);
        if (match0 == null ? void 0 : match0[1]) {
          return match0[1];
        }
        const match1 = html3.match(/_is_th:(\S*?)\s/);
        if (match1 == null ? void 0 : match1[1]) {
          return match1[1];
        }
        const match2 = html3.match(/data-dpi="([\s\S]*?)"/);
        if (match2 == null ? void 0 : match2[1]) {
          return match2[1];
        }
        const match3 = html3.match(/_lk_db[\s]?=[\s\S]*?x:[\s]"([\S]*?)"[\s\S]*?y:[\s]"([\S]*?)"[\s\S]*?z:[\s]"([\S]*?)"/);
        if ((match3 == null ? void 0 : match3[1]) && (match3 == null ? void 0 : match3[2]) && (match3 == null ? void 0 : match3[3])) {
          return "" + match3[1] + match3[2] + match3[3];
        }
        const match4 = html3.match(/nonce="([\s\S]*?)"/);
        if (match4 == null ? void 0 : match4[1]) {
          if (match4[1].length >= 32)
            return match4[1];
        }
        const match5 = html3.match(/_xy_ws = "(\S*?)"/);
        if (match5 == null ? void 0 : match5[1]) {
          return match5[1];
        }
        const match6 = html3.match(/[a-zA-Z0-9]{48}]/);
        if (match6 == null ? void 0 : match6[1]) {
          return match6[1];
        }
        return null;
      });
    }
    function getDecryptedSourceV3(encrypted, nonce2) {
      return __async(this, null, function* () {
        var _a;
        let decrypted = null;
        const keys = yield asyncGetKeys();
        for (let key in keys) {
          try {
            if (!encrypted) {
              console.log("Encrypted source missing in response");
              return null;
            }
            decrypted = decrypt(keys[key], nonce2, encrypted);
            if (!Array.isArray(decrypted) || decrypted.length <= 0) {
              continue;
            }
            for (let source of decrypted) {
              if (source != null && ((_a = source == null ? void 0 : source.file) == null ? void 0 : _a.startsWith("https://"))) {
                continue;
              }
            }
            console.log("Functioning key:", key);
            return decrypted;
          } catch (error) {
            console.error("Error:", error);
            console.error(`[${(/* @__PURE__ */ new Date()).toLocaleString()}] Key did not work: ${key}`);
            continue;
          }
        }
        return null;
      });
    }
    function asyncGetKeys() {
      return __async(this, null, function* () {
        const resolution = yield Promise.allSettled([
          fetchKey("ofchaos", "https://ac-api.ofchaos.com/api/key"),
          fetchKey("yogesh", "https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json"),
          fetchKey("esteven", "https://raw.githubusercontent.com/carlosesteven/e1-player-deobf/refs/heads/main/output/key.json")
        ]);
        const keys = resolution.filter((r) => r.status === "fulfilled" && r.value != null).reduce((obj, r) => {
          var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
          let rKey = Object.keys(r.value)[0];
          let rValue = Object.values(r.value)[0];
          if (typeof rValue === "string") {
            obj[rKey] = rValue.trim();
            return obj;
          }
          obj[rKey] = (_k = (_j = (_g = (_f = (_d = (_a = rValue == null ? void 0 : rValue.mega) != null ? _a : rValue == null ? void 0 : rValue.decryptKey) != null ? _d : (_c = (_b = rValue == null ? void 0 : rValue.MegaCloud) == null ? void 0 : _b.Anime) == null ? void 0 : _c.Key) != null ? _f : (_e = rValue == null ? void 0 : rValue.megacloud) == null ? void 0 : _e.key) != null ? _g : rValue == null ? void 0 : rValue.key) != null ? _j : (_i = (_h = rValue == null ? void 0 : rValue.megacloud) == null ? void 0 : _h.anime) == null ? void 0 : _i.key) != null ? _k : rValue == null ? void 0 : rValue.megacloud;
          return obj;
        }, {});
        if (keys.length === 0) {
          throw new Error("Failed to fetch any decryption key");
        }
        return keys;
      });
    }
    function fetchKey(name, url2) {
      return new Promise((resolve) => __async(this, null, function* () {
        try {
          const response2 = yield soraFetch(url2, { method: "get" });
          const key = yield response2.text();
          let trueKey = null;
          try {
            trueKey = JSON.parse(key);
          } catch (e) {
            trueKey = key;
          }
          resolve({ [name]: trueKey });
        } catch (error) {
          resolve(null);
        }
      }));
    }
  });
}
function mp4uploadExtractor(html2, url2 = null) {
  return __async(this, null, function* () {
    const regex = /src:\s*"([^"]+)"/;
    const match = html2.match(regex);
    if (match) {
      return match[1];
    } else {
      console.log("No match found for mp4upload extractor");
      return null;
    }
  });
}
function oneuploadExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    const match = data.match(/sources:\s*\[\{file:"([^"]+)"\}\]/);
    const fileUrl = match ? match[1] : null;
    return fileUrl;
  });
}
function packerExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    const unpackedScript = unpack(obfuscatedScript[1]);
    const m3u8Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
    const m3u8Url = m3u8Match[1];
    return m3u8Url;
  });
}
function sendvidExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    const match = data.match(/var\s+video_source\s*=\s*"([^"]+)"/);
    const videoUrl = match ? match[1] : null;
    return videoUrl;
  });
}
function sibnetExtractor(html2, embedUrl) {
  return __async(this, null, function* () {
    try {
      const videoMatch = html2.match(
        /player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i
      );
      if (!videoMatch || !videoMatch[1]) {
        throw new Error("Sibnet video source not found");
      }
      const videoPath = videoMatch[1];
      const videoUrl = videoPath.startsWith("http") ? videoPath : `https://video.sibnet.ru${videoPath}`;
      return videoUrl;
    } catch (error) {
      console.log("SibNet extractor error: " + error.message);
      return null;
    }
  });
}
function smoothpreExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    console.log("Using SmoothPre Extractor");
    console.log("Data Length: " + data.length);
    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    if (!obfuscatedScript || !obfuscatedScript[1]) {
      console.log("No obfuscated script found");
      return null;
    }
    const unpackedScript = unpack(obfuscatedScript[1]);
    const hls2Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
    const hls2Url = hls2Match ? hls2Match[1] : null;
    return hls2Url;
  });
}
function streamtapeExtractor(html2, url2) {
  return __async(this, null, function* () {
    let promises = [];
    const LINK_REGEX = /link['"]{1}\).innerHTML *= *['"]{1}([\s\S]*?)["'][\s\S]*?\(["']([\s\S]*?)["']([\s\S]*?);/g;
    const CHANGES_REGEX = /([0-9]+)/g;
    if (html2 == null) {
      if (url2 == null) {
        throw new Error("Provided incorrect parameters.");
      }
      const response2 = yield soraFetch(url2);
      html2 = yield response2.text();
    }
    const matches = html2.matchAll(LINK_REGEX);
    for (const match of matches) {
      let base = match == null ? void 0 : match[1];
      let params = match == null ? void 0 : match[2];
      const changeStr = match == null ? void 0 : match[3];
      if (changeStr == null || changeStr == "")
        continue;
      const changes = changeStr.match(CHANGES_REGEX);
      for (let n of changes) {
        params = params.substring(n);
      }
      while (base[0] == "/") {
        base = base.substring(1);
      }
      const url3 = "https://" + base + params;
      promises.push(testUrl(url3));
    }
    return Promise.any(promises).then((value) => {
      return value;
    }).catch((error) => {
      return null;
    });
    function testUrl(url3) {
      return __async(this, null, function* () {
        return new Promise((resolve, reject) => __async(this, null, function* () {
          try {
            var response2 = yield soraFetch(url3);
            if (response2 == null)
              throw new Error("Connection timed out.");
          } catch (e) {
            console.error("Rejected due to:", e.message);
            return reject(null);
          }
          if ((response2 == null ? void 0 : response2.ok) && (response2 == null ? void 0 : response2.status) === 200) {
            return resolve(url3);
          }
          console.warn("Reject because of response:", response2 == null ? void 0 : response2.ok, response2 == null ? void 0 : response2.status);
          return reject(null);
        }));
      });
    }
  });
}
function streamupExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    if (url2.endsWith("/")) {
      url2 = url2.slice(0, -1);
    }
    const urlParts = url2.split("/");
    const videoId = urlParts[urlParts.length - 1];
    const apiUrl = `https://strmup.to/ajax/stream?filecode=${videoId}`;
    const response2 = yield soraFetch(apiUrl);
    const jsonData = yield response2.json();
    if (jsonData && jsonData.streaming_url) {
      return jsonData.streaming_url;
    } else {
      console.log("No streaming URL found in the response.");
      return null;
    }
  });
}
function uploadcxExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    const mp4Match = /sources:\s*\["([^"]+\.mp4)"]/i.exec(data);
    return mp4Match ? mp4Match[1] : null;
  });
}
function uqloadExtractor(html2, embedUrl) {
  return __async(this, null, function* () {
    try {
      const match = html2.match(/sources:\s*\[\s*"([^"]+\.mp4)"\s*\]/);
      const videoSrc = match ? match[1] : "";
      return videoSrc;
    } catch (error) {
      console.log("uqloadExtractor error:", error.message);
      return null;
    }
  });
}
function videospkExtractor(data, url2 = null) {
  return __async(this, null, function* () {
    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    const unpackedScript = unpack(obfuscatedScript[1]);
    const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
    const hlsLink = streamMatch ? streamMatch[1] : null;
    return "https://videospk.xyz" + hlsLink;
  });
}
function vidmolyExtractor(html2, url2 = null) {
  return __async(this, null, function* () {
    const regexSub = /<option value="([^"]+)"[^>]*>\s*SUB - Omega\s*<\/option>/;
    const regexFallback = /<option value="([^"]+)"[^>]*>\s*Omega\s*<\/option>/;
    const fallback = /<option value="([^"]+)"[^>]*>\s*SUB v2 - Omega\s*<\/option>/;
    let match = html2.match(regexSub) || html2.match(regexFallback) || html2.match(fallback);
    if (match) {
      const decodedHtml = atob(match[1]);
      const iframeMatch = decodedHtml.match(/<iframe\s+src="([^"]+)"/);
      if (!iframeMatch) {
        console.log("Vidmoly extractor: No iframe match found");
        return null;
      }
      const streamUrl = iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1];
      const responseTwo = yield soraFetch(streamUrl);
      const htmlTwo = yield responseTwo.text();
      const m3u8Match = htmlTwo.match(/sources:\s*\[\{file:"([^"]+\.m3u8)"/);
      return m3u8Match ? m3u8Match[1] : null;
    } else {
      console.log("Vidmoly extractor: No match found, using fallback");
      const sourcesRegex = /sources:\s*\[\{file:"(https?:\/\/[^"]+)"\}/;
      const sourcesMatch = html2.match(sourcesRegex);
      let sourcesString = sourcesMatch ? sourcesMatch[1].replace(/'/g, '"') : null;
      return sourcesString;
    }
  });
}
function vidozaExtractor(html2, url2 = null) {
  return __async(this, null, function* () {
    const regex = /<source src="([^"]+)" type='video\/mp4'>/;
    const match = html2.match(regex);
    if (match) {
      return match[1];
    } else {
      console.log("No match found for vidoza extractor");
      return null;
    }
  });
}
function voeExtractor(html2, url2 = null) {
  const jsonScriptMatch = html2.match(
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!jsonScriptMatch) {
    console.log("No application/json script tag found");
    return null;
  }
  const obfuscatedJson = jsonScriptMatch[1].trim();
  let data;
  try {
    data = JSON.parse(obfuscatedJson);
  } catch (e) {
    throw new Error("Invalid JSON input.");
  }
  if (!Array.isArray(data) || typeof data[0] !== "string") {
    throw new Error("Input doesn't match expected format.");
  }
  let obfuscatedString = data[0];
  let step1 = voeRot13(obfuscatedString);
  let step2 = voeRemovePatterns(step1);
  let step3 = voeBase64Decode(step2);
  let step4 = voeShiftChars(step3, 3);
  let step5 = step4.split("").reverse().join("");
  let step6 = voeBase64Decode(step5);
  let result;
  try {
    result = JSON.parse(step6);
  } catch (e) {
    throw new Error("Final JSON parse error: " + e.message);
  }
  if (result && typeof result === "object") {
    const streamUrl = result.direct_access_url || result.source.map((source) => source.direct_access_url).find((url3) => url3 && url3.startsWith("http"));
    if (streamUrl) {
      console.log("Voe Stream URL: " + streamUrl);
      return streamUrl;
    } else {
      console.log("No stream URL found in the decoded JSON");
    }
  }
  return result;
}
function voeRot13(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode(
      (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
    );
  });
}
function voeRemovePatterns(str) {
  const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
  let result = str;
  for (const pat of patterns) {
    result = result.split(pat).join("");
  }
  return result;
}
function voeBase64Decode(str) {
  if (typeof atob === "function") {
    return atob(str);
  }
  return Buffer.from(str, "base64").toString("utf-8");
}
function voeShiftChars(str, shift) {
  return str.split("").map((c) => String.fromCharCode(c.charCodeAt(0) - shift)).join("");
}
function soraFetch(_0) {
  return __async(this, arguments, function* (url2, options = { headers: {}, method: "GET", body: null }) {
    var _a, _b, _c;
    try {
      return yield fetchv2(
        url2,
        (_a = options.headers) != null ? _a : {},
        (_b = options.method) != null ? _b : "GET",
        (_c = options.body) != null ? _c : null
      );
    } catch (e) {
      try {
        return yield fetch(url2, options);
      } catch (error) {
        yield console.log("soraFetch error: " + error.message);
        return null;
      }
    }
  });
}
class Unbaser {
  constructor(base) {
    this.ALPHABET = {
      62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'"
    };
    this.dictionary = {};
    this.base = base;
    if (36 < base && base < 62) {
      this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substr(0, base);
    }
    if (2 <= base && base <= 36) {
      this.unbase = (value) => parseInt(value, base);
    } else {
      try {
        [...this.ALPHABET[base]].forEach((cipher, index) => {
          this.dictionary[cipher] = index;
        });
      } catch (er) {
        throw Error("Unsupported base encoding.");
      }
      this.unbase = this._dictunbaser;
    }
  }
  _dictunbaser(value) {
    let ret = 0;
    [...value].reverse().forEach((cipher, index) => {
      ret = ret + Math.pow(this.base, index) * this.dictionary[cipher];
    });
    return ret;
  }
}
function detectUnbaser(source) {
  return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}
function unpack(source) {
  let { payload, symtab, radix, count } = _filterargs(source);
  if (count != symtab.length) {
    throw Error("Malformed p.a.c.k.e.r. symtab.");
  }
  let unbase;
  try {
    unbase = new Unbaser(radix);
  } catch (e) {
    throw Error("Unknown p.a.c.k.e.r. encoding.");
  }
  function lookup(match) {
    const word = match;
    let word2;
    if (radix == 1) {
      word2 = symtab[parseInt(word)];
    } else {
      word2 = symtab[unbase.unbase(word)];
    }
    return word2 || word;
  }
  source = payload.replace(/\b\w+\b/g, lookup);
  return _replacestrings(source);
  function _filterargs(source2) {
    const juicers = [
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/
    ];
    for (const juicer of juicers) {
      const args = juicer.exec(source2);
      if (args) {
        let a = args;
        if (a[2] == "[]") {
        }
        try {
          return {
            payload: a[1],
            symtab: a[4].split("|"),
            radix: parseInt(a[2]),
            count: parseInt(a[3])
          };
        } catch (ValueError) {
          throw Error("Corrupted p.a.c.k.e.r. data.");
        }
      }
    }
    throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
  }
  function _replacestrings(source2) {
    return source2;
  }
}
export { getStreams };
