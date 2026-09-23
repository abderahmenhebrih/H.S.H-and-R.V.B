$root = "C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0"

Write-Host "=== GIT ==="
Set-Location $root
git status --short
git diff --stat
git log --oneline -3

Write-Host ""
Write-Host "=== FRONTEND ==="
Set-Location "$root\frontend"
npm run build
$frontendBuild = $LASTEXITCODE

npm run test:hsh-client
$clientTests = $LASTEXITCODE

npx tsx test-hsh-regression.ts
$regression = $LASTEXITCODE

Write-Host ""
Write-Host "=== BACKEND ==="
Set-Location "$root\backend"
npm run build
$backendBuild = $LASTEXITCODE

npm run test:hsh-sync
$backendTests = $LASTEXITCODE

Write-Host ""
Write-Host "=== RESULT ==="
Write-Host "Frontend build exit: $frontendBuild"
Write-Host "Frontend client tests exit: $clientTests"
Write-Host "Frontend regression exit: $regression"
Write-Host "Backend build exit: $backendBuild"
Write-Host "Backend sync tests exit: $backendTests"

Set-Location $root
Write-Host ""
Write-Host "=== FINAL GIT ==="
git status --short
git diff --stat
