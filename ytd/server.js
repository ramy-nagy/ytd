// Professional YouTube Stream API with enhanced anti-blocking measures
const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const helmet = require("helmet");
const { CookieJar } = require("tough-cookie");
const { HttpCookieAgent } = require("http-cookie-agent/http");
const { HttpsCookieAgent } = require("http-cookie-agent/http");
const HttpsProxyAgent = require("https-proxy-agent");
const fs = require("fs").promises;
const path = require("path");

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests per window
        standardHeaders: true,
    })
);

// Initialize cache with longer TTL (4 hours)
const cache = new NodeCache({ stdTTL: 14400, maxKeys: 1000 });

// Cookie storage directory
const COOKIE_DIR = path.join(__dirname, "cookies");
const ensureCookieDir = async () => {
    try {
        await fs.mkdir(COOKIE_DIR, { recursive: true });
    } catch (err) {
        console.error("Error creating cookie directory:", err);
    }
};
ensureCookieDir();

// User agent rotation - expanded list with more recent browsers
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/121.0.0.0",
];

// Proxy configuration - add your proxies here if available
const PROXIES = [
    // Example: "http://username:password@proxyhost:port"
    // Leave empty if no proxies available
];

// Error tracking
const errorLog = [];
const ERROR_LOG_MAX = 50;

// Utility functions
const getRandomUserAgent = () =>
    USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const getRandomProxy = () => {
    if (PROXIES.length === 0) return null;
    return PROXIES[Math.floor(Math.random() * PROXIES.length)];
};

const extractVideoId = (url) => {
    if (!url) return "";
    if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;

    try {
        if (url.includes("youtube.com/watch")) {
            const params = new URLSearchParams(new URL(url).search);
            return params.get("v") || "";
        } else if (url.includes("youtu.be/")) {
            return url.split("youtu.be/")[1].split("?")[0];
        }
    } catch (e) {}

    return "";
};

const logError = (error, context) => {
    const entry = {
        timestamp: new Date().toISOString(),
        message: error.message,
        context,
        status: error.response?.status,
    };

    errorLog.unshift(entry);
    if (errorLog.length > ERROR_LOG_MAX) errorLog.pop();
    console.error(`Error: ${entry.message}`, context);
};

// Cookie management
const getCookieJar = async (videoId) => {
    const cookieFile = path.join(COOKIE_DIR, `${videoId}.json`);
    let jar = new CookieJar();

    try {
        const data = await fs.readFile(cookieFile, "utf8");
        jar = CookieJar.fromJSON(data);
    } catch (err) {
        // New cookie jar if file doesn't exist
    }

    return jar;
};

const saveCookieJar = async (videoId, jar) => {
    try {
        const cookieFile = path.join(COOKIE_DIR, `${videoId}.json`);
        await fs.writeFile(cookieFile, JSON.stringify(jar.toJSON()), "utf8");
    } catch (err) {
        console.error("Error saving cookie jar:", err);
    }
};

// Create axios instance with cookie support
const createAxiosInstance = async (videoId) => {
    const jar = await getCookieJar(videoId);
    const proxy = getRandomProxy();

    const config = {
        jar,
        cookies: { jar },
    };

    // Add proxy if available
    if (proxy) {
        config.httpAgent = new HttpCookieAgent({
            cookies: { jar },
            keepAlive: true,
            proxy: new URL(proxy),
        });
        config.httpsAgent = new HttpsCookieAgent({
            cookies: { jar },
            keepAlive: true,
            proxy: new URL(proxy),
        });
    } else {
        config.httpAgent = new HttpCookieAgent({
            cookies: { jar },
            keepAlive: true,
        });
        config.httpsAgent = new HttpsCookieAgent({
            cookies: { jar },
            keepAlive: true,
        });
    }

    return {
        axiosInstance: axios.create({
            httpAgent: config.httpAgent,
            httpsAgent: config.httpsAgent,
        }),
        jar,
    };
};

// Browser-like headers
const getBrowserHeaders = (videoId, userAgent) => ({
  "User-Agent": userAgent,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Connection: "keep-alive",
  Referer: `https://www.youtube.com/watch?v=${videoId}`,
  "Upgrade-Insecure-Requests": "1"
});

// Initial page visit to get cookies
const initialVisit = async (videoId) => {
    const userAgent = getRandomUserAgent();
    const { axiosInstance, jar } = await createAxiosInstance(videoId);

    try {
        await axiosInstance.get(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                "User-Agent": userAgent,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                DNT: "1",
                Connection: "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                TE: "trailers",
            },
            maxRedirects: 5,
            timeout: 10000,
        });

        await saveCookieJar(videoId, jar);
        return jar;
    } catch (error) {
        logError(error, { action: "initialVisit", videoId });
        return jar;
    }
};

