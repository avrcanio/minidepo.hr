(function () {
  function parseValue(value) {
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function serializeLayer(type, layer) {
    if (type === "Polygon") {
      const ring = layer.getLatLngs()[0].map((latlng) => [latlng.lng, latlng.lat]);
      if (ring.length) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push([first[0], first[1]]);
        }
      }
      return { type: "Polygon", coordinates: [ring] };
    }
    if (type === "LineString") {
      return {
        type: "LineString",
        coordinates: layer.getLatLngs().map((latlng) => [latlng.lng, latlng.lat]),
      };
    }
    if (type === "Point") {
      const latlng = layer.getLatLng();
      return { type: "Point", coordinates: [latlng.lng, latlng.lat] };
    }
    return null;
  }

  function geoJsonToLayer(geometry, type) {
    if (!geometry) {
      return null;
    }
    if (type === "Polygon") {
      return L.polygon(
        geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lat, lng]),
        { color: "#2563eb", weight: 2 },
      );
    }
    if (type === "LineString") {
      return L.polyline(
        geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        { color: "#374151", weight: 4 },
      );
    }
    if (type === "Point") {
      return L.marker([geometry.coordinates[1], geometry.coordinates[0]], { draggable: true });
    }
    return null;
  }

  function setupWidget(widget) {
    const textarea = widget.querySelector("textarea");
    const mapNode = widget.querySelector(".leaflet-geometry-map");
    const type = widget.dataset.geomType || textarea.dataset.geomType;
    const map = L.map(mapNode, { center: [45.815, 15.9819], zoom: 16 });

    const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 20,
    }).addTo(map);

    const labels = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Labels &copy; Esri", maxZoom: 20 },
    ).addTo(map);

    const light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; CARTO",
      subdomains: "abcd",
      maxZoom: 20,
    });

    L.control.layers(
      {
        "Esri Satellite": imagery,
        "Carto Light": light,
      },
      {
        "Esri Labels": labels,
      },
      { position: "topright" },
    ).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    let currentLayer = null;

    function syncTextarea() {
      textarea.value = currentLayer ? JSON.stringify(serializeLayer(type, currentLayer)) : "";
    }

    function attachLayer(layer) {
      if (currentLayer) {
        drawnItems.removeLayer(currentLayer);
      }
      currentLayer = layer;
      drawnItems.addLayer(layer);
      if (layer.editing && layer.editing.enable) {
        layer.editing.enable();
      }
      if (layer.dragging && layer.dragging.enable) {
        layer.dragging.enable();
      }
      if (layer.on) {
        layer.on("edit", syncTextarea);
        layer.on("dragend", syncTextarea);
      }
      syncTextarea();
      const bounds = layer.getBounds ? layer.getBounds() : L.latLngBounds([layer.getLatLng()]);
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25));
      }
    }

    const initialGeometry = parseValue(textarea.value);
    if (initialGeometry) {
      const layer = geoJsonToLayer(initialGeometry, type);
      if (layer) {
        attachLayer(layer);
      }
    }

    const drawOptions = {
      edit: { featureGroup: drawnItems, edit: true, remove: true },
      draw: {
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: type === "Point",
        polygon: type === "Polygon",
        polyline: type === "LineString",
      },
    };

    if (type === "Point") {
      drawOptions.draw.marker = true;
      drawOptions.draw.polygon = false;
      drawOptions.draw.polyline = false;
    }

    const drawControl = new L.Control.Draw(drawOptions);
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (event) => {
      attachLayer(event.layer);
    });

    map.on(L.Draw.Event.EDITED, syncTextarea);
    map.on(L.Draw.Event.DELETED, () => {
      currentLayer = null;
      syncTextarea();
    });

    setTimeout(() => map.invalidateSize(), 100);
  }

  window.addEventListener("load", () => {
    document.querySelectorAll(".leaflet-geometry-widget").forEach(setupWidget);
  });
})();
