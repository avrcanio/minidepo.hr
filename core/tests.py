import json

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import GEOSGeometry
from django.core.exceptions import ValidationError
from django.test import TestCase

from .models import AccessRoad, Container, ContainerUnit, Gate, Parcel, Site


class BaseModelTestCase(TestCase):
    def setUp(self):
        self.site = Site.objects.create(name="Depo Zagreb", slug="depo-zagreb")
        self.parcel = Parcel.objects.create(
            site=self.site,
            code="P-1",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[15.0, 45.0], [15.02, 45.0], [15.02, 45.02], [15.0, 45.02], [15.0, 45.0]]],
                    }
                ),
                srid=4326,
            ),
        )


class ModelTests(BaseModelTestCase):
    def test_create_related_models(self):
        container = Container.objects.create(
            parcel=self.parcel,
            code="C-1",
            size_label="40ft",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[15.001, 45.001], [15.005, 45.001], [15.005, 45.005], [15.001, 45.005], [15.001, 45.001]]],
                    }
                ),
                srid=4326,
            ),
        )
        AccessRoad.objects.create(
            site=self.site,
            code="ROAD-1",
            geometry=GEOSGeometry(
                json.dumps({"type": "LineString", "coordinates": [[15.0, 45.01], [15.02, 45.01]]}),
                srid=4326,
            ),
        )
        Gate.objects.create(
            site=self.site,
            code="GATE-1",
            geometry=GEOSGeometry(json.dumps({"type": "Point", "coordinates": [15.0, 45.0]}), srid=4326),
        )

        self.assertEqual(container.units.count(), 4)

    def test_container_must_be_within_parcel(self):
        container = Container(
            parcel=self.parcel,
            code="C-OUT",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[16.0, 46.0], [16.1, 46.0], [16.1, 46.1], [16.0, 46.1], [16.0, 46.0]]],
                    }
                ),
                srid=4326,
            ),
        )
        with self.assertRaises(ValidationError):
            container.full_clean()

    def test_unit_position_is_unique_per_container(self):
        container = Container.objects.create(
            parcel=self.parcel,
            code="C-2",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[15.006, 45.006], [15.01, 45.006], [15.01, 45.01], [15.006, 45.01], [15.006, 45.006]]],
                    }
                ),
                srid=4326,
            ),
        )
        with self.assertRaises(ValidationError):
            ContainerUnit(
                container=container,
                code="C-2-X",
                position=1,
                status=ContainerUnit.Status.FREE,
            ).full_clean()

    def test_derived_status_priority(self):
        container = Container.objects.create(
            parcel=self.parcel,
            code="C-3",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[15.011, 45.011], [15.015, 45.011], [15.015, 45.015], [15.011, 45.015], [15.011, 45.011]]],
                    }
                ),
                srid=4326,
            ),
        )
        first_unit = container.units.get(position=1)
        first_unit.status = ContainerUnit.Status.RESERVED
        first_unit.save()
        self.assertEqual(container.derived_status, ContainerUnit.Status.RESERVED)

        second_unit = container.units.get(position=2)
        second_unit.status = ContainerUnit.Status.OCCUPIED
        second_unit.save()
        self.assertEqual(container.derived_status, ContainerUnit.Status.OCCUPIED)

        third_unit = container.units.get(position=3)
        third_unit.status = ContainerUnit.Status.MAINTENANCE
        third_unit.save()
        self.assertEqual(container.derived_status, ContainerUnit.Status.MAINTENANCE)


class EndpointTests(BaseModelTestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="adminpass123",
        )
        self.client.force_login(self.user)
        self.container = Container.objects.create(
            parcel=self.parcel,
            code="C-10",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[15.001, 45.001], [15.004, 45.001], [15.004, 45.004], [15.001, 45.004], [15.001, 45.001]]],
                    }
                ),
                srid=4326,
            ),
        )

    def test_map_data_filters_by_site(self):
        other_site = Site.objects.create(name="Depo Split", slug="depo-split")
        Parcel.objects.create(
            site=other_site,
            code="P-2",
            geometry=GEOSGeometry(
                json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [[[16.0, 43.0], [16.02, 43.0], [16.02, 43.02], [16.0, 43.02], [16.0, 43.0]]],
                    }
                ),
                srid=4326,
            ),
        )
        response = self.client.get(f"/api/sites/{self.site.id}/map-data/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["parcels"]), 1)
        self.assertEqual(payload["parcels"][0]["site_id"], self.site.id)

    def test_container_save_rejects_geometry_outside_parcel(self):
        response = self.client.post(
            "/api/containers/",
            data=json.dumps(
                {
                    "parcel_id": self.parcel.id,
                    "code": "C-BAD",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[16.0, 46.0], [16.01, 46.0], [16.01, 46.01], [16.0, 46.01], [16.0, 46.0]]],
                    },
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unit_update_changes_derived_status(self):
        unit = self.container.units.get(position=1)
        response = self.client.post(
            f"/api/container-units/{unit.id}/",
            data=json.dumps({"status": "occupied", "area_m2": "8.50"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["container_status"], "occupied")
