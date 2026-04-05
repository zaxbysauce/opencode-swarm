<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        // Drop legacy table (no rollback support below)
        Schema::dropIfExists('legacy_users');
    }

    // NOTE: down() method intentionally omitted to test SAST detection
};