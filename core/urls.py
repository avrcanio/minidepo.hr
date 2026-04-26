from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("health/", views.health, name="health"),
    path("backoffice/", views.backoffice, name="backoffice"),
    path("api/sites/", views.site_list, name="site-list"),
    path("api/sites/<int:site_id>/map-data/", views.map_data, name="map-data"),
    path("api/parcels/", views.parcel_save, name="parcel-create"),
    path("api/parcels/<int:pk>/", views.parcel_save, name="parcel-update"),
    path("api/containers/", views.container_save, name="container-create"),
    path("api/containers/<int:pk>/", views.container_save, name="container-update"),
    path("api/access-roads/", views.access_road_save, name="access-road-create"),
    path("api/access-roads/<int:pk>/", views.access_road_save, name="access-road-update"),
    path("api/gates/", views.gate_save, name="gate-create"),
    path("api/gates/<int:pk>/", views.gate_save, name="gate-update"),
    path("api/container-units/<int:pk>/", views.unit_save, name="container-unit-update"),
]
