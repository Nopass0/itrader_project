import { BybitClient } from "@/bybit/client";

/**
 * Извлечение методов оплаты из активных объявлений
 * и создание объявления на основе рыночных данных
 */

async function extractPaymentMethodsAndCreateAd() {
  console.log("=== Извлечение методов оплаты из рынка ===\n");
  
  const client = new BybitClient();
  
  try {
    // 1. Подключаем аккаунт
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false,
      "Payment Extractor",
    );
    
    // 2. Проверяем баланс
    console.log("💰 Проверка баланса...");
    const balances = await client.getP2PBalances(accountId);
    const usdtBalance = balances.find(b => b.coin === "USDT");
    console.log(`   USDT: ${usdtBalance?.free || "0"}\n`);
    
    if (!usdtBalance || parseFloat(usdtBalance.free) < 10) {
      console.log("❌ Недостаточно USDT для создания объявления");
      return;
    }
    
    // 3. Анализируем рынок и извлекаем методы оплаты
    console.log("🔍 Анализ активных объявлений...");
    
    const marketAds = await client.searchP2PAds(accountId, {
      tokenId: "USDT",
      currencyId: "RUB",
      side: "1", // продажа
      page: 1,
      size: 30,
    });
    
    if (!marketAds.list || marketAds.list.length === 0) {
      console.log("❌ Не найдено активных объявлений");
      return;
    }
    
    console.log(`✅ Найдено ${marketAds.list.length} объявлений\n`);
    
    // Собираем уникальные методы оплаты
    const paymentMethodsMap = new Map<string, {
      count: number;
      examples: string[];
    }>();
    
    const priceData: number[] = [];
    
    marketAds.list.forEach(ad => {
      // Собираем цены
      priceData.push(parseFloat(ad.price));
      
      // Извлекаем методы оплаты
      if (ad.payments && Array.isArray(ad.payments)) {
        ad.payments.forEach(payment => {
          if (!paymentMethodsMap.has(payment)) {
            paymentMethodsMap.set(payment, { count: 0, examples: [] });
          }
          const data = paymentMethodsMap.get(payment)!;
          data.count++;
          if (data.examples.length < 3 && !data.examples.includes(ad.nickName)) {
            data.examples.push(ad.nickName);
          }
        });
      }
    });
    
    // Анализ цен
    const avgPrice = priceData.reduce((a, b) => a + b, 0) / priceData.length;
    const minPrice = Math.min(...priceData);
    const maxPrice = Math.max(...priceData);
    
    console.log("📊 Анализ цен:");
    console.log(`   Средняя: ${avgPrice.toFixed(2)} RUB`);
    console.log(`   Минимальная: ${minPrice.toFixed(2)} RUB`);
    console.log(`   Максимальная: ${maxPrice.toFixed(2)} RUB\n`);
    
    // Анализ методов оплаты
    console.log("💳 Найденные методы оплаты:");
    
    const sortedPaymentMethods = Array.from(paymentMethodsMap.entries())
      .sort((a, b) => b[1].count - a[1].count);
    
    if (sortedPaymentMethods.length === 0) {
      console.log("   Методы оплаты не найдены в ответах API\n");
      
      // Пробуем получить детали конкретного объявления
      console.log("📄 Получение деталей объявлений...");
      
      for (let i = 0; i < Math.min(3, marketAds.list.length); i++) {
        const ad = marketAds.list[i];
        try {
          const detail = await client.getP2PAdDetail(accountId, ad.id);
          
          console.log(`\nОбъявление ${i + 1} (${detail.nickName}):`);
          console.log(`   Цена: ${detail.price} RUB`);
          
          if (detail.tradeMethods && detail.tradeMethods.length > 0) {
            console.log(`   Методы оплаты:`);
            detail.tradeMethods.forEach(method => {
              console.log(`   - ${method.payType}`);
              if (method.bankName) console.log(`     Банк: ${method.bankName}`);
            });
          }
        } catch (error) {
          console.log(`   Не удалось получить детали: ${error.message}`);
        }
      }
    } else {
      sortedPaymentMethods.forEach(([method, data]) => {
        const percentage = (data.count / marketAds.list.length * 100).toFixed(1);
        console.log(`   ${method}: ${data.count} объявлений (${percentage}%)`);
        console.log(`     Используют: ${data.examples.join(", ")}`);
      });
    }
    
    // 4. Создаем объявление на основе рыночных данных
    console.log("\n\n📝 Создание объявления на основе анализа...");
    
    // Определяем конкурентную цену (чуть ниже средней)
    const competitivePrice = (avgPrice * 0.998).toFixed(2); // На 0.2% ниже средней
    const quantity = Math.min(parseFloat(usdtBalance.free) * 0.5, 100); // 50% баланса, макс 100
    
    console.log(`   Конкурентная цена: ${competitivePrice} RUB`);
    console.log(`   Количество: ${quantity.toFixed(2)} USDT`);
    
    // Пробуем найти рабочие ID методов оплаты
    const possiblePaymentIds = [
      "1", "2", "3", "4", "5", // Стандартные ID
      "bank_transfer", "sberbank", "tinkoff", // Возможные текстовые ID
      "yoomoney", "qiwi", "card", // Электронные кошельки
    ];
    
    console.log("\n🔧 Попытка создания объявления с разными методами оплаты...\n");
    
    for (const paymentId of possiblePaymentIds) {
      console.log(`Пробуем с payment ID: "${paymentId}"`);
      
      try {
        const result = await client.createP2PAd(accountId, {
          tokenId: "USDT",
          currencyId: "RUB",
          side: "1", // продажа
          priceType: "0", // фиксированная цена
          price: competitivePrice,
          quantity: quantity.toFixed(2),
          minAmount: (parseFloat(competitivePrice) * 10).toFixed(2), // Мин 10 USDT
          maxAmount: (parseFloat(competitivePrice) * quantity).toFixed(2),
          paymentPeriod: "15",
          paymentIds: [paymentId],
          remark: "Быстрый релиз! Профессиональный трейдер 24/7",
          tradingPreferenceSet: {
            isFilterBlockedUser: true,
            completeRatePercent: 80,
          },
          itemType: "ORIGIN",
        });
        
        console.log(`✅ Успех! Объявление создано с ID: ${result.itemId}`);
        console.log(`   Использован payment ID: "${paymentId}"`);
        break;
        
      } catch (error: any) {
        if (error.message.includes("912300013")) {
          console.log(`   ❌ Payment ID "${paymentId}" не существует`);
        } else if (error.message.includes("912120022")) {
          console.log(`   ❌ Цена вне разрешенного диапазона`);
        } else {
          console.log(`   ❌ Ошибка: ${error.message}`);
        }
      }
    }
    
    // 5. Альтернативный подход - попробовать без методов оплаты
    console.log("\n\n🔧 Попытка создания без указания методов оплаты...");
    
    try {
      const result = await client.createP2PAd(accountId, {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "1",
        priceType: "0",
        price: competitivePrice,
        quantity: quantity.toFixed(2),
        minAmount: (parseFloat(competitivePrice) * 10).toFixed(2),
        maxAmount: (parseFloat(competitivePrice) * quantity).toFixed(2),
        paymentPeriod: "15",
        paymentIds: [], // Пустой массив
        remark: "Professional P2P trader",
        tradingPreferenceSet: {},
        itemType: "ORIGIN",
      });
      
      console.log(`✅ Объявление создано без методов оплаты!`);
      console.log(`   ID: ${result.itemId}`);
      
    } catch (error: any) {
      console.log(`❌ Не удалось создать без методов: ${error.message}`);
    }
    
  } catch (error: any) {
    console.error("\n❌ Критическая ошибка:", error.message);
  }
}

