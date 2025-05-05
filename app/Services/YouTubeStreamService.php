<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class YouTubeStreamService
{
    /**
     * API URL of the YouTube Stream API
     *
     * @var string
     */
    protected $apiUrl;

    /**
     * API key for authentication
     *
     * @var string
     */
    protected $apiKey;

    /**
     * Cache duration in seconds
     *
     * @var int
     */
    protected $cacheDuration;

    /**
     * Create a new YouTubeStreamService instance
     *
     * @param string|null $apiUrl
     * @param string|null $apiKey
     * @param int|null $cacheDuration
     */
    public function __construct(
        string $apiUrl = null,
        string $apiKey = null,
        int $cacheDuration = null
    ) {
        $this->apiUrl = $apiUrl ?? config('services.youtube_stream.url');
        $this->apiKey = $apiKey ?? config('services.youtube_stream.api_key');
        $this->cacheDuration = $cacheDuration ?? config('services.youtube_stream.cache_duration', 7200);
    }

    /**
     * Get a stream URL for a YouTube video
     *
     * @param string $videoId YouTube video ID or URL
     * @param int|null $itag Specific format ID (optional)
     * @param bool $forceRefresh Bypass cache and force a fresh API call
     * @return string|null Stream URL or null on failure
     */
    public function getStreamUrl(string $videoId, ?int $itag = null, bool $forceRefresh = false): ?string
    {
        // Create cache key
        $cacheKey = "youtube_stream:{$videoId}" . ($itag ? ":{$itag}" : "");

        // Return from cache if available and not forcing refresh
        if (!$forceRefresh && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            // Build request parameters
            $params = [
                'url' => $this->isFullUrl($videoId) ? $videoId : $videoId,
                'key' => $this->apiKey
            ];

            if ($itag) {
                $params['itag'] = $itag;
            }

            // Make API request
            $response = Http::timeout(10)->get("{$this->apiUrl}/stream", $params);

            // Check for success
            if ($response->successful()) {
                $data = $response->json();

                if (isset($data['url'])) {
                    // Cache the result
                    Cache::put($cacheKey, $data['url'], $this->cacheDuration);

                    return $data['url'];
                }
            }

            // Log error if request failed
            if ($response->failed()) {
                Log::error('YouTube Stream API error', [
                    'status' => $response->status(),
                    'response' => $response->json() ?? $response->body(),
                    'video_id' => $videoId
                ]);
            }

            return null;
        } catch (\Exception $e) {
            Log::error('Exception in YouTubeStreamService', [
                'message' => $e->getMessage(),
                'video_id' => $videoId
            ]);

            return null;
        }
    }

    /**
     * Get health status of the YouTube Stream API
     *
     * @return bool True if API is healthy
     */
    public function checkHealth(): bool
    {
        try {
            $response = Http::timeout(5)->get("{$this->apiUrl}/health");

            return $response->successful() &&
                isset($response->json()['status']) &&
                $response->json()['status'] === 'ok';
        } catch (\Exception $e) {
            Log::error('Health check failed for YouTube Stream API', [
                'message' => $e->getMessage()
            ]);

            return false;
        }
    }

    /**
     * Get available instances (only for Invidious-based API)
     *
     * @return array|null List of instances or null on failure
     */
    public function getInstances(): ?array
    {
        try {
            $response = Http::timeout(5)->get("{$this->apiUrl}/instances");

            if ($response->successful() && isset($response->json()['instances'])) {
                return $response->json()['instances'];
            }

            return null;
        } catch (\Exception $e) {
            Log::error('Failed to get instances from YouTube Stream API', [
                'message' => $e->getMessage()
            ]);

            return null;
        }
    }

    /**
     * Check if the provided string is a full URL
     *
     * @param string $str
     * @return bool
     */
    protected function isFullUrl(string $str): bool
    {
        return strpos($str, 'http://') === 0 || strpos($str, 'https://') === 0;
    }
}
