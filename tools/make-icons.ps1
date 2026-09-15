param()

Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon([int]$iconSize) {
    $bitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $margin = [Math]::Max(1, $iconSize * 0.04)
    $background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(35, 134, 54))
    $shape = New-RoundedPath $margin $margin ($iconSize - 2 * $margin) ($iconSize - 2 * $margin) ($iconSize * 0.2)
    $graphics.FillPath($background, $shape)

    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $pointsLeft = [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new($iconSize * 0.18, $iconSize * 0.27),
            [System.Drawing.PointF]::new($iconSize * 0.45, $iconSize * 0.34),
            [System.Drawing.PointF]::new($iconSize * 0.45, $iconSize * 0.76),
            [System.Drawing.PointF]::new($iconSize * 0.18, $iconSize * 0.67)
    )
    $pointsRight = [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new($iconSize * 0.82, $iconSize * 0.27),
            [System.Drawing.PointF]::new($iconSize * 0.55, $iconSize * 0.34),
            [System.Drawing.PointF]::new($iconSize * 0.55, $iconSize * 0.76),
            [System.Drawing.PointF]::new($iconSize * 0.82, $iconSize * 0.67)
    )
    $graphics.FillPolygon($white, $pointsLeft)
    $graphics.FillPolygon($white, $pointsRight)

    $target = Join-Path $iconDirectory "icon-$iconSize.png"
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    $white.Dispose()
    $shape.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

foreach ($iconSize in @(16, 32, 48, 96)) { New-Icon $iconSize }

Write-Host "Generated icons in $iconDirectory"
