<?php

use App\Http\Controllers\YouTubeStreamController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::prefix('youtube')->group(function () {
    Route::get('/stream', [YouTubeStreamController::class, 'getStream'])->name('youtube.stream');
    Route::get('/health', [YouTubeStreamController::class, 'health'])->name('youtube.health');
    Route::get('/instances', [YouTubeStreamController::class, 'instances'])->name('youtube.instances');
});