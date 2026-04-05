<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController
{
    public function search(Request $request): array
    {
        $name = $request->input('name');

        // Unsafe: concatenating user input into raw query
        $users = DB::table('users')
            ->whereRaw('name = ' . $name)
            ->get();

        return $users->toArray();
    }
}