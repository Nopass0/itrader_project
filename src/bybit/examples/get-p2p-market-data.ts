import { BybitClient } from "@/bybit/client";

/**
 * Получение методов оплаты и данных из активных объявлений на P2P маркете
 */

async function getP2PMarketData() {
  console.log("=== Анализ P2P маркета Bybit ===\n");
  
  const client = new BybitClient();
  
  try {
    // 1. Подключаем аккаунт
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false,
      "Market Analysis",
    );
    console.log("✅ Аккаунт подключен\n");
    
    // 2. Ищем активные объявления на продажу USDT за RUB
    console.log("🔍 Поиск активных объявлений USDT/RUB (продажа)...");
    
    const sellAds = await client.searchP2PAds(accountId, {
      tokenId: "USDT",
      currencyId: "RUB",
      side: "1", // 1 = продажа
      page: 1,
      size: 20,
    });
    
    if (sellAds.list && sellAds.list.length > 0) {
      console.log(`✅ Найдено ${sellAds.list.length} объявлений на продажу\n`);
      
      // Анализируем методы оплаты
      const paymentMethods = new Map<string, number>();
      const priceRange = {
        min: Number.MAX_VALUE,
        max: 0,
        avg: 0,
        total: 0,
      };
      
      console.log("📊 Анализ объявлений:\n");
      
      sellAds.list.forEach((ad, index) => {
        console.log(`${index + 1}. Продавец: ${ad.nickName}`);
        console.log(`   Цена: ${ad.price} RUB`);
        console.log(`   Доступно: ${ad.quantity} USDT`);
        console.log(`   Лимиты: ${ad.minAmount}-${ad.maxAmount} RUB`);
        console.log(`   Завершено сделок: ${ad.completedOrderCount}`);
        console.log(`   Рейтинг: ${ad.completedRate}%`);
        
        // Собираем статистику по ценам
        const price = parseFloat(ad.price);
        priceRange.min = Math.min(priceRange.min, price);
        priceRange.max = Math.max(priceRange.max, price);
        priceRange.total += price;
        
        // Методы оплаты (если есть в ответе)
        if (ad.payments && Array.isArray(ad.payments)) {
          console.log(`   Методы оплаты: ${ad.payments.join(", ")}`);
          ad.payments.forEach(method => {
            paymentMethods.set(method, (paymentMethods.get(method) || 0) + 1);
          });
        }
        
        console.log();
      });
      
      // Статистика по ценам
      priceRange.avg = priceRange.total / sellAds.list.length;
      console.log("\n📈 Статистика цен:");
      console.log(`   Минимальная: ${priceRange.min.toFixed(2)} RUB`);
      console.log(`   Максимальная: ${priceRange.max.toFixed(2)} RUB`);
      console.log(`   Средняя: ${priceRange.avg.toFixed(2)} RUB`);
      console.log(`   Разброс: ${(priceRange.max - priceRange.min).toFixed(2)} RUB`);
      
      // Статистика по методам оплаты
      if (paymentMethods.size > 0) {
        console.log("\n💳 Популярные методы оплаты:");
        const sortedMethods = Array.from(paymentMethods.entries())
          .sort((a, b) => b[1] - a[1]);
        
        sortedMethods.forEach(([method, count]) => {
          const percentage = (count / sellAds.list.length * 100).toFixed(1);
          console.log(`   ${method}: ${count} объявлений (${percentage}%)`);
        });
      }
      
      // Получаем детали первого объявления
      if (sellAds.list.length > 0) {
        console.log("\n\n📄 Детальная информация о первом объявлении:");
        const firstAd = sellAds.list[0];
        
        try {
          const adDetail = await client.getP2PAdDetail(accountId, firstAd.id);
          console.log(`\nОбъявление ID: ${adDetail.id}`);
          console.log(`Продавец: ${adDetail.nickName}`);
          console.log(`Статус: ${adDetail.status === "1" ? "Активно" : "Неактивно"}`);
          console.log(`Создано: ${new Date(parseInt(adDetail.createTime)).toLocaleString()}`);
          
          if (adDetail.tradeMethods && adDetail.tradeMethods.length > 0) {
            console.log("\nМетоды оплаты:");
            adDetail.tradeMethods.forEach(method => {
              console.log(`- ${method.payType}`);
              if (method.account) console.log(`  Аккаунт: ${method.account}`);
              if (method.bankName) console.log(`  Банк: ${method.bankName}`);
            });
          }
          
          console.log(`\nКомиссии:`);
          console.log(`  Мейкер: ${adDetail.makerFee}`);
          console.log(`  Тейкер: ${adDetail.takerFee}`);
          
        } catch (error: any) {
          console.log("Не удалось получить детали объявления:", error.message);
        }
      }
      
    } else {
      console.log("❌ Объявления не найдены");
    }
    
    // 3. Ищем объявления на покупку
    console.log("\n\n🔍 Поиск активных объявлений USDT/RUB (покупка)...");
    
    const buyAds = await client.searchP2PAds(accountId, {
      tokenId: "USDT",
      currencyId: "RUB",
      side: "0", // 0 = покупка
      page: 1,
      size: 10,
    });
    
    if (buyAds.list && buyAds.list.length > 0) {
      console.log(`✅ Найдено ${buyAds.list.length} объявлений на покупку\n`);
      
      buyAds.list.slice(0, 5).forEach((ad, index) => {
        console.log(`${index + 1}. Покупатель: ${ad.nickName}`);
        console.log(`   Цена: ${ad.price} RUB`);
        console.log(`   Нужно: ${ad.quantity} USDT`);
        console.log(`   Лимиты: ${ad.minAmount}-${ad.maxAmount} RUB`);
        console.log();
      });
    }
    
    // 4. Рекомендации для создания объявления
    console.log("\n\n💡 Рекомендации для создания объявления:");
    
    if (sellAds.list && sellAds.list.length > 0) {
      const avgPrice = sellAds.list.reduce((sum, ad) => sum + parseFloat(ad.price), 0) / sellAds.list.length;
      const competitivePrice = (avgPrice * 0.995).toFixed(2); // На 0.5% ниже среднего
      
      console.log(`1. Рекомендуемая цена: ${competitivePrice} RUB (на 0.5% ниже среднего)`);
      console.log(`2. Минимальный заказ: 500-1000 RUB`);
      console.log(`3. Время на оплату: 15 минут`);
      console.log(`4. Популярные методы оплаты:`);
      console.log(`   - Банковский перевод (Сбербанк, Тинькофф)`);
      console.log(`   - Электронные кошельки (ЮMoney, QIWI)`);
    }
    
  } catch (error: any) {
    console.error("\n❌ Ошибка:", error.message);
  }
}

