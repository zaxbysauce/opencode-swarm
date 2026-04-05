<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    /**
     * The attributes that are not mass assignable.
     * WARNING: Empty $guarded disables all mass-assignment protection.
     */
    protected $guarded = [];
}