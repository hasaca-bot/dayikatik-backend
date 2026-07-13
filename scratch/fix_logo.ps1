# Load original content
$original = [System.IO.File]::ReadAllText("..\index (1).html", [System.Text.Encoding]::UTF8)
$current = [System.IO.File]::ReadAllText("index.html", [System.Text.Encoding]::UTF8)

# Find the exact original logo tag from original content
# The original tag starts with '<img src="data:image/png;base64,iVBORw0KGgoAAA'
if ($original -match '(<img src="data:image/png;base64,iVBORw0KGgoAAA[^>]+>)') {
    $originalLogo = $Matches[1]
    Write-Host "Found original logo in index (1).html, length: $($originalLogo.Length)"
} else {
    Write-Error "Could not find original logo in index (1).html!"
    exit 1
}

# Find the original favicon tag from original content
if ($original -match '(<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgoAAA[^>]+>)') {
    $originalFavicon = $Matches[1]
    Write-Host "Found original favicon in index (1).html, length: $($originalFavicon.Length)"
} else {
    Write-Error "Could not find original favicon in index (1).html!"
    exit 1
}

# Now let's check current file and replace
# The current broken logo contains "..." in the base64 string
$currentBrokenLogoPattern = '(<img src="data:image/png;base64,iVBORw0KGgoAAA[^>]+alt="Logo">)'
if ($current -match $currentBrokenLogoPattern) {
    $brokenLogo = $Matches[1]
    $current = $current.Replace($brokenLogo, $originalLogo)
    Write-Host "Replaced broken logo with original logo."
} else {
    # Try another pattern just in case
    $currentBrokenLogoPattern2 = '(<img src="data:image/png;base64,iVBORw0KGgoAAA[^>]+alt="Dayı Katık">)'
    if ($current -match $currentBrokenLogoPattern2) {
        $brokenLogo = $Matches[1]
        $current = $current.Replace($brokenLogo, $originalLogo)
        Write-Host "Replaced broken logo (pattern 2) with original logo."
    } else {
        Write-Warning "Could not find broken logo pattern in current index.html!"
    }
}

# Let's replace the broken favicon line
$currentBrokenFaviconPattern = '(<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgoAAA[^>]+>)'
if ($current -match $currentBrokenFaviconPattern) {
    $brokenFavicon = $Matches[1]
    $current = $current.Replace($brokenFavicon, $originalFavicon)
    Write-Host "Replaced broken favicon with original favicon."
} else {
    Write-Warning "Could not find broken favicon pattern in current index.html!"
}

# Save updated content with UTF-8 encoding
[System.IO.File]::WriteAllText("index.html", $current, [System.Text.Encoding]::UTF8)
Write-Host "Successfully fixed index.html logo and favicon."
