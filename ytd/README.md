# YouTube Stream API

A lightweight API service for extracting direct stream URLs from YouTube videos.

## Overview

This API allows you to obtain direct playable stream URLs from YouTube videos by providing a YouTube video URL or ID. The service handles the extraction process and returns the highest quality stream URL available.

## Authentication

All requests require an API key for authentication. You can pass the API key as:
- A query parameter: `?key=your-api-key`
- A request header: `x-api-key: your-api-key`

## Endpoints

### GET /stream

Extract a direct stream URL from a YouTube video.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | Yes | YouTube video URL or ID |
| itag | integer | No | Specific format ID to request (optional) |
| redirect | boolean | No | If 'true', redirects to the stream URL instead of returning JSON |
| key | string | Yes | Your API key |

**Example Requests:**

```
GET /stream?url=dQw4w9WgXcQ&key=your-api-key
GET /stream?url=https://youtube.com/watch?v=dQw4w9WgXcQ&redirect=true&key=your-api-key
GET /stream?url=https://youtu.be/dQw4w9WgXcQ&itag=18&key=your-api-key
```

**Response:**

```json
{
  "url": "https://rr4---sn-8xgp1vo-p5ql.googlevideo.com/videoplayback?..."
}
```

**Status Codes:**

- `200 OK`: Stream URL successfully extracted
- `400 Bad Request`: Missing or invalid parameters
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Video not available (e.g., private, region-restricted)
- `404 Not Found`: No suitable stream URL found
- `500 Internal Server Error`: Server-side error

### GET /health

Check if the API is operational.

**Response:**

```json
{
  "status": "ok"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Port the server listens on |
| API_KEYS | test-key-123 | Comma-separated list of valid API keys |
| CACHE_TTL | 7200 | Cache duration in seconds (2 hours) |

## Usage Limits

Be respectful of YouTube's terms of service. This API is intended for personal use and educational purposes only. Excessive usage might result in your requests being blocked by YouTube.

## Setup and Deployment

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   node index.js
   ```

3. For production use, set the appropriate environment variables.