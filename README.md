# minidepo.hr

GeoDjango backoffice za upravljanje lokacijama, parcelama, kontejnerima i jedinicama unutar kontejnera, spojen na postojeći shared Docker `postgis` container.

## Pokretanje

```bash
docker compose build web
docker compose up -d web
```

Aplikacija je dostupna na `http://127.0.0.1:8010/`.

## Prvi login

Napravi administratorskog korisnika:

```bash
docker exec -it minidepo_web python manage.py createsuperuser
```

Nakon logina:

- `http://127.0.0.1:8010/admin/` za Django admin
- `http://127.0.0.1:8010/backoffice/` za Google Maps GIS backoffice

## Baza

- koristi postojeći Docker container `postgis`
- zasebna aplikacijska baza: `minidepo`
- `postgis` extension se bootstrap-a kroz `scripts/bootstrap_db.sh`
