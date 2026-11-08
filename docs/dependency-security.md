# Stan zależności — 8 listopada 2026

| Pozycje raportu npm audit | Przed zmianą | Po zmianie |
| --- | ---: | ---: |
| Krytyczne | 1 | 0 |
| Wysokie | 21 | 1 |
| Umiarkowane | 31 | 26 |
| Niskie | 1 | 1 |
| Łącznie | 54 | 28 |

Są to pozycje pakietów w raporcie, w tym zależności pośrednie i narzędzia programistyczne. Jeden problem może być wykazany także przy pakietach nadrzędnych. Wynik nie jest liczbą niezależnych, potwierdzonych sposobów zaatakowania aplikacji. Raport zmienia się wraz z bazą zgłoszeń npm.

## Wprowadzone aktualizacje

- Zaktualizowano zgodne wersje zależności w pliku blokady, m.in. shell-quote, Vitest/Vite, parsowanie adresów, XML i YAML oraz narzędzia przeglądarkowe.
- Dopasowano pakiety do Expo SDK 53: Expo Router `~5.1.11`, React Native `0.79.6`, react-native-screens `~4.11.1` i AsyncStorage `2.1.2`.
- Dodano jawną zależność `query-string` 9.5.1 i wąski adapter eksportów dla forka Expo Router 5. Nowsza nawigacja nie dostarcza już tej zależności pośrednio. Adapter zachowuje oczekiwane metody bez powrotu do podatnego dekodera URI; testy obejmują polskie znaki, tablice, brakujące wartości i nieprawidłowe kodowanie adresu.
- W zakresie `@firebase/firestore` przypięto `@grpc/grpc-js` do `1.13.6`. Firebase 11 wymaga starej gałęzi `~1.9.0`, dlatego sama aktualizacja pliku blokady nie usuwała zgłoszeń. Wybrano poprawioną wersję w obrębie głównej wersji 1 i zweryfikowano testy emulatora. Nie obniżano Firebase do starej wersji sugerowanej przez automatyczną naprawę audytu.
- W zakresie `@expo/metro-config` przypięto PostCSS `8.5.32`, zachowując główną wersję 8. Przypięcia są jawne w `package.json` i wymagają ponownego sprawdzenia przy migracji Expo/Firebase.

Poprawione wersje gRPC opisują [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) i [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4).

## Pozostały problem wysoki: image-size

Metro używane przez SDK 53 wywołuje `image-size` 1 jako funkcję CommonJS. Poprawione `image-size` 2.0.3 zmienia ten interfejs, dlatego wymuszenie wersji 2 bez migracji Metro przerwałoby budowanie obrazów.

`metro.config.js` wyłącza parsery ICNS, kontenerowego JXL i HEIF przez publiczne `disableTypes` na instancji pakietu używanej przez Metro. To ograniczenie narzędzia budowania; nie zmienia obrazów produktów pobieranych przez aplikację. Test `metroAssets.test.ts` uruchamia proces z limitem czasu i sprawdza odrzucanie specjalnie przygotowanych nieprawidłowych danych tych trzech formatów oraz poprawny odczyt PNG.

Zgłoszenie wysokie **pozostaje w npm audit**, ponieważ jest oparte na numerze wersji. Jest to jawnie udokumentowane ograniczenie z zabezpieczeniem dla używanej ścieżki Metro, a nie deklaracja naprawienia całej biblioteki ani usunięcia zgłoszenia. Źródła: [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [API biblioteki](https://github.com/image-size/image-size/blob/main/Readme.md#disabling-certain-image-types).

## Kontrola w CI i dalszy zakres

`npm run audit:security` blokuje każde zgłoszenie krytyczne i wysokie poza dwoma konkretnymi zgłoszeniami image-size powyżej. Nowe zgłoszenie wysokie przy image-size również zatrzyma kontrolę. Raport wszystkich poziomów pozostaje widoczny. Sprawdzenie nie przechodzi w przypadku niedostępności raportu npm.

Testy aplikacji (w tym ochrona parserów), emulator reguł i kontrola typów nadal są obowiązkowe. Pakowanie web i Android sprawdza zgodność narzędzi po aktualizacji. Nie zastępuje to testów aparatu i nawigacji na fizycznym tablecie.

Pozostałe zgłoszenia umiarkowane/niskie dotyczą głównie łańcuchów narzędzi Expo i Firebase CLI, m.in. glob/minimatch, uuid, deepmerge i OpenTelemetry. Ten pakiet nie usuwa ich i nie wymusza niezgodnych głównych wersji zależności pośrednich. Dalsza migracja SDK wymaga osobnego sprawdzenia zmian Expo, React Native, Routera i narzędzi budowania, zgodnie z [zaleceniami Expo](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
