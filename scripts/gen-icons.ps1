# scripts/gen-icons.ps1 — generate the PWA icon set from the brand lockup.
#
# Run once (or whenever the lockup changes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\gen-icons.ps1
#
# The source is the real ARS_Logo_Lockup.png, not a redrawn approximation, so
# the home-screen tile is the same mark as the letterhead. Three things happen
# to it on the way to a square icon:
#
#   * THE TAGLINE IS DROPPED. "THE OPEN EQUIPMENT MARKETPLACE" is 25 px tall in
#     a 931 px lockup; at 192 px square it is four grey pixels of noise. What
#     survives is ASSET / swoosh / RE-SOURCE.
#   * BLACK BECOMES WHITE. The lockup is ink-on-white; an app icon sits on
#     whatever wallpaper the rep chose, so it needs its own field. The field is
#     brand ink (#1A212E, the manifest theme_color) and the wordmark inverts to
#     white. The gold swoosh stays gold — it is the one part of this mark that
#     is recognisable at 48 px.
#   * ANTI-ALIASING IS REBUILT FROM LUMINANCE, not copied. Copying the source
#     alpha would paste the lockup's WHITE page background over the ink field.
#     Instead each pixel's darkness becomes the new alpha, so the edges stay
#     smooth against a background the original never knew about.
#
# Maskable icons get a smaller mark: Android crops a maskable icon to whatever
# shape the launcher likes, guaranteeing only the centre 80%. MASKABLE_FRAC is
# the margin that keeps "ASSET" off the chopping block.
#
# The favicon uses the COMPACT crop (ASSET + swoosh, no RE-SOURCE). At 16 px
# two stacked words are a smudge; one word and the swoosh still reads.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = "C:\Users\ClintHaston\OneDrive - Asset-Resource\Desktop\mockup files\ARS_Logo_Lockup.png"
$outDir = Join-Path $root 'public'
$iconDir = Join-Path $outDir 'icons'
foreach ($d in @($outDir, $iconDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
}

# Brand ink + gold, straight off the --p-* palette.
$INK = [System.Drawing.Color]::FromArgb(255, 0x1A, 0x21, 0x2E)
$GOLD_R = 0xF3; $GOLD_G = 0xCE; $GOLD_B = 0x00

# Source bands, measured off the lockup (931x280): the tagline starts at y=240,
# the swoosh runs y=109..204, RE-SOURCE ends by y=215.
$FULL_BOTTOM = 215      # ASSET + swoosh + RE-SOURCE
$COMPACT_BOTTOM = 152   # ASSET + the top of the swoosh
# The favicon monogram: "AS" and the swoosh under it. Column-profiling the
# ASSET band shows A and S sharing ink (one run, x 164..412) and S/E/T standing
# apart after it, so "AS" is the narrowest crop that does not cut a letter in
# half. 249x152 is close enough to square to still read at 16 px, where the
# full 4:1 lockup renders as a 3-pixel-tall smear.
$MONO_LEFT = 158
$MONO_RIGHT = 414

function Get-MarkBitmap {
  param([int]$Bottom, [int]$Left = 0, [int]$Right = 100000)

  $bmp = New-Object System.Drawing.Bitmap $src
  $w = $bmp.Width
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $bmp.Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $bmp.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)
  $bmp.Dispose()

  # Pass 1: recolour into a full-width ARGB buffer and learn the content bbox.
  $out = New-Object byte[] ($stride * $Bottom)
  $minX = $w; $maxX = -1; $minY = $Bottom; $maxY = -1
  $xFrom = [Math]::Max(0, $Left)
  $xTo = [Math]::Min($w - 1, $Right)
  for ($y = 0; $y -lt $Bottom; $y++) {
    $o = $y * $stride
    for ($x = $xFrom; $x -le $xTo; $x++) {
      $i = $o + $x * 4
      $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]; $a = $bytes[$i + 3]
      if ($a -le 8) { continue }

      $mx = [Math]::Max($r, [Math]::Max($g, $b))
      $mn = [Math]::Min($r, [Math]::Min($g, $b))
      $chroma = $mx - $mn
      $lum = 0.299 * $r + 0.587 * $g + 0.114 * $b

      if ($chroma -gt 40 -and $r -ge $g -and $g -ge $b) {
        # Gold family. Chroma is what survives blending toward the white page,
        # so it is the honest measure of "how much swoosh is in this pixel".
        $cov = [Math]::Min(1.0, $chroma / 150.0)
        $or = $GOLD_R; $og = $GOLD_G; $ob = $GOLD_B
      }
      else {
        # Ink family: darkness is coverage. Near-white is page, not mark.
        $cov = (235.0 - $lum) / 235.0
        if ($cov -lt 0) { $cov = 0.0 }
        if ($cov -gt 1) { $cov = 1.0 }
        $or = 255; $og = 255; $ob = 255
      }

      $oa = [int][Math]::Round($cov * $a)
      if ($oa -le 4) { continue }
      $out[$i] = $ob; $out[$i + 1] = $og; $out[$i + 2] = $or; $out[$i + 3] = $oa
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
  if ($maxX -lt 0) { throw "no content found above y=$Bottom in $src" }

  $full = New-Object System.Drawing.Bitmap $w, $Bottom, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $fd = $full.LockBits((New-Object System.Drawing.Rectangle 0, 0, $w, $Bottom),
                       [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
                       [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  [System.Runtime.InteropServices.Marshal]::Copy($out, 0, $fd.Scan0, $out.Length)
  $full.UnlockBits($fd)

  # Trim to the bbox so centring centres the MARK, not the source canvas.
  $cropW = $maxX - $minX + 1
  $cropH = $maxY - $minY + 1
  $crop = $full.Clone((New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH),
                      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $full.Dispose()
  # Write-Host, not Write-Output: this function RETURNS a bitmap, and anything
  # written to the pipeline would be returned alongside it as an array.
  Write-Host "  mark(bottom=$Bottom, x=$xFrom..$xTo): ${cropW}x${cropH} from ($minX,$minY)"
  return $crop
}

function Write-Icon {
  param([System.Drawing.Bitmap]$Mark, [int]$Size, [double]$Frac, [string]$Path)

  $canvas = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gfx = [System.Drawing.Graphics]::FromImage($canvas)
  $gfx.Clear($INK)
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  # Fit inside a Frac x Frac box — width OR height, whichever binds first.
  $box = $Size * $Frac
  $scale = [Math]::Min($box / $Mark.Width, $box / $Mark.Height)
  $dw = [int][Math]::Round($Mark.Width * $scale)
  $dh = [int][Math]::Round($Mark.Height * $scale)
  $dx = [int][Math]::Round(($Size - $dw) / 2.0)
  $dy = [int][Math]::Round(($Size - $dh) / 2.0)
  $gfx.DrawImage($Mark, $dx, $dy, $dw, $dh)
  $gfx.Dispose()

  $canvas.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  Write-Host ("  {0,-34} {1}x{1}  mark {2}x{3}" -f (Split-Path -Leaf $Path), $Size, $dw, $dh)
}

Write-Output "reading $src"
$markFull = Get-MarkBitmap -Bottom $FULL_BOTTOM
$markMono = Get-MarkBitmap -Bottom $COMPACT_BOTTOM -Left $MONO_LEFT -Right $MONO_RIGHT

# purpose=any: the tile as drawn, so it needs its own breathing room.
$ANY_FRAC = 0.80
# purpose=maskable: the launcher crops to its own shape; only the centre 80% is
# guaranteed, so the mark stays well inside that.
$MASKABLE_FRAC = 0.58
# iOS applies a fixed rounded-rect mask and no padding of its own.
$APPLE_FRAC = 0.76
$FAVICON_FRAC = 0.86

Write-Output "writing icons"
foreach ($s in 96, 192, 512) {
  Write-Icon -Mark $markFull -Size $s -Frac $ANY_FRAC -Path (Join-Path $iconDir "icon-$s.png")
}
foreach ($s in 192, 512) {
  Write-Icon -Mark $markFull -Size $s -Frac $MASKABLE_FRAC -Path (Join-Path $iconDir "maskable-$s.png")
}
Write-Icon -Mark $markFull -Size 180 -Frac $APPLE_FRAC -Path (Join-Path $outDir 'apple-touch-icon.png')
foreach ($s in 16, 32) {
  Write-Icon -Mark $markMono -Size $s -Frac $FAVICON_FRAC -Path (Join-Path $outDir "favicon-$s.png")
}

$markFull.Dispose()
$markMono.Dispose()
Write-Output "done"
