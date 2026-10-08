# ==========================================
# Этап 1: Установка зависимостей и сборка
# ==========================================
FROM node:20-alpine AS build
WORKDIR /app

# Копируем все файлы Angular проекта
COPY Broker.ManagementWeb/ .

# Устанавливаем зависимости
RUN npm ci --legacy-peer-deps --prefer-offline --no-audit

# Собираем проект (FIX: Added memory allocation to prevent SIGKILL out-of-memory crash)
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Debug: Show build output
RUN echo "=== Build output ===" && ls -la dist/ && find dist -type f | head -20

# Копируем в правильную структуру
RUN mkdir -p /app-dist && \
    if [ -d "dist/browser" ]; then \
        echo "Copying from dist/browser" && \
        cp -R dist/browser/* /app-dist/; \
    elif [ -d "dist" ] && [ -f "dist/index.html" ]; then \
        echo "Copying from dist" && \
        cp -R dist/* /app-dist/; \
    else \
        echo "ERROR: Build output not found!" && \
        ls -la dist/ && \
        exit 1; \
    fi

# Verify files were copied
RUN echo "=== Files in /app-dist ===" && ls -la /app-dist/

# ==========================================
# Этап 2: Финальный образ Nginx
# ==========================================
FROM nginx:alpine

# Устанавливаем правильные разрешения
RUN mkdir -p /usr/share/nginx/html && \
    chown -R nginx:nginx /usr/share/nginx/html

# Создаем правильный конфиг nginx для Angular
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Копируем файлы с правильными правами
COPY --from=build --chown=nginx:nginx /app-dist /usr/share/nginx/html

# Verify files were copied correctly
RUN echo "=== Files in nginx html directory ===" && \
    ls -la /usr/share/nginx/html/ && \
    test -f /usr/share/nginx/html/index.html && echo "✓ index.html found" || echo "✗ index.html missing"

# Test nginx config
RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