// Дополнительная функция для поиска рабочих методов
async function findWorkingPaymentMethods() {
  console.log("\n\n=== Поиск рабочих методов оплаты ===\n");
  
  const client = new BybitClient();
  const accountId = await client.addAccount(
    "ysfXg4bN0vRMwlwYuI",
    "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
    false,
  );
  
  // Список возможных ID для тестирования
  const testIds = [];
  
  // Числовые ID
  for (let i = 1; i <= 20; i++) {
    testIds.push(i.toString());
  }
  
  // Текстовые ID
  const textIds = [
    "BANK", "BANK_TRANSFER", "BANK_CARD",
    "SBERBANK", "TINKOFF", "VTB", "ALFA",
    "YOOMONEY", "QIWI", "WEBMONEY",
    "CARD", "CASH", "SBP",
  ];
  
  testIds.push(...textIds);
  testIds.push(...textIds.map(id => id.toLowerCase()));
  
  console.log(`Тестирование ${testIds.length} возможных ID...\n`);
  
  const workingIds: string[] = [];
  const quantity = "10"; // Минимальное количество для теста
  
  for (const id of testIds) {
    process.stdout.write(`Тест "${id}"... `);
    
    try {
      await client.createP2PAd(accountId, {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "1",
        priceType: "0",
        price: "85.00",
        quantity: quantity,
        minAmount: "850",
        maxAmount: "850",
        paymentPeriod: "15",
        paymentIds: [id],
        remark: "Test",
        tradingPreferenceSet: {},
        itemType: "ORIGIN",
      });
      
      console.log("✅ РАБОТАЕТ!");
      workingIds.push(id);
      
      // Удаляем тестовое объявление
      // await client.deleteP2PAd(accountId, result.itemId);
      
    } catch (error: any) {
      if (error.message.includes("912300013")) {
        console.log("❌");
      } else {
        console.log(`⚠️ ${error.message.slice(0, 30)}...`);
      }
    }
    
    // Небольшая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (workingIds.length > 0) {
    console.log(`\n\n✅ Найдено ${workingIds.length} рабочих ID:`);
    workingIds.forEach(id => console.log(`   - "${id}"`));
  } else {
    console.log("\n\n❌ Рабочие ID не найдены");
  }
}

// Запуск
extractPaymentMethodsAndCreateAd()
  .then(() => findWorkingPaymentMethods())
  .then(() => {
    console.log("\n\n✅ Анализ завершен!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Ошибка:", error);
    process.exit(1);
  });