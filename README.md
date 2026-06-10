# Smart Spizarnia

Tabletowa aplikacja mobilna do zarzadzania domowa spizarnia. Projekt jest podzielony na niezalezne moduly: Skaner, Spizarnia, Posilki i Zapisane.

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
- `src/features/saved/` - katalog zapisanych produktow
- `src/services/` - komunikacja z Firebase i zewnetrznym API
- `src/domain/` - wspolne modele danych
- `src/core/` - logowanie, wyglad i wspolne komponenty

## Kolekcje Firestore

- `products/{barcode}` - dane produktu z API lub wpisane recznie
- `pantry/{barcode}` - produkt i aktualna ilosc
- `meals/{mealId}` - posilek, skladniki i podsumowanie odzywcze

Zmiana stanu produktu jest transakcja Firestore, co chroni licznik przed przypadkowym nadpisaniem. Zapis posilku i odjecie wszystkich jego skladnikow powinny byc jedna transakcja.

## Stan pierwszej wersji

Gotowe sa: trwale logowanie, ekran czterech kafelkow, skanowanie aparatem, reczne wpisanie kodu, pobieranie danych Open Food Facts, formularz produktu spoza API, dodawanie i odejmowanie sztuk oraz listy spizarni i zapisanych produktow.

Kreator posilkow wybiera produkty bezposrednio ze spizarni, na zywo sumuje kcal i skladniki odzywcze, a podczas zapisu transakcyjnie odejmuje wszystkie wykorzystane produkty. Jezeli API nie podaje masy opakowania, kalkulator przyjmuje 100 g na sztuke.

Historia posilkow pokazuje skladniki i podsumowanie odzywcze. Pozwala zmienic nazwe posilku oraz usunac wpis z wyborem, czy zuzyte produkty maja zostac zwrocone do spizarni.

Do kolejnej iteracji pozostaja: edycja danych produktow, historia zmian stanu oraz testy aparatu i interfejsu na fizycznym tablecie.

Projekt przechodzi `npm run typecheck` oraz testowe pakowanie `expo export --platform android`.
