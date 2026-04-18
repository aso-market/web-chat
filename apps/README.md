# Чат-приложение

Каталог содержит веб-приложение чата:

## 📱 `chat-web` — Веб-интерфейс чата

Полнофункциональное React-приложение для встраивания или самостоятельного использования.

- **Одиночный чат** (`index.html`) — Чистый интерфейс для встраивания
- **Демонстрация тем** (`demo.html`) — Все 5 тем рядом
- Создано с React, TypeScript, Vite, Tailwind CSS, Framer Motion

**Быстрый старт:**
```bash
cd chat-web
npm install
npm run dev
```

Полная документация в [chat-web README](./chat-web/README.md).

## 🚀 Локальный запуск

Для полного локального тестирования:

**Терминал 1 — Backend API:**
```bash
cd ..
npm run dev:api
```

**Терминал 2 — Chat Web:**
```bash
cd chat-web
cp .env.example .env.local
npm install
npm run dev
```

Откройте в браузере:
- Чат: http://localhost:5173/
- Демо: http://localhost:5173/demo.html

## 🔧 Конфигурация

Приложение использует `.env.local`:

```env
VITE_API_BASE=http://localhost:8787
```

Скопируйте `.env.example` в `.env.local` и отредактируйте для вашего окружения.

## 📦 Сборка для продакшена

```bash
cd chat-web
npm run build
```

Результат в `dist/`:
- `index.html` — Основной чат
- `demo.html` — Демонстрация тем
- `assets/` — Собранные JavaScript и CSS

## 🎨 Темы

Chat web включает 5 встроенных тем:

1. **neon-blue** — Современный синий с эффектами свечения
2. **violet-noir** — Фиолетовая темная эстетика
3. **emerald-night** — Зеленый акцент, темный режим
4. **crimson-carbon** — Красный/розовый, индустриальный вид
5. **amber-obsidian** — Теплые оранжевые тона

Все темы полностью настраиваются через параметры URL.

## 📚 Основные файлы

```
chat-web/
├── index.html
├── demo.html
├── .env.example
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── src/
│   ├── main.tsx
│   ├── demo-main.tsx
│   ├── app.tsx
│   ├── demo-app.tsx
│   ├── index.css
│   └── components/
│       ├── ui/ai-chat.tsx
│       └── chat/chat-container.tsx
└── README.md
```

## 🔌 API контракт

Приложение взаимодействует с backend API:

- `POST /api/webchat/init` — Инициализация чата
- `GET /api/webchat/messages` — Получить историю
- `GET /api/webchat/stream` — SSE поток сообщений
- `POST /api/webchat/send` — Отправить сообщение

Полные спецификации API в [chat-web README](./chat-web/README.md).

## ✨ Функции разработки

- **Hot Module Replacement** — Мгновенные обновления
- **TypeScript** — Полная типизация
- **Tailwind CSS** — Утилитарный CSS
- **Framer Motion** — Плавные анимации
- **Vite** — Быстрый dev-сервер и сборка

## 📝 Примечания

- Приложение готово к развертыванию
- Конфигурация через переменные окружения
- Нет глобального состояния между модулями
