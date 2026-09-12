# Handwriting fonts

Bundled locally so journal rendering works offline. All original glyphs retained in WOFF2 conversion. Each font is distributed under SIL Open Font License 1.1; the original license files accompany the fonts.

- brush.woff2 — Ma Shan Zheng: https://github.com/google/fonts/tree/main/ofl/mashanzheng
- pen.woff2 — Long Cang: https://github.com/google/fonts/tree/main/ofl/longcang
- script.woff2 — Caveat: https://github.com/google/fonts/tree/main/ofl/caveat

PNG export embeds only the used handwriting fonts. Unsupported characters fall back to the system font.

## Journal font pack v2

Eight additional locally bundled choices (six Chinese, two Latin):

| File | Font | Suggested use |
| --- | --- | --- |
| lxgw-wenkai.woff2 | LXGW WenKai GB Lite / 霞鹜文楷 GB 轻便版 | Natural handwritten diary text |
| chill-round.woff2 | ChillRoundF / 寒蝉全圆体 Regular | Rounded notes and cute captions |
| zcool-kuaile.woff2 | ZCOOL KuaiLe / 站酷快乐体 | Playful short headings |
| zcool-huangyou.woff2 | ZCOOL QingKe HuangYou / 站酷庆科黄油体 | Compact rounded titles and dates |
| zcool-xiaowei.woff2 | ZCOOL XiaoWei / 站酷小薇体 | Literary captions and quotations |
| noto-serif-sc.woff2 | Noto Serif SC Regular | Serif body text and magazine layouts |
| patrick-hand.woff2 | Patrick Hand | Casual English notes |
| dancing-script.woff2 | Dancing Script (400–700) | English script titles and dates |

Downloaded from the authors' releases and Google Fonts. Exact source URLs, pinned
versions, original and bundled SHA-256 hashes, glyph counts and conversion details
are recorded in [the source manifest](licenses/font-pack-v2-sources.json).
Corresponding OFL notices are retained in `licenses/`.

WOFF2 conversion retains all original glyphs and Unicode mappings. Noto Serif SC
uses a static weight-400 instance; Dancing Script retains its variable weight axis.
The GB Lite and display fonts do not cover every rare or traditional Chinese
character. Patrick Hand and Dancing Script contain Latin rather than Chinese
glyphs. All new choices use the existing Journal Pen Chinese fallback, which is
also embedded when producing PNG exports and 3D reading images. The font selector
keeps the existing IDs and defaults; adding this pack does not restyle saved pages.
