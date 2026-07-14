@echo off
chcp 65001 > nul
title Dayı Katık Yerel Sunucu Paneli

echo ======================================================
echo    🍔 DAYI KATIK YEREL SUNUCU BAŞLATILIYOR...
echo ======================================================
echo.

:: Python yüklü mü kontrol et
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Python bilgisayarınızda yüklü görünmüyor!
    echo Lütfen Python yükleyin veya backend klasöründeki
    echo Node.js sunucusunu kullanın.
    pause
    exit
)

:: Sunucuyu arka planda başlat ve tarayıcıyı aç
echo [1/2] Tarayıcı açılıyor: http://localhost:12000
start http://localhost:12000

echo [2/2] Yerel sunucu port 12000 üzerinde çalışıyor...
echo.
echo NOT: Bu pencereyi kapatırsanız sunucu durur.
echo ------------------------------------------------------

:: Python ile HTTP sunucusunu başlat
python -m http.server 12000

pause
