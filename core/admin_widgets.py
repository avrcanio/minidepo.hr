import json

from django import forms
from django.contrib.gis.geos import GEOSGeometry
from django.forms.utils import flatatt
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from .models import AccessRoad, Container, Gate, Parcel, Site


class LeafletGeometryWidget(forms.Textarea):
    class Media:
        css = {
            "all": (
                "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
                "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css",
                "core/admin_leaflet_widget.css",
            )
        }
        js = (
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
            "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js",
            "core/admin_leaflet_widget.js",
        )

    def __init__(self, geom_type, attrs=None):
        attrs = attrs or {}
        attrs["data-geom-type"] = geom_type
        super().__init__(attrs)

    def format_value(self, value):
        if value in (None, "", []):
            return ""
        if hasattr(value, "geojson"):
            return value.geojson
        return value

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        context["widget"]["attrs"]["class"] = ((context["widget"]["attrs"].get("class") or "") + " leaflet-geometry-input").strip()
        context["widget"]["geometry_type"] = context["widget"]["attrs"].get("data-geom-type", "")
        return context

    def render(self, name, value, attrs=None, renderer=None):
        attrs = attrs or {}
        attrs["class"] = ((attrs.get("class") or "") + " leaflet-geometry-input").strip()
        attrs["data-geom-type"] = attrs.get("data-geom-type", self.attrs.get("data-geom-type", ""))
        formatted_value = self.format_value(value) or ""
        final_attrs = self.build_attrs(self.attrs, attrs)
        textarea = format_html(
            '<textarea name="{}"{}>{}</textarea>',
            name,
            mark_safe(flatatt(final_attrs)),
            formatted_value,
        )
        return format_html(
            '<div class="leaflet-geometry-widget" data-geom-type="{}"><div class="leaflet-geometry-map" id="{}_map"></div><details class="leaflet-geometry-raw"><summary>GeoJSON</summary>{}</details></div>',
            final_attrs.get("data-geom-type", ""),
            final_attrs.get("id", name),
            textarea,
        )


class BaseLeafletGeometryAdminForm(forms.ModelForm):
    geometry_field_name = None

    def _parse_geometry_value(self, field_name, required=True):
        raw_value = self.cleaned_data.get(field_name)
        if not raw_value:
            if required:
                raise forms.ValidationError("Geometrija je obavezna.")
            return None

        if isinstance(raw_value, GEOSGeometry):
            geometry = raw_value
        else:
            geometry = GEOSGeometry(raw_value)

        if geometry.srid is None:
            geometry.srid = 4326
        elif geometry.srid != 4326:
            geometry.transform(4326)
        return geometry


class SiteAdminForm(BaseLeafletGeometryAdminForm):
    center = forms.CharField(widget=LeafletGeometryWidget("Point"), required=False)

    class Meta:
        model = Site
        fields = "__all__"

    def clean_center(self):
        return self._parse_geometry_value("center", required=False)


class ParcelAdminForm(BaseLeafletGeometryAdminForm):
    geometry = forms.CharField(widget=LeafletGeometryWidget("Polygon"))

    class Meta:
        model = Parcel
        fields = "__all__"

    def clean_geometry(self):
        return self._parse_geometry_value("geometry", required=True)


class ContainerAdminForm(BaseLeafletGeometryAdminForm):
    geometry = forms.CharField(widget=LeafletGeometryWidget("Polygon"))

    class Meta:
        model = Container
        fields = "__all__"

    def clean_geometry(self):
        return self._parse_geometry_value("geometry", required=True)


class AccessRoadAdminForm(BaseLeafletGeometryAdminForm):
    geometry = forms.CharField(widget=LeafletGeometryWidget("LineString"))

    class Meta:
        model = AccessRoad
        fields = "__all__"

    def clean_geometry(self):
        return self._parse_geometry_value("geometry", required=True)


class GateAdminForm(BaseLeafletGeometryAdminForm):
    geometry = forms.CharField(widget=LeafletGeometryWidget("Point"))

    class Meta:
        model = Gate
        fields = "__all__"

    def clean_geometry(self):
        return self._parse_geometry_value("geometry", required=True)
