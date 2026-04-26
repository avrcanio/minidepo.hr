# minidepo.hr

<p align="center">
  <img src="minidepologo.png" alt="minidepo.hr logo" width="220">
</p>

`minidepo.hr` je interni operativni sustav za planiranje i upravljanje self-storage lokacijom s kontejnerima. Projekt je razvijen kao `GeoDjango` aplikacija spojena na postojeći shared Docker `postgis` container i služi za prostorno upravljanje parcelama, kontejnerima, pristupnim putevima i ulazima.

## Opis projekta

Sustav je zamišljen kao radni alat za pripremu i vođenje lokacije:

- prikaz i uređivanje parcela na karti
- slaganje kontejnera po blokovima unutar parcele
- upravljanje jedinicama unutar kontejnera (`1/4`, `2/4`, `3/4`, cijeli kontejner)
- crtanje i pregled pristupnih puteva i gate ulaza
- priprema operativne podloge za faznu izvedbu projekta, troškovnike i budući najam

Trenutni fokus projekta je V1 interni GIS backoffice za organizaciju prostora i infrastrukture na lokaciji `minidepo.finestar.hr`.

## Pokretanje

```bash
docker compose build web
docker compose up -d web
```

Aplikacija je dostupna na `http://127.0.0.1:8010/`.
Kad je Traefik route aktivan, javni URL je `https://minidepo.finestar.hr/`.

## Prvi login

Napravi administratorskog korisnika:

```bash
docker exec -it minidepo_web python manage.py createsuperuser
```

Nakon logina:

- `http://127.0.0.1:8010/admin/` za Django admin
- `http://127.0.0.1:8010/backoffice/` za GIS backoffice kartu

## Baza

- koristi postojeći Docker container `postgis`
- zasebna aplikacijska baza: `minidepo`
- `postgis` extension se bootstrap-a kroz `scripts/bootstrap_db.sh`

## Glavni moduli

- `Site` za upravljanje lokacijama
- `Parcel` za GIS prikaz i obradu parcela
- `Container` za fizičke kontejnere na lokaciji
- `ContainerUnit` za jedinice unutar kontejnera
- `AccessRoad` za glavne i pomoćne prometne koridore
- `Gate` za ulaze na parcelu
