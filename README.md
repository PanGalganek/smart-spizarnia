# Smart Spizarnia

Tabletowa aplikacja mobilna do zarzadzania domowa spizarnia. Projekt jest podzielony na niezalezne moduly: Skaner, Spizarnia, Posilki, Dzisiaj i Zapisane.

## Technologia

- Expo, React Native i TypeScript
- Firebase Authentication i Cloud Firestore
- Open Food Facts API
- Expo Router

## Uruchomienie

1. Zainstaluj Node.js LTS i Git.
2. Skopiuj `.env.example` do `.env` i uzupelnij dane projektu Firebase.
3. W Firebase wlacz logowanie Email/Password i utworz jednego uzytkownika tabletu.
4. Utworz baze Firestore i opublikuj reguly z `firestore.rules`.
5. Uruchom `npm install`, a potem `npm run android`.

## Struktura projektu

- `app/` - routing i wejscia ekranow
- `src/features/scanner/` - aparat, kody kreskowe i Open Food Facts
- `src/features/pantry/` - aktualny stan produktow
- `src/features/meals/` - kreator i historia posilkow
- `src/features/today/` - dziennik i podsumowanie odzywcze dnia
- `src/features/saved/` - katalog zapisanych produktow
- `src/services/` - komunikacja z Firebase i zewnetrznym API
- `src/domain/` - wspolne modele danych
- `src/core/` - logowanie, wyglad i wspolne komponenty

## Kolekcje Firestore

- `products/{barcode}` - dane produktu z API lub wpisane recznie
- `pantry/{barcode}` - produkt, ilosc, jednostka, data waznosci, lokalizacja i status
- `meals/{mealId}` - typ posilku, data, skladniki z ilosciami oraz podsumowanie odzywcze
- `dailySummaries/{YYYY-MM-DD}` - dzienna suma kcal, makro i liczba posilkow

Reguly Firestore ograniczaja odczyt i zapis do jednego, wskazanego konta tabletu. Samodzielna rejestracja nowych uzytkownikow jest wylaczona.

Utworzenie posilku, odjecie wszystkich skladnikow i aktualizacja podsumowania dnia sa jedna transakcja Firestore. Cofniecie posilku atomowo przywraca te same ilosci i odejmuje wartosci posilku od podsumowania dnia.

## Licznik kalorii i posilki

Produkty moga byc przechowywane w gramach, mililitrach albo sztukach. Kazdy wpis spizarni zawiera ilosc, jednostke, termin waznosci, lokalizacje i status. Dane odzywcze pochodza z Open Food Facts albo sa uzupelniane recznie.

Kreator posilkow wybiera produkty bezposrednio ze spizarni, blokuje ilosc wieksza od dostepnej i na zywo sumuje kcal, bialko, tluszcz oraz weglowodany. Dla produktu liczonego na 100 g uzycie jednostki `szt` wymaga podania rzeczywistej masy jednej sztuki.

Ekran Dzisiaj pokazuje posilki, ich skladniki, kalorie oraz dzienna sume. Cofniecie posilku przywraca dokladnie wykorzystane ilosci do spizarni.

## Weryfikacja

Uruchom `npm test`, `npm run typecheck` oraz testowe pakowanie Expo dla platform `web` i `android`. Testy obejmuja obliczenia kcal, jednostki, odejmowanie stanu, blokowanie nadmiernego zuzycia, oznaczenie produktu jako zuzyty, cofanie posilku i brak danych kalorycznych.

Do testow na fizycznym tablecie pozostaja aparat, ergonomia dotykowa oraz zachowanie przy chwilowej utracie sieci.
