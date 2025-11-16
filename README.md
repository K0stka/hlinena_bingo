# Cracker pro Hliněná Bingo

**Web:** https://havel06.github.io/hlinena_bingo/

## Použití

Pro použití vložte do konzole následující kód:

```js
fetch("https://bingo.krychlic.com")
	.then((r) => r.text())
	.then(eval);
```

Po spuštění se na stránce objeví:

-   **Tlačítko Reset** (vpravo dole) – vymaže uložený postup a znovu načte stránku
-   **Panel hledání** (vlevo dole) – umožňuje vybrat 4 slova a najít seed, kde tvoří výherní řadu

Bohužel jsem nenašel způsob, jak scriptu umožnit přežít obnovení stránky, takže po nalezení výherního seedu se nezobrazí konfety. Na druhou stranu díky tomu, jak script funguje, je po obnovení stránky nemožné jej detekovat.
