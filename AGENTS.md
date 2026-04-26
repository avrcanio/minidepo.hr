# AGENTS

## Authentication

- Za GitHub pristup preko `gh` CLI koristi postojeću konfiguraciju iz `/opt/stacks/hosts.yml`.
- Ne radi `gh auth login` u ovom projektu ako nije izričito potrebno; koristi deljeni `hosts.yml`.
- U dokumentaciji, skriptama i odgovorima navodi samo putanju do fajla, nikad sadržaj tokena.

## Working Rules

- Zadrži izmjene usko vezane uz korisnički zahtjev.
- Ne diraj nepovezane fajlove ili postojeće lokalne promjene.
- Ako mijenjaš ponašanje aplikacije, kratko navedi kako je promjena provjerena.

## Language And Writing

- U korisničkim porukama, dokumentaciji i `.md` datotekama piši normalnim hrvatskim jezikom s dijakritikom: `č`, `ć`, `š`, `ž`, `đ`.
- ASCII bez dijakritike koristi samo kad je tehnički nužan, npr. u kodu, nazivima varijabli, shell naredbama, konfiguracijskim ključevima ili kad postojeća datoteka izričito traži takav format.
