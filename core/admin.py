from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from .models import AccessRoad, Container, ContainerUnit, Gate, Parcel, Site


@admin.register(Site)
class SiteAdmin(GISModelAdmin):
    list_display = ("name", "slug", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "address")


@admin.register(Parcel)
class ParcelAdmin(GISModelAdmin):
    list_display = ("code", "site", "is_active")
    list_filter = ("site", "is_active")
    search_fields = ("code", "site__name")


class ContainerUnitInline(admin.TabularInline):
    model = ContainerUnit
    extra = 0


@admin.register(Container)
class ContainerAdmin(GISModelAdmin):
    list_display = ("code", "parcel", "derived_status", "size_label")
    list_filter = ("parcel__site", "parcel")
    search_fields = ("code", "parcel__code", "parcel__site__name")
    inlines = [ContainerUnitInline]


@admin.register(ContainerUnit)
class ContainerUnitAdmin(admin.ModelAdmin):
    list_display = ("code", "container", "position", "status", "area_m2")
    list_filter = ("status", "container__parcel__site")
    search_fields = ("code", "container__code")


@admin.register(AccessRoad)
class AccessRoadAdmin(GISModelAdmin):
    list_display = ("code", "site", "width_m")
    list_filter = ("site",)
    search_fields = ("code", "site__name")


@admin.register(Gate)
class GateAdmin(GISModelAdmin):
    list_display = ("code", "site", "gate_type")
    list_filter = ("site", "gate_type")
    search_fields = ("code", "site__name")
