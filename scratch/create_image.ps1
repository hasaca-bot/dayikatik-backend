[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
$bmp = New-Object System.Drawing.Bitmap 1,1
$bmp.SetPixel(0,0,[System.Drawing.Color]::Red)
$bmp.Save('scratch\test.png', [System.Drawing.Imaging.ImageFormat]::Png)
write-output "Test image created successfully!"