// Функция для мониторинга конкурентов
async function monitorCompetitors() {
  console.log("\n\n=== Мониторинг конкурентов ===\n");
  
  const client = new BybitClient();
  const accountId = await client.addAccount(
    "ysfXg4bN0vRMwlwYuI",
    "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
    false,
  );
  
  // Отслеживаем топ продавцов
  const topSellers = await client.searchP2PAds(accountId, {
    tokenId: "USDT",
    currencyId: "RUB",
    side: "1",
    page: 1,
    size: 5,
  });
  
  if (topSellers.list && topSellers.list.length > 0) {
    console.log("🏆 Топ-5 продавцов:");
    
    topSellers.list.forEach((seller, index) => {
      console.log(`\n${index + 1}. ${seller.nickName}`);
      console.log(`   Цена: ${seller.price} RUB`);
      console.log(`   Завершено сделок: ${seller.completedOrderCount}`);
      console.log(`   Рейтинг: ${seller.completedRate}%`);
      console.log(`   Среднее время релиза: ${seller.avgReleaseTime} мин`);
      console.log(`   Объем торгов: ${seller.totalVolume}`);
      console.log(`   Ранг по объему: #${seller.totalVolumeRank}`);
    });
  }
}

// Запуск анализа
getP2PMarketData()
  .then(() => monitorCompetitors())
  .then(() => {
    console.log("\n\n✅ Анализ маркета завершен!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Критическая ошибка:", error);
    process.exit(1);
  });