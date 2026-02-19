/**
 * TASK-0.5 — Test corpus: 50 Russian-language facts
 *
 * Coverage:
 *   - All 9 fact_types: location, workplace, relationship, event, preference, health, date, financial, other
 *   - Linguistic challenges: standard (~20), colloquial (~10), diminutive (~5), mixed Ru-En (~10), transliteration (~5)
 */

export interface CorpusFact {
  id: string;
  content: string;
  fact_type: string;
  tags: string[]; // linguistic challenge tags
}

export const corpus: CorpusFact[] = [
  // ===== STANDARD RUSSIAN (~20) =====
  { id: "f01", content: "Живёт в Мюнхене", fact_type: "location", tags: ["standard"] },
  { id: "f02", content: "Работает программистом в Яндексе", fact_type: "workplace", tags: ["standard"] },
  { id: "f03", content: "Дима — лучший друг со школы", fact_type: "relationship", tags: ["standard"] },
  { id: "f04", content: "Сын пошёл в первый класс в сентябре", fact_type: "event", tags: ["standard"] },
  { id: "f05", content: "Предпочитает итальянскую кухню", fact_type: "preference", tags: ["standard"] },
  { id: "f06", content: "Аллергия на арахис", fact_type: "health", tags: ["standard"] },
  { id: "f07", content: "День рождения 15 марта", fact_type: "date", tags: ["standard"] },
  { id: "f08", content: "Должен Мише 5000 рублей", fact_type: "financial", tags: ["standard"] },
  { id: "f09", content: "Учит испанский язык", fact_type: "other", tags: ["standard"] },
  { id: "f10", content: "Жена работает врачом в городской больнице", fact_type: "relationship", tags: ["standard"] },
  { id: "f11", content: "Планирует переехать в Берлин весной", fact_type: "location", tags: ["standard"] },
  { id: "f12", content: "Занимается бегом по утрам", fact_type: "preference", tags: ["standard"] },
  { id: "f13", content: "Мама живёт в Казани", fact_type: "relationship", tags: ["standard"] },
  { id: "f14", content: "Купил новую квартиру в ипотеку", fact_type: "financial", tags: ["standard"] },
  { id: "f15", content: "Перенёс операцию на колене в январе", fact_type: "health", tags: ["standard"] },
  { id: "f16", content: "Годовщина свадьбы 20 июня", fact_type: "date", tags: ["standard"] },
  { id: "f17", content: "Вегетарианец уже три года", fact_type: "preference", tags: ["standard"] },
  { id: "f18", content: "Ездил в Турцию в отпуск в августе", fact_type: "event", tags: ["standard"] },
  { id: "f19", content: "Кот по кличке Барсик", fact_type: "other", tags: ["standard"] },
  { id: "f20", content: "Сестра Маша учится в университете", fact_type: "relationship", tags: ["standard"] },

  // ===== COLLOQUIAL RUSSIAN (~10) =====
  { id: "f21", content: "Сынуля ходит в садик", fact_type: "event", tags: ["colloquial"] },
  { id: "f22", content: "Жена бесится от его храпа", fact_type: "relationship", tags: ["colloquial"] },
  { id: "f23", content: "Бабуля печёт обалденные пирожки", fact_type: "relationship", tags: ["colloquial"] },
  { id: "f24", content: "Задолбался на работе, хочет уволиться", fact_type: "workplace", tags: ["colloquial"] },
  { id: "f25", content: "Тачку поцарапал на парковке", fact_type: "event", tags: ["colloquial"] },
  { id: "f26", content: "Батя рыбачит каждые выходные", fact_type: "relationship", tags: ["colloquial"] },
  { id: "f27", content: "Подсел на сериальчики по вечерам", fact_type: "preference", tags: ["colloquial"] },
  { id: "f28", content: "Скинул пять кило за месяц", fact_type: "health", tags: ["colloquial"] },
  { id: "f29", content: "Корешу Лёхе стукнуло тридцатник", fact_type: "date", tags: ["colloquial"] },
  { id: "f30", content: "Накопил на отпуск, едет на море", fact_type: "financial", tags: ["colloquial"] },

  // ===== DIMINUTIVE FORMS (~5) =====
  { id: "f31", content: "Димуля работает в финтехе", fact_type: "workplace", tags: ["diminutive"] },
  { id: "f32", content: "Доченька Сонечка ходит на танцы", fact_type: "event", tags: ["diminutive"] },
  { id: "f33", content: "Котик Мурзик любит сметанку", fact_type: "other", tags: ["diminutive"] },
  { id: "f34", content: "Мамочка приезжает в гости на недельку", fact_type: "event", tags: ["diminutive"] },
  { id: "f35", content: "Братик Ванечка играет на гитарочке", fact_type: "relationship", tags: ["diminutive"] },

  // ===== MIXED RUSSIAN-ENGLISH (~10) =====
  { id: "f36", content: "Работает в Google как senior engineer", fact_type: "workplace", tags: ["mixed"] },
  { id: "f37", content: "Подписка на Netflix за 15 евро в месяц", fact_type: "financial", tags: ["mixed"] },
  { id: "f38", content: "Использует MacBook Pro для работы", fact_type: "other", tags: ["mixed"] },
  { id: "f39", content: "Ходит в фитнес-клуб World Class три раза в неделю", fact_type: "preference", tags: ["mixed"] },
  { id: "f40", content: "Слушает подкаст Lex Fridman каждую неделю", fact_type: "preference", tags: ["mixed"] },
  { id: "f41", content: "Прошёл курс Machine Learning на Coursera", fact_type: "other", tags: ["mixed"] },
  { id: "f42", content: "Играет в PlayStation по выходным с друзьями", fact_type: "preference", tags: ["mixed"] },
  { id: "f43", content: "Жена ведёт блог на YouTube про рецепты", fact_type: "relationship", tags: ["mixed"] },
  { id: "f44", content: "Заказывает еду через Delivery Club", fact_type: "preference", tags: ["mixed"] },
  { id: "f45", content: "Читает Telegram-каналы про AI и стартапы", fact_type: "preference", tags: ["mixed"] },

  // ===== TRANSLITERATION (~5) =====
  { id: "f46", content: "Любит Макдональдс, особенно биг-мак", fact_type: "preference", tags: ["transliteration"] },
  { id: "f47", content: "Пьёт латте с овсяным молоком из Старбакса", fact_type: "preference", tags: ["transliteration"] },
  { id: "f48", content: "Ездит на Фольксваген Гольф", fact_type: "other", tags: ["transliteration"] },
  { id: "f49", content: "Снимает квартиру через Эйрбнб в поездках", fact_type: "preference", tags: ["transliteration"] },
  { id: "f50", content: "Фанат Барселоны, смотрит каждый матч", fact_type: "preference", tags: ["transliteration"] },
];
