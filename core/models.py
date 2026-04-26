from decimal import Decimal

from django.contrib.gis.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.utils.text import slugify


class Site(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    center = models.PointField(srid=4326, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Parcel(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="parcels")
    code = models.CharField(max_length=80)
    geometry = models.PolygonField(srid=4326)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site__name", "code"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="unique_parcel_code_per_site"),
        ]

    def clean(self):
        if self.geometry and not self.geometry.valid:
            raise ValidationError({"geometry": "Geometrija parcele nije valjana."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.site.name} / {self.code}"


class Container(models.Model):
    parcel = models.ForeignKey(Parcel, on_delete=models.CASCADE, related_name="containers")
    code = models.CharField(max_length=80)
    geometry = models.PolygonField(srid=4326)
    size_label = models.CharField(max_length=40, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["parcel__site__name", "parcel__code", "code"]
        constraints = [
            models.UniqueConstraint(fields=["parcel", "code"], name="unique_container_code_per_parcel"),
        ]

    def clean(self):
        if self.geometry and not self.geometry.valid:
            raise ValidationError({"geometry": "Geometrija kontejnera nije valjana."})
        if self.geometry and self.parcel_id and self.parcel.geometry and not self.parcel.geometry.covers(self.geometry):
            raise ValidationError({"geometry": "Kontejner mora biti unutar pripadne parcele."})

    @property
    def derived_status(self):
        unit_statuses = list(self.units.values_list("status", flat=True))
        if not unit_statuses:
            return ContainerUnit.Status.FREE
        if ContainerUnit.Status.MAINTENANCE in unit_statuses:
            return ContainerUnit.Status.MAINTENANCE
        if all(status == ContainerUnit.Status.BLOCKED for status in unit_statuses):
            return ContainerUnit.Status.BLOCKED
        if all(status == ContainerUnit.Status.FREE for status in unit_statuses):
            return ContainerUnit.Status.FREE
        if ContainerUnit.Status.OCCUPIED in unit_statuses:
            return ContainerUnit.Status.OCCUPIED
        if ContainerUnit.Status.RESERVED in unit_statuses:
            return ContainerUnit.Status.RESERVED
        return ContainerUnit.Status.RESERVED

    def ensure_default_units(self):
        if self.units.exists():
            return
        for position in range(1, 5):
            ContainerUnit.objects.create(
                container=self,
                code=f"{self.code}-{position}/4",
                position=position,
                status=ContainerUnit.Status.FREE,
                area_m2=Decimal("0.00"),
            )

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        self.full_clean()
        super().save(*args, **kwargs)
        if is_new:
            self.ensure_default_units()

    def __str__(self):
        return f"{self.parcel} / {self.code}"


class ContainerUnit(models.Model):
    class Status(models.TextChoices):
        FREE = "free", "Slobodan"
        RESERVED = "reserved", "Rezerviran"
        OCCUPIED = "occupied", "Zauzet"
        BLOCKED = "blocked", "Blokiran"
        MAINTENANCE = "maintenance", "Servis"

    container = models.ForeignKey(Container, on_delete=models.CASCADE, related_name="units")
    code = models.CharField(max_length=80)
    position = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(4)])
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FREE)
    area_m2 = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["container__code", "position"]
        constraints = [
            models.UniqueConstraint(fields=["container", "code"], name="unique_unit_code_per_container"),
            models.UniqueConstraint(fields=["container", "position"], name="unique_unit_position_per_container"),
        ]

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.container.code} / {self.code}"


class AccessRoad(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="access_roads")
    code = models.CharField(max_length=80)
    geometry = models.LineStringField(srid=4326)
    width_m = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("5.00"))
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["site__name", "code"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="unique_access_road_code_per_site"),
        ]

    def clean(self):
        if self.geometry and not self.geometry.valid:
            raise ValidationError({"geometry": "Geometrija pristupnog puta nije valjana."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.site.name} / {self.code}"


class Gate(models.Model):
    class GateType(models.TextChoices):
        PRIMARY = "primary", "Glavni ulaz"
        SERVICE = "service", "Servisni ulaz"

    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="gates")
    code = models.CharField(max_length=80)
    geometry = models.PointField(srid=4326)
    gate_type = models.CharField(max_length=20, choices=GateType.choices, default=GateType.PRIMARY)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["site__name", "code"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="unique_gate_code_per_site"),
        ]

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.site.name} / {self.code}"
