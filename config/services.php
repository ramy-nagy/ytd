<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'youtube_stream' => [
        // YouTube Stream API base URL
        'url' => env('YOUTUBE_STREAM_API_URL', 'http://localhost:3000'),

        // API key for authentication
        'api_key' => env('YOUTUBE_STREAM_API_KEY', 'RXcIL8gvlFP09N8ZpkkymPpiHCLSaJt0Ti5RkIhdzz4'),

        // Cache duration in seconds (default: 2 hours)
        'cache_duration' => env('YOUTUBE_STREAM_CACHE_DURATION', 7200),
    ]
];
