<?php

namespace App\Http\Controllers;

use App\Services\YouTubeStreamService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class YouTubeStreamController extends Controller
{
    /**
     * The YouTube Stream Service instance.
     *
     * @var YouTubeStreamService
     */
    protected $streamService;

    /**
     * Create a new controller instance.
     *
     * @param YouTubeStreamService $streamService
     */
    public function __construct(YouTubeStreamService $streamService)
    {
        $this->streamService = $streamService;
    }

    /**
     * Get stream URL for a YouTube video
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function getStream(Request $request): JsonResponse
    {
        // Validate request
        $request->validate([
            'url' => 'required|string',
            'itag' => 'nullable|integer',
            'redirect' => 'nullable|boolean'
        ]);

        $videoUrl = $request->input('url');
        $itag = $request->input('itag');
        $redirect = $request->boolean('redirect', false);

        // Get stream URL
        $streamUrl = $this->streamService->getStreamUrl($videoUrl, $itag);

        if (!$streamUrl) {
            return response()->json([
                'success' => false,
                'error' => 'Failed to get stream URL'
            ], 404);
        }

        // Redirect if requested
        if ($redirect) {
            return response()->json([
                'redirect_url' => $streamUrl
            ]);
        }

        return response()->json([
            'success' => true,
            'url' => $streamUrl
        ]);
    }

    /**
     * Check API health
     *
     * @return JsonResponse
     */
    public function health(): JsonResponse
    {
        $isHealthy = $this->streamService->checkHealth();

        return response()->json([
            'status' => $isHealthy ? 'ok' : 'error'
        ], $isHealthy ? 200 : 503);
    }

    /**
     * Get available Invidious instances
     *
     * @return JsonResponse
     */
    public function instances(): JsonResponse
    {
        $instances = $this->streamService->getInstances();

        if ($instances === null) {
            return response()->json([
                'success' => false,
                'error' => 'Failed to get instances'
            ], 500);
        }

        return response()->json([
            'success' => true,
            'instances' => $instances
        ]);
    }
}
