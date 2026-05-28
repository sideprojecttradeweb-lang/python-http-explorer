# 使用官方輕量級 Python 映像檔
FROM python:3.14.5-slim


# 設定工作目錄
WORKDIR /app

# 建立非 root 的系統使用者與群組以提高安全性
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 複製依賴宣告並安裝
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 複製專案檔案到工作目錄
COPY server.py index.html style.css app.js feature-3.html feature-3.js ./

# 調整檔案擁有權為非 root 使用者
RUN chown -R appuser:appuser /app

# 切換至非 root 使用者
USER appuser

# 設定環境變數，防止 Python 緩衝輸出，確保日誌能即時顯示
ENV PYTHONUNBUFFERED=1

# 宣告容器監聽的連接埠
EXPOSE 8000

# 啟動 Python HTTP 伺服器
CMD ["python", "server.py"]