// YouTube API interaction with improved anti-blocking
async function getYouTubeStreamData(videoId, attempt = 0) {
    // First visit the page to get cookies
    const jar = await initialVisit(videoId);
    const userAgent = getRandomUserAgent();

    // Create API URL with randomized client version
    const clientVersionMajor = 2;
    const clientVersionMinor = Math.floor(Math.random() * 10) + 20240500;
    const clientVersion = `${clientVersionMajor}.${clientVersionMinor}.00.00`;

    const apiUrl =
        "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

    const { axiosInstance } = await createAxiosInstance(videoId);

    const headers = getBrowserHeaders(videoId, userAgent);

    // Randomize client parameters
    const payload = {
        context: {
            client: {
                clientName: "WEB",
                clientVersion: clientVersion,
                hl: "en",
                gl: "US",
                utcOffsetMinutes: new Date().getTimezoneOffset(),
                browserName: userAgent.includes("Firefox")
                    ? "Firefox"
                    : "Chrome",
                browserVersion: userAgent.match(/Chrome\/(\d+)/)
                    ? userAgent.match(/Chrome\/(\d+)/)[1]
                    : "115",
                osName: userAgent.includes("Windows")
                    ? "Windows"
                    : userAgent.includes("Macintosh")
                    ? "Macintosh"
                    : "Linux",
                osVersion: userAgent.includes("Windows")
                    ? "10.0"
                    : userAgent.includes("Macintosh")
                    ? "10_15_7"
                    : "",
            },
            user: {
                lockedSafetyMode: false,
            },
            request: {
                useSsl: true,
                internalExperimentFlags: [],
                consistencyTokenJars: [],
            },
        },
        videoId,
        playbackContext: {
            contentPlaybackContext: {
                html5Preference: "HTML5_PREF_WANTS",
            },
        },
        racyCheckOk: true,
        contentCheckOk: true,
    };

    // Add a small delay to mimic human behavior (100-500ms)
    const delay = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
        const response = await axiosInstance.post(apiUrl, payload, {
            headers,
            timeout: 10000,
        });

        // Save updated cookies
        await saveCookieJar(videoId, jar);

        return response.data;
    } catch (error) {
        // Handle rate limiting or temporary errors
        const status = error.response?.status;
        const isRateLimited = status === 429 || status === 403;

        // Exponential backoff retry logic with increased retries and delays
        if (attempt < 3 && (isRateLimited || status >= 500 || !status)) {
            const delay =
                Math.pow(2, attempt + 2) * 1000 + Math.random() * 1000; // 4s, 8s, 16s with jitter
            console.log(`Retrying after ${delay}ms (attempt ${attempt + 1})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return getYouTubeStreamData(videoId, attempt + 1);
        }

        logError(error, { videoId, attempt });
        throw error;
    }
}

function extractBestStreamUrl(data, itag = null) {
    if (!data || !data.streamingData) return null;

    // Gather all formats
    const formats = [
        ...(data.streamingData.formats || []),
        ...(data.streamingData.adaptiveFormats || []),
    ];

    // Return specific format if itag provided
    if (itag) {
        const format = formats.find(
            (f) => f.itag === parseInt(itag) && (f.url || f.signatureCipher)
        );
        if (format) {
            if (format.url) return format.url;
            // Handle signature cipher if needed
            // This is a simplified version - a complete solution would need signature deciphering
            if (format.signatureCipher) {
                const params = new URLSearchParams(format.signatureCipher);
                if (params.get("url")) return params.get("url");
            }
        }
    }

    // Find formats with both audio and video
    const mp4Formats = formats.filter(
        (f) =>
            f.mimeType?.startsWith("video/mp4") &&
            (f.url || f.signatureCipher) &&
            f.audioQuality
    );

    if (mp4Formats.length) {
        // Sort by quality (height)
        const bestFormat = mp4Formats.sort(
            (a, b) => (b.height || 0) - (a.height || 0)
        )[0];
        if (bestFormat.url) return bestFormat.url;

        // Handle signature cipher if needed
        if (bestFormat.signatureCipher) {
            const params = new URLSearchParams(bestFormat.signatureCipher);
            if (params.get("url")) return params.get("url");
        }
    }

    // Fallback to any format with URL
    const anyFormat = formats.find((f) => f.url);
    if (anyFormat) return anyFormat.url;

    return null;
}

// API endpoints
app.get("/stream/:videoUrl", async (req, res) => {
  const videoId = extractVideoId(req.params.videoUrl);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL or ID." });

  if (cache.has(videoId)) {
      return res.json({ cached: true, data: cache.get(videoId) });
  }

  try {
      const { axiosInstance, jar } = await createAxiosInstance(videoId);
      const userAgent = getRandomUserAgent();

      const headers = getBrowserHeaders(videoId, userAgent);

      const response = await axiosInstance.get(`https://www.youtube.com/watch?v=${videoId}`, { headers });

      // Extract stream info (parse HTML, etc.)
      const streamData = extractStreamInfo(response.data); // you'd implement this

      cache.set(videoId, streamData);
      await saveCookieJar(videoId, jar);

      res.json({ cached: false, data: streamData });
  } catch (err) {
      logError(err, `Fetching video ID: ${videoId}`);
      res.status(500).json({ error: "Failed to fetch video." });
  }
});


// Health and monitoring endpoints
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        cacheSize: cache.keys().length,
        errorCount: errorLog.length,
    });
});

app.get("/errors", (req, res) => {
    res.json({
        errors: errorLog.slice(0, 10), // Return most recent 10 errors
        total: errorLog.length,
    });
});

app.get("/", (req, res) => {
    res.json({
        name: "YouTube Stream API",
        version: "1.1.0",
        usage: "/stream?url={youtube_url}&itag={optional_format}&redirect={true|false}",
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`YouTube Stream API running on port ${PORT}`);
});

// Export for testing
module.exports = app;
