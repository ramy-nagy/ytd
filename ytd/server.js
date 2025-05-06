// Professional YouTube Stream API with caching and anti-blocking measures
const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const helmet = require("helmet");

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

// Initialize cache (2 hour TTL)
const cache = new NodeCache({ stdTTL: 7200, maxKeys: 1000 });

// User agent rotation
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
];

// Error tracking
const errorLog = [];
const ERROR_LOG_MAX = 50;

// Utility functions
const getRandomUserAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

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

// YouTube API interaction
async function getYouTubeStreamData(videoId, attempt = 0) {
  const apiUrl =
    "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  const headers = {
    "User-Agent": getRandomUserAgent(),
    "Content-Type": "application/json",
    Origin: "https://www.youtube.com",
    Referer: `https://www.youtube.com/watch?v=${videoId}`,
  };

  const payload = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240503.00.01",
        hl: "en",
        gl: "US",
      },
    },
    videoId,
  };

  try {
    const response = await axios.post(apiUrl, payload, {
      headers,
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    // Handle rate limiting or temporary errors
    const status = error.response?.status;
    const isRateLimited = status === 429 || status === 403;

    // Exponential backoff retry logic
    if (attempt < 2 && (isRateLimited || status >= 500)) {
      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
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
    const format = formats.find((f) => f.itag === parseInt(itag) && f.url);
    if (format) return format.url;
  }

  // Find formats with both audio and video
  const mp4Formats = formats.filter(
    (f) => f.mimeType?.startsWith("video/mp4") && f.url && f.audioQuality
  );

  if (mp4Formats.length) {
    // Sort by quality (height)
    return mp4Formats.sort((a, b) => (b.height || 0) - (a.height || 0))[0].url;
  }

  // Fallback to any format with URL
  return formats.find((f) => f.url)?.url || null;
}

// API endpoints
app.get("/stream", async (req, res) => {
  try {
    const { url, itag, redirect } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing URL parameter" });
    }

    // Extract and validate video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL or video ID" });
    }

    // Create cache key
    const cacheKey = itag ? `${videoId}_${itag}` : videoId;

    // Check cache
    const cachedUrl = cache.get(cacheKey);
    if (cachedUrl) {
      return redirect === "true"
        ? res.redirect(cachedUrl)
        : res.json({ url: cachedUrl });
    }

    // Get data from YouTube
    const data = await getYouTubeStreamData(videoId);

    // Check video availability
    if (data.playabilityStatus?.status !== "OK") {
      const reason = data.playabilityStatus?.reason || "Video unavailable";
      return res.status(403).json({ error: reason });
    }

    // Extract stream URL
    const streamUrl = extractBestStreamUrl(data, itag);

    if (!streamUrl) {
      return res.status(404).json({ error: "No suitable stream URL found" });
    }

    // Store in cache
    cache.set(cacheKey, streamUrl);

    // Return URL or redirect
    return redirect === "true"
      ? res.redirect(streamUrl)
      : res.json({ url: streamUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to extract stream URL" });
  }
});

// Health and monitoring endpoints
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    cacheSize: cache.keys().length,
  });
});

app.get("/", (req, res) => {
  res.json({
    name: "YouTube Stream API",
    version: "1.0.0",
    usage:
      "/stream?url={youtube_url}&itag={optional_format}&redirect={true|false}",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`YouTube Stream API running on port ${PORT}`);
});

// Export for testing
module.exports = app;
