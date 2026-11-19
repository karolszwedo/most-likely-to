# Wygląd gry: G2 Grafit + Blurple + D1 (S-25)

## Źródło

- Trzy galerie zrzutów Karola, 2026-11-19 (decyzje w `change.md`): runda 2 wybrała tło **G2 Grafit**, kolor **6 Blurple** (`oklch(0.6 0.2 277)`, biały napis) i głębię **D1** (płasko z cieniem), runda 3 (pełne ekrany, Dziś obok Nowego) dostała „git”.
- Generatory zrzutów poza repo: `shots2.mjs` i `shots3.mjs` w katalogu roboczym sesji (`BASES.g2`, `ACCENTS[5]`, `SHAPES`, `themeCss`). Wartości niżej to `themeCss("g2", 5)` z poprawką kontrastu A.
- **Poprawka A** (`research.md`, zarzut C1): Blurple 0,6 z białym napisem miał 4,19:1, jako tekst na karcie 3,65:1, a fokus przy 50% 1,88:1. Żadna jedna jasność nie spełnia obu progów, więc Blurple dostał trzy role: `--primary` (wypełnienie guzika, L 0,6 → 0,58), nowy `--primary-text` (tekst i linki) i osobny `--ring` (fokus); `--input` L 0,56 → 0,59 (obwódka pola na `muted` i `secondary`).
- Kształty z planera Karola (`C:\Users\karol\planer\context\archive\2026-11-17-look-and-feel-basics\theme.md`): `--radius: 1rem`, przyciski i plakietki jako pigułki, pola z tłem `muted` i obwódką 1,5 px, karty bez obwódki z cieniem `--shadow-card`, czcionka Manrope (Faza 1).
- Linia ze źródłem stoi w `src/styles/global.css` nad blokiem `.dark`; poprzedni kontrakt: `context/archive/2026-10-04-ui-signin-contract/theme.md`.

## Wartości: `.dark` (gra jest zawsze ciemna)

Barwa bazy 265, Blurple 277. `--sidebar-*` i `--chart-1..20` (kolory graczy) bez zmian.

```css
.dark {
  --background: oklch(0.215 0.008 265); /* #18191d */
  --foreground: oklch(0.96 0.004 265);
  --card: oklch(0.265 0.008 265);
  --card-foreground: oklch(0.96 0.004 265);
  --popover: oklch(0.265 0.008 265);
  --popover-foreground: oklch(0.96 0.004 265);
  --primary: oklch(0.58 0.2 277); /* poprawka A: 0.6 → 0.58 */
  --primary-foreground: oklch(1 0 0);
  --primary-text: oklch(0.76 0.12 277); /* nowy: Blurple jako tekst i link */
  --secondary: oklch(0.32 0.012 265);
  --secondary-foreground: oklch(0.96 0.004 265);
  --muted: oklch(0.31 0.012 265);
  --muted-foreground: oklch(0.74 0.012 265);
  --accent: oklch(0.328 0.046 275.4); /* 20% --primary w --card, OKLab */
  --accent-foreground: oklch(0.96 0.004 265);
  --destructive: oklch(0.72 0.16 25);
  --border: oklch(0.325 0.012 265);
  --input: oklch(0.59 0.016 265); /* poprawka A: 0.56 → 0.59 */
  --ring: oklch(0.84 0.08 277); /* poprawka A: osobny jasny Blurple */
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.35), 0 10px 28px -8px oklch(0 0 0 / 0.55); /* D1 */
}
```

- `:root`: tylko `--radius: 1rem` (wcześniej 0.75rem). Skala bez zmian: `rounded-sm` 12 px, `rounded-md` 14 px, `rounded-lg` 16 px, `rounded-xl` 20 px. Jasna paleta w `:root` nie trafia na ekran (C5, deferred).
- `--accent`: galeria liczyła go `color-mix(in oklab, Blurple 20%, card)`; strażnik czyta tylko `oklch(…)`, więc wartość jest zapisana na stałe. Z Blurple 0,58 wychodzi `oklch(0.3280 0.0463 275.35)` (z 0,6 było `oklch(0.332 0.046 275.4)`, jak w planie); w pliku zaokrąglone do `oklch(0.328 0.046 275.4)`.
- `@theme inline`: `--color-primary-text` (klasa `text-primary-text`) i `--shadow-card` (klasa `shadow-card`, wzór planera).
- Tło `#18191d` żyje też poza tokenem, w siedmiu miejscach z komentarza przy `theme-color` w `src/layouts/Layout.astro` (C4).

## Kształty

