# Bybit P2P Module

Модуль для работы с Bybit API, поддерживающий управление несколькими аккаунтами и P2P операциями.

## Возможности

- Управление несколькими аккаунтами (API ключ/секрет)
- Поддержка testnet и production окружений
- Получение балансов по всем типам кошельков
- P2P операции:
  - Получение P2P балансов
  - Управление объявлениями
  - Автоматический выбор платежного метода (Tinkoff/SBP)
  - Работа с ордерами
  - Чат с покупателями/продавцами
  - Освобождение средств

## Установка

```bash
npm install bybit-api decimal.js uuid
```

## Использование

### Базовый пример

```typescript
import { BybitClient } from './bybit';

const client = new BybitClient();

// Добавление аккаунтов
const accountId = client.addAccount(
  'your-api-key',
  'your-api-secret',
  false, // isTestnet
  'Main Account'
);

// Получение балансов
const balances = await client.getAccountBalances(accountId);

// Создание объявления на продажу
const ad = await client.createSellAdvertisement({
  accountId: accountId,
  price: '98.50',
  minTransactionAmount: 15000 // опционально, по умолчанию 15000
});
```

### Работа с P2P

```typescript
// Получение активных объявлений
const advertisements = await client.getActiveAdvertisements(accountId);

// Проверка наличия ордеров на объявление
const hasOrders = await client.checkAdvertisementHasOrders(accountId, advId);

// Получение ордеров
const orders = await client.getOrders(accountId);

// Работа с сообщениями
const messages = await client.getOrderMessages(accountId, orderId);
await client.sendOrderMessage(accountId, orderId, 'Оплата получена');

// Освобождение средств
await client.releaseOrder(accountId, orderId);
```

## Логика создания объявлений

1. Монета: USDT
2. Время платежа: 15 минут
3. Минимальная сумма = максимальная сумма (фиксированная транзакция)
4. Количество USDT = (минимальная сумма / курс) + 5 USDT
5. Автоматический выбор платежного метода:
   - Если есть активное объявление с SBP без ордеров → используем Tinkoff
   - Если есть активное объявление с Tinkoff без ордеров → используем SBP
   - Иначе чередуем методы
6. Максимум 2 активных объявления на аккаунт

## P2P API Endpoints

Модуль использует следующие эндпоинты Bybit P2P API:

- **Базовый URL**: `https://api.bybit.com` (mainnet) или `https://api-testnet.bybit.com` (testnet)
- **Информация об аккаунте**: `POST /v5/p2p/user/personal/info`
- **Информация о контрагенте**: `POST /v5/p2p/user/order/personal/info`
- **Платежные методы пользователя**: `POST /v5/p2p/user/payment/list`
- **Баланс монет**: `GET /v5/asset/transfer/query-account-coins-balance`
- **Список объявлений**: `POST /v5/p2p/item/online`
- **Создание объявления**: `POST /v5/p2p/item/create`
- **Удаление объявления**: `POST /v5/p2p/ad/remove`
- **Обновление объявления**: `POST /v5/p2p/ad/update-list`
- **Мои объявления**: `POST /v5/p2p/ad/ad-list`
- **Детали объявления**: `POST /v5/p2p/item/info`
- **Список ордеров**: `POST /v5/p2p/order/simplifyList`
- **Детали ордера**: `POST /v5/p2p/order/info`
- **Незавершенные ордера**: `POST /v5/p2p/order/pending/simplifyList`
- **Отметить ордер оплаченным**: `POST /v5/p2p/order/pay`
- **Освобождение средств**: `POST /v5/p2p/order/finish`
- **Отправка сообщения**: `POST /v5/p2p/order/message/send`
- **Загрузка файла в чат**: `POST /v5/p2p/oss/upload_file`
- **Получение сообщений чата**: `POST /v5/p2p/order/message/listpage`

Примечание: Все P2P эндпоинты, кроме баланса монет, используют метод POST.

## API Reference

### BybitClient

Основной класс для работы с API.

#### Методы управления аккаунтами

- `addAccount(apiKey, apiSecret, isTestnet?, label?)` - добавить аккаунт
- `removeAccount(accountId)` - удалить аккаунт
- `getAccount(accountId)` - получить информацию об аккаунте
- `getAllAccounts()` - получить все аккаунты

#### Методы работы с балансами

- `getAccountBalances(accountId)` - балансы одного аккаунта
- `getAllBalances()` - балансы всех аккаунтов
- `getP2PBalance(accountId)` - P2P баланс

#### P2P методы

- `getActiveAdvertisements(accountId)` - активные объявления
- `getAllActiveAdvertisements()` - объявления всех аккаунтов
- `getPaymentMethods(accountId)` - платежные методы
- `createSellAdvertisement(params)` - создать объявление на продажу
- `getOrders(accountId, status?)` - получить ордера
- `getAllOrders(status?)` - ордера всех аккаунтов
- `getOrderMessages(accountId, orderId)` - сообщения ордера
- `sendOrderMessage(accountId, orderId, message)` - отправить сообщение
- `releaseOrder(accountId, orderId)` - освободить средства