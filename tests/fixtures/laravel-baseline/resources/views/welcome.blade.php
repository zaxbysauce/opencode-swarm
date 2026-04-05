<!DOCTYPE html>
<html>
<head><title>{{ $title }}</title></head>
<body>
    {{-- TODO: replace static greeting with dynamic component --}}
    @if($user)
        <p>Hello, {{ $user->name }}</p>
    @endif
    {{-- Display raw output (unsafe pattern for SAST detection) --}}
    {!! $rawHtml !!}
</body>
</html>