// Small recognizable motifs for common subjects when the library lacks a match.
// The model still chooses the subject, placement, colour and surrounding layout.
export function stickerPath(text='') {
  if(/咖啡|coffee|拿铁|latte|cappuccino/i.test(text)) return 'M18 38 H67 V68 Q67 85 43 85 Q18 85 18 68 Z M67 44 H77 Q92 44 88 59 Q85 70 67 67 M12 89 H78 M30 28 C18 18 42 15 30 5 M50 28 C38 18 62 15 50 5';
  if(/绿植|浇水|植物|plant|watering/i.test(text)) return 'M27 64 H73 L65 92 H35 Z M23 58 H77 V65 H23 Z M50 58 V20 M50 43 Q15 46 17 20 Q44 18 50 43 M50 31 Q83 32 81 8 Q54 8 50 31';
  if(/明信片|postcard|信封|envelope|邮票/i.test(text)) return 'M8 20 H92 V80 H8 Z M53 25 V75 M68 27 H84 V44 H68 Z M15 35 H43 M15 44 H43 M15 53 H37 M61 55 H84 M61 64 H84';
  if(/礼物|礼品|gift|present|金镯/i.test(text)) return 'M18 43 H82 V91 H18 Z M12 32 H88 V45 H12 Z M44 33 H56 V91 H44 Z M50 32 Q12 30 24 12 Q38 0 50 32 M50 32 Q88 30 76 12 Q62 0 50 32';
  if(/牛排|吃饭|餐|steak|dinner|meal/i.test(text)) return 'M28 50 A28 28 0 1 0 84 50 A28 28 0 1 0 28 50 M35 50 A21 21 0 1 0 77 50 A21 21 0 1 0 35 50 M9 12 V37 Q15 48 21 37 V12 M15 12 V90 M94 12 V90';
  return undefined;
}
