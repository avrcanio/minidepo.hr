# AGENTS

## Authentication

- Za GitHub pristup preko `gh` CLI koristi postojeću konfiguraciju iz `/opt/stacks/hosts.yml`.
- Ne radi `gh auth login` u ovom projektu ako nije izričito potrebno; koristi deljeni `hosts.yml`.
- U dokumentaciji, skriptama i odgovorima navodi samo putanju do fajla, nikad sadržaj tokena.

## Working Rules

- Zadrži izmjene usko vezane uz korisnički zahtjev.
- Ne diraj nepovezane fajlove ili postojeće lokalne promjene.
- Ako mijenjaš ponašanje aplikacije, kratko navedi kako je promjena provjerena.
