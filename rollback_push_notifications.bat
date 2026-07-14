@echo off
echo ==============================================
echo   Dayi Katik - Web Push Notifications Rollback
echo ==============================================
echo Restoring original files from backup...

copy /Y backup_before_push_notifications\db.js backend\db.js
copy /Y backup_before_push_notifications\server.js backend\server.js
copy /Y backup_before_push_notifications\admin.html admin.html
copy /Y backup_before_push_notifications\index.html index.html
copy /Y backup_before_push_notifications\service-worker.js service-worker.js

echo.
echo Rollback completed successfully!
echo Original files restored.
echo ==============================================
pause
