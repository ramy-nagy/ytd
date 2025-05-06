#!/usr/bin/env python3
# Production YouTube Stream API
# Optimized for performance and reliability

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import urllib.request
import urllib.parse
import json
import re
import logging
from starlette.responses import RedirectResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger("youtube-stream-api")

# Initialize FastAPI app - minimal for production
app = FastAPI(
    title="YouTube Stream API",
    description="Production API for YouTube stream extraction",
    version="1.0.0",
    docs_url=None,  # Disable docs in production
    redoc_url=None  # Disable redoc in production
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Extract video ID from URL
def extract_video_id(url):
    if "youtube.com/watch" in url:
        query = urllib.parse.urlparse(url).query
        params = dict(urllib.parse.parse_qsl(query))
        return params.get("v", "")
    elif "youtu.be/" in url:
        return url.split("youtu.be/")[1].split("?")[0]
    elif re.match(r'^[A-Za-z0-9_-]{11}$', url):
        return url
    return ""

# Get stream data from YouTube API
def get_stream_data(video_id):
    api_url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Origin': 'https://www.youtube.com',
        'Referer': f'https://www.youtube.com/watch?v={video_id}'
    }
    
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240503.00.01",
                "hl": "en",
                "gl": "US"
            }
        },
        "videoId": video_id
    }
    
    try:
        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
            
    except Exception as e:
        logger.error(f"Error fetching video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve video information")

# Find best stream URL from formats
def get_best_stream_url(formats, itag=None):
    if itag:
        # Find specific format by itag
        for fmt in formats:
            if fmt.get('itag') == itag and 'url' in fmt:
                return fmt.get('url')
    
    # First try to find format with both audio and video
    mp4_formats = [f for f in formats if 
                  f.get('mimeType', '').startswith('video/mp4') and
                  'url' in f and
                  f.get('audioQuality')]
    
    if mp4_formats:
        # Sort by height (quality) descending
        mp4_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
        return mp4_formats[0].get('url')
    
    # Fallback to any format with a URL
    for fmt in formats:
        if 'url' in fmt:
            return fmt.get('url')
    
    return None

# Main API endpoint
@app.get("/stream")
async def get_stream(
    url: str = Query(..., description="YouTube URL or video ID"),
    itag: Optional[int] = Query(None, description="Format ID (itag)"),
    redirect: bool = Query(False, description="Redirect to stream URL")
):
    try:
        # Extract video ID
        video_id = extract_video_id(url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL or video ID")
        
        # Get video data
        data = get_stream_data(video_id)
        
        # Check video availability
        if 'playabilityStatus' in data and data['playabilityStatus'].get('status') != 'OK':
            status = data['playabilityStatus']
            reason = status.get('reason', 'Video unavailable')
            raise HTTPException(status_code=403, detail=reason)
        
        # Extract formats
        formats = []
        if 'streamingData' in data:
            if 'formats' in data['streamingData']:
                formats.extend(data['streamingData']['formats'])
            if 'adaptiveFormats' in data['streamingData']:
                formats.extend(data['streamingData']['adaptiveFormats'])
        
        # Find stream URL
        stream_url = get_best_stream_url(formats, itag)
        
        if not stream_url:
            raise HTTPException(status_code=404, detail="No suitable stream URL found")
        
        # Redirect or return URL
        if redirect:
            return RedirectResponse(url=stream_url)
        else:
            return {"url": stream_url}
            
    except HTTPException as e:
        # Re-raise HTTP exceptions
        raise e
    except Exception as e:
        # Log unexpected errors
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Custom 404 handler
@app.exception_handler(404)
async def custom_404_handler(request, exc):
    return Response(
        content=json.dumps({"error": "Resource not found"}),
        status_code=404,
        media_type="application/json"
    )

# Run server
if __name__ == "__main__":
    import uvicorn
    
    # Production configuration
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        workers=4,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*"
    )