- Przyciski: pigułka (`rounded-full` w bazie i rozmiarach `sm`/`lg` w `button.tsx`), te same wysokości. Guzik, którego tekst może się łamać (`HostActions`, pytanie w `RemovePlayerButton`, `FOLD_LINE` w `QuestionProposals`), ma `rounded-lg`: w jednej linijce wygląda jak pigułka, w kilku jak zaokrąglone pudełko. Plakietki: pigułka (shadcn). Warianty `link`: `text-primary-text`.
- Pola (`input`, `textarea`, `input-group`) i pusty checkbox: tło `muted` (`dark:bg-muted` zamiast `dark:bg-input/30`), obwódka `border-input` 1,5 px (`border-[1.5px]`), ta sama wysokość; fokus `ring-ring/50`.
- Karty (`card.tsx`, `alert.tsx`) bez obwódki, z `shadow-card`; karty rysowane w widokach biorą `SURFACE` z `src/components/room/surfaces.ts` (`bg-card rounded-xl shadow-card`); panele emotek i czatu od `xl` z `shadow-card` zamiast obwódki.
- Ikonka gry 32 px na `/`: `rounded-sm` (12 px), żeby została kwadratem. Przełącznik Koło/Paski: ramka `rounded-full`.
- Listy-kafelki i tabela wyniku bez linii: Faza 3.

## Kontrast

Liczy `scripts/contrast.mjs` w `npm run lint` (OKLCH → OKLab → XYZ → liniowe sRGB, macierze CSS Color 4, warstwa z alfą mieszana w sRGB, wzór WCAG 2). Progi: tekst 4,5:1; obwódka pola, fokus i kropka gracza 3:1. Wszystkie 68 par przechodzą bez wyjątków.

| Para                                 | Ratio | Próg | Gdzie                               |
| ------------------------------------ | ----- | ---- | ----------------------------------- |
| `foreground` / `background`          | 15,60 | 4,5  | tekst na stronie                    |
| `card-foreground` / `card`           | 13,63 | 4,5  | tekst na karcie                     |
| `popover-foreground` / `popover`     | 13,63 | 4,5  |                                     |
| `foreground` / `muted`               | 11,72 | 4,5  | tekst w polu                        |
| `foreground` / `accent`              | 11,04 | 4,5  | zaznaczony kafelek                  |
| `muted-foreground` / `background`    | 7,59  | 4,5  | tekst pomocniczy                    |
| `muted-foreground` / `card`          | 6,63  | 4,5  |                                     |
| `muted-foreground` / `muted`         | 5,71  | 4,5  | podpowiedź (placeholder) w polu     |
| `primary-foreground` / `primary`     | 4,56  | 4,5  | biały napis na guziku Blurple       |
| `primary-foreground` / `primary/90`  | 5,23  | 4,5  | ten sam guzik pod kursorem          |
| `secondary-foreground` / `secondary` | 11,30 | 4,5  |                                     |
| `accent-foreground` / `accent`       | 11,04 | 4,5  |                                     |
| `primary-text` / `background`        | 7,99  | 4,5  | Blurple jako tekst i link           |
| `primary-text` / `card`              | 6,98  | 4,5  |                                     |
| `primary-text` / `muted`             | 6,01  | 4,5  |                                     |
| `primary-text` / `accent`            | 5,66  | 4,5  |                                     |
| `destructive` / `background`         | 6,59  | 4,5  | błędy                               |
| `destructive` / `card`               | 5,76  | 4,5  |                                     |
| `foreground` / `card` + `primary/35` | 9,18  | 4,5  | pasek najwyższego wyniku za nickiem |
| `foreground` / `card` + `primary/20` | 11,01 | 4,5  | pozostałe paski                     |
| `ring/50` / `background`             | 3,61  | 3    | fokus                               |
| `ring/50` / `card`                   | 3,43  | 3    |                                     |
| `ring/50` / `muted`                  | 3,18  | 3    |                                     |
| `ring/50` / `accent`                 | 3,09  | 3    |                                     |
| `input` / `background`               | 4,26  | 3    | obwódka pola                        |
| `input` / `card`                     | 3,72  | 3    |                                     |
| `input` / `muted`                    | 3,20  | 3    |                                     |
| `input` / `secondary`                | 3,09  | 3    |                                     |

Kolory graczy (`chart-N`, próg 3; wartości bez zmian, zmienił się tylko komentarz w `global.css` z 3,5:1 na próg WCAG 3:1, który liczy strażnik):

| Kolor      | `card` | `background` | Kolor      | `card` | `background` |
| ---------- | ------ | ------------ | ---------- | ------ | ------------ |
| `chart-1`  | 6,80   | 7,78         | `chart-11` | 5,65   | 6,47         |
| `chart-2`  | 4,36   | 4,99         | `chart-12` | 4,62   | 5,29         |
| `chart-3`  | 4,21   | 4,82         | `chart-13` | 9,99   | 11,44        |
| `chart-4`  | 7,64   | 8,74         | `chart-14` | 4,75   | 5,43         |
| `chart-5`  | 3,70   | 4,24         | `chart-15` | 9,62   | 11,02        |
| `chart-6`  | 5,50   | 6,29         | `chart-16` | 3,37   | 3,85         |
| `chart-7`  | 7,99   | 9,14         | `chart-17` | 8,29   | 9,49         |
| `chart-8`  | 3,43   | 3,92         | `chart-18` | 3,83   | 4,38         |
| `chart-9`  | 7,00   | 8,01         | `chart-19` | 3,38   | 3,87         |
| `chart-10` | 5,59   | 6,40         | `chart-20` | 9,19   | 10,51        |

Poza strażnikiem (świadomie): biały napis na guziku `destructive` (2,66–3,11:1, problem sprzed restylu, research C1 deferred).
