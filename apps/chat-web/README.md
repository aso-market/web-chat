# Веб-приложение чата

React-приложение чата с поддержкой различных тем и настраиваемым интерфейсом.

## Функции

- **Одиночный интерфейс чата** — Полнофункциональный UI для встраивания
- **Демонстрация тем** — Витрина из 5 различных тем чата
- **Настраиваемые темы** — Поддержка произвольных цветов и стилей
- **Интеграция API** — RESTful API с EventSource потоком

## Структура

- `index.html` — Точка входа приложения чата
- `demo.html` — Точка входа демонстрации
- `src/main.tsx` — Загрузка приложения чата
- `src/demo-main.tsx` — Загрузка демонстрации
- `src/app.tsx` — Компонент чата
- `src/demo-app.tsx` — Демо-приложение с селектором тем
- `src/components/ui/ai-chat.tsx` — Переиспользуемый компонент UI
- `src/components/chat/chat-container.tsx` — Логика и состояние чата

## Установка

1. **Установить зависимости:**
   ```bash
   npm install
   ```

2. **Создать конфиг окружения:**
   ```bash
   cp .env.example .env.local
   ```

3. **Настроить API в `.env.local`:**
   ```env
   VITE_API_BASE=http://localhost:8787
   ```

## Запуск

### Сервер разработки
```bash
npm run dev
```

Запускается на `http://localhost:5173`:
- Чат: `http://localhost:5173/`
- Демонстрация: `http://localhost:5173/demo.html`

### Production сборка
```bash
npm run build
```

Выводит в `dist/`:
- `index.html` — Основной чат
- `demo.html` — Демонстрация
- `assets/` — Собранные JS и CSS

### Предпросмотр собранных файлов
```bash
npm run preview
```

## Использование

### Одиночный чат
Используйте `index.html` для встраивания. Передавайте конфигурацию через параметры URL:

```html
<iframe src="http://localhost:5173/?projectId=my-project&customerId=user123"></iframe>
```

**Параметры:**
- `projectId` — Идентификатор проекта
- `customerId` — Идентификатор пользователя
- `conversationId` — ID диалога
- `apiBase` — URL API
- `theme` — Название темы (neon-blue, violet-noir, emerald-night, crimson-carbon, amber-obsidian)
- `title`, `subtitle`, `welcomeText`, `placeholder` — Текстовые переопределения
- `themePrimary` — Основной цвет
- `themeButtonColor` — Цвет кнопки отправки
- `themeBubbleClientBg` — Фон сообщений пользователя
- `themeBubbleSupportBg` — Фон сообщений AI
- `themeBackground` — Общий фон
- `themeSurface` — Фон поля ввода
- `themeHeaderColor` — Цвет заголовка

### Демонстрация тем
Используйте `demo.html` для просмотра всех 5 тем рядом с живыми примерами.

**Доступные темы:**
1. `neon-blue` — Синий акцент с современным свечением
2. `violet-noir` — Фиолетовая темная эстетика
3. `emerald-night` — Зеленый акцент с темным фоном
4. `crimson-carbon` — Красный/розовый индустриальный стиль
5. `amber-obsidian` — Оранжевые/янтарные теплые тона

## Архитектура

### Компонент ChatContainer
- Управляет состоянием чата (сообщения, ID диалога, тема)
- Обрабатывает API (инициализация, сообщения, поток)
- Поддерживает сохранение в локальное хранилище
- Динамически загружает конфигурацию проекта

### Компонент AIChatCard
- Компонент представления сообщений
- Настраиваемые темы с цветовыми токенами
- Анимированный вход сообщений
- Адаптивный дизайн

### Система тем
Каждая тема определяет визуальные токены:
- Цвета (акцент, фоны, текст)
- Отступы и границы
- Тени и свечение
- Время анимации

## Интеграция API

Чат ожидает backend API с этими endpoints:

### POST `/api/webchat/init`
Инициализация чата и получение ID диалога.

**Запрос:**
```json
{
  "projectId": "demo",
  "customerId": "optional",
  "conversationId": "optional",
  "signature": "optional"
}
```

**Ответ:**
```json
{
  "ok": true,
  "projectId": "demo",
  "conversationId": "abc123",
  "projectConfig": {
    "title": "Support",
    "primaryColor": "#3b82f6"
  }
}
```

### GET `/api/webchat/messages`
Получить историю диалога.

**Параметры:**
- `projectId` (обязательно)
- `conversationId` (обязательно)
- `limit` (по умолчанию: 100)
- `signature` (опционально)

### GET `/api/webchat/stream`
Поток Server-Sent Events для новых сообщений.

**Параметры:**
- `projectId` (обязательно)
- `conversationId` (обязательно)
- `sinceId` (по умолчанию: 0)
- `signature` (опционально)

### POST `/api/webchat/send`
Отправить сообщение.

**Запрос:**
```json
{
  "projectId": "demo",
  "conversationId": "abc123",
  "text": "User message",
  "signature": "optional"
}
```

**Ответ:**
```json
{
  "ok": true,
  "message": {
    "id": 1,
    "role": "client",
    "text": "User message",
    "ts": 1234567890000
  }
}
```

## Поддержка браузеров

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Современные мобильные браузеры

## Заметки о производительности

- Vite обеспечивает быстрый HMR при разработке
- Сборка создает отдельные точки входа для чата и демо
- Использует Tailwind CSS для оптимизированного стилирования
- Framer Motion для плавных анимаций

## Устранение неполадок

**Чат не подключается:**
- Проверьте переменную `apiBase` указывает на работающий API
- Проверьте CORS заголовки на backend
- Проверьте консоль браузера на ошибки API

**Стили не применяются:**
- Убедитесь что Tailwind CSS скомпилирован (автоматически с Vite)
- Очистите кеш браузера при переключении тем

**Сообщения не появляются:**
- Проверьте соединение EventSource (вкладка Network в DevTools)
- Проверьте что backend отправляет сообщения в правильном формате
