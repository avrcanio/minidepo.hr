import json

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.gis.geos import GEOSGeometry
from django.http import HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_http_methods

from .models import AccessRoad, Container, ContainerUnit, Gate, Parcel, Site


def _geometry_to_dict(geometry):
    return json.loads(geometry.geojson)


def _site_payload(site):
    center = None
    if site.center:
        center = {"lat": site.center.y, "lng": site.center.x}
    return {
        "id": site.id,
        "name": site.name,
        "slug": site.slug,
        "description": site.description,
        "address": site.address,
        "center": center,
    }


def _parcel_payload(parcel):
    return {
        "id": parcel.id,
        "code": parcel.code,
        "site_id": parcel.site_id,
        "notes": parcel.notes,
        "is_active": parcel.is_active,
        "geometry": _geometry_to_dict(parcel.geometry),
    }


def _container_payload(container):
    return {
        "id": container.id,
        "code": container.code,
        "parcel_id": container.parcel_id,
        "site_id": container.parcel.site_id,
        "size_label": container.size_label,
        "notes": container.notes,
        "status": container.derived_status,
        "geometry": _geometry_to_dict(container.geometry),
        "units": [
            {
                "id": unit.id,
                "code": unit.code,
                "position": unit.position,
                "status": unit.status,
                "area_m2": str(unit.area_m2),
                "notes": unit.notes,
            }
            for unit in container.units.all()
        ],
    }


def _access_road_payload(road):
    return {
        "id": road.id,
        "code": road.code,
        "site_id": road.site_id,
        "width_m": str(road.width_m),
        "notes": road.notes,
        "geometry": _geometry_to_dict(road.geometry),
    }


def _gate_payload(gate):
    return {
        "id": gate.id,
        "code": gate.code,
        "site_id": gate.site_id,
        "gate_type": gate.gate_type,
        "notes": gate.notes,
        "geometry": _geometry_to_dict(gate.geometry),
    }


def _parse_geometry(payload):
    geometry = payload.get("geometry")
    if not geometry:
        raise ValueError("Geometry is required.")
    return GEOSGeometry(json.dumps(geometry), srid=4326)


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body.") from exc


def index(request):
    return redirect("backoffice")


@require_GET
def health(request):
    return JsonResponse({"status": "ok"})


@login_required
def backoffice(request):
    return render(
        request,
        "core/backoffice.html",
        {
            "google_maps_api_key": settings.GOOGLE_MAPS_API_KEY,
            "unit_statuses": [{"value": value, "label": label} for value, label in ContainerUnit.Status.choices],
            "gate_types": [{"value": value, "label": label} for value, label in Gate.GateType.choices],
        },
    )


@login_required
@require_GET
def site_list(request):
    sites = Site.objects.filter(is_active=True).order_by("name")
    return JsonResponse({"results": [_site_payload(site) for site in sites]})


@login_required
@require_GET
def map_data(request, site_id):
    site = get_object_or_404(Site, pk=site_id)
    parcels = Parcel.objects.filter(site=site).order_by("code")
    containers = Container.objects.filter(parcel__site=site).select_related("parcel").prefetch_related("units")
    roads = AccessRoad.objects.filter(site=site).order_by("code")
    gates = Gate.objects.filter(site=site).order_by("code")
    return JsonResponse(
        {
            "site": _site_payload(site),
            "parcels": [_parcel_payload(parcel) for parcel in parcels],
            "containers": [_container_payload(container) for container in containers],
            "access_roads": [_access_road_payload(road) for road in roads],
            "gates": [_gate_payload(gate) for gate in gates],
        }
    )


@login_required
@require_http_methods(["POST"])
def parcel_save(request, pk=None):
    try:
        payload = _json_body(request)
        parcel = get_object_or_404(Parcel, pk=pk) if pk else Parcel()
        parcel.site = get_object_or_404(Site, pk=payload["site_id"])
        parcel.code = payload["code"]
        parcel.notes = payload.get("notes", "")
        parcel.is_active = payload.get("is_active", True)
        parcel.geometry = _parse_geometry(payload)
        parcel.save()
        return JsonResponse(_parcel_payload(parcel))
    except (KeyError, ValueError) as exc:
        return HttpResponseBadRequest(str(exc))
    except Exception as exc:
        return HttpResponseBadRequest(str(exc))


@login_required
@require_http_methods(["POST"])
def container_save(request, pk=None):
    try:
        payload = _json_body(request)
        container = get_object_or_404(Container, pk=pk) if pk else Container()
        container.parcel = get_object_or_404(Parcel, pk=payload["parcel_id"])
        container.code = payload["code"]
        container.size_label = payload.get("size_label", "")
        container.notes = payload.get("notes", "")
        container.geometry = _parse_geometry(payload)
        container.save()
        return JsonResponse(_container_payload(container))
    except (KeyError, ValueError) as exc:
        return HttpResponseBadRequest(str(exc))
    except Exception as exc:
        return HttpResponseBadRequest(str(exc))


@login_required
@require_http_methods(["POST"])
def access_road_save(request, pk=None):
    try:
        payload = _json_body(request)
        road = get_object_or_404(AccessRoad, pk=pk) if pk else AccessRoad()
        road.site = get_object_or_404(Site, pk=payload["site_id"])
        road.code = payload["code"]
        road.width_m = payload.get("width_m", "5.00")
        road.notes = payload.get("notes", "")
        road.geometry = _parse_geometry(payload)
        road.save()
        return JsonResponse(_access_road_payload(road))
    except (KeyError, ValueError) as exc:
        return HttpResponseBadRequest(str(exc))
    except Exception as exc:
        return HttpResponseBadRequest(str(exc))


@login_required
@require_http_methods(["POST"])
def gate_save(request, pk=None):
    try:
        payload = _json_body(request)
        gate = get_object_or_404(Gate, pk=pk) if pk else Gate()
        gate.site = get_object_or_404(Site, pk=payload["site_id"])
        gate.code = payload["code"]
        gate.gate_type = payload.get("gate_type", Gate.GateType.PRIMARY)
        gate.notes = payload.get("notes", "")
        gate.geometry = _parse_geometry(payload)
        gate.save()
        return JsonResponse(_gate_payload(gate))
    except (KeyError, ValueError) as exc:
        return HttpResponseBadRequest(str(exc))
    except Exception as exc:
        return HttpResponseBadRequest(str(exc))


@login_required
@require_http_methods(["POST"])
def unit_save(request, pk):
    try:
        payload = _json_body(request)
        unit = get_object_or_404(ContainerUnit, pk=pk)
        unit.code = payload.get("code", unit.code)
        unit.status = payload["status"]
        unit.area_m2 = payload.get("area_m2", unit.area_m2)
        unit.notes = payload.get("notes", "")
        unit.save()
        return JsonResponse(
            {
                "unit": {
                    "id": unit.id,
                    "code": unit.code,
                    "position": unit.position,
                    "status": unit.status,
                    "area_m2": str(unit.area_m2),
                    "notes": unit.notes,
                },
                "container_status": unit.container.derived_status,
            }
        )
    except (KeyError, ValueError) as exc:
        return HttpResponseBadRequest(str(exc))
    except Exception as exc:
        return HttpResponseBadRequest(str(exc))
