(function () {
  const unitStatuses = JSON.parse(document.getElementById("unit-statuses-data").textContent);
  const statusPill = document.getElementById("status-pill");
  const siteSelect = document.getElementById("site-select");
  const siteMeta = document.getElementById("site-meta");
  const form = document.getElementById("feature-form");
  const unitEditor = document.getElementById("unit-editor");
  const parentSelect = document.getElementById("feature-parent");
  const drawButtons = document.querySelectorAll("[data-draw]");

  const state = {
    siteId: null,
    parcels: [],
    containers: [],
    roads: [],
    gates: [],
    selectedKind: null,
    selectedObject: null,
    selectedOverlay: null,
    map: null,
    featureLayer: null,
    overlays: [],
    drawControl: null,
  };

  function setStatus(text) {
    statusPill.textContent = text;
  }

  function getCookie(name) {
    const cookie = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
        ...(options.headers || {}),
      },
      credentials: "same-origin",
      ...options,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }

  function statusColor(status) {
    return {
      free: "#3f8f4f",
      reserved: "#e08e2d",
      occupied: "#cc4b37",
      blocked: "#6b7280",
      maintenance: "#7c3aed",
    }[status] || "#2563eb";
  }

  function setSelectedOverlay(overlay, kind, feature) {
    if (state.selectedOverlay && state.selectedOverlay !== overlay) {
      disableEditing(state.selectedOverlay);
    }
    state.selectedOverlay = overlay;
    state.selectedKind = kind;
    state.selectedObject = feature || null;
    enableEditing(overlay);
    openFeatureForm(kind, feature);
    renderUnits(kind === "container" ? feature : null);
  }

  function clearOverlays() {
    disableEditing(state.selectedOverlay);
    state.selectedOverlay = null;
    state.selectedObject = null;
    state.selectedKind = null;
    state.overlays.forEach((overlay) => state.featureLayer.removeLayer(overlay));
    state.overlays = [];
  }

  function polygonLatLngsToGeometry(latlngs) {
    const ring = latlngs[0].map((latlng) => [latlng.lng, latlng.lat]);
    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
    }
    return { type: "Polygon", coordinates: [ring] };
  }

  function overlayToGeometry(kind, overlay) {
    if (kind === "parcel" || kind === "container") {
      return polygonLatLngsToGeometry(overlay.getLatLngs());
    }
    if (kind === "road") {
      return {
        type: "LineString",
        coordinates: overlay.getLatLngs().map((latlng) => [latlng.lng, latlng.lat]),
      };
    }
    if (kind === "gate") {
      const latlng = overlay.getLatLng();
      return { type: "Point", coordinates: [latlng.lng, latlng.lat] };
    }
    return null;
  }

  function openFeatureForm(kind, feature = null) {
    document.getElementById("feature-kind").value = kind || "";
    document.getElementById("feature-id").value = feature?.id || "";
    document.getElementById("feature-code").value = feature?.code || "";
    document.getElementById("feature-notes").value = feature?.notes || "";
    document.getElementById("feature-size").value = feature?.size_label || "";
    document.getElementById("feature-width").value = feature?.width_m || "5.00";
    document.getElementById("feature-gate-type").value = feature?.gate_type || "primary";
    parentSelect.value = feature?.parcel_id || "";
    parentSelect.disabled = kind !== "container";
    document.getElementById("feature-size").disabled = kind !== "container";
    document.getElementById("feature-width").disabled = kind !== "road";
    document.getElementById("feature-gate-type").disabled = kind !== "gate";
  }

  function renderUnits(container) {
    if (!container) {
      unitEditor.innerHTML = '<div class="muted">Odaberi kontejner za uređivanje jedinica.</div>';
      return;
    }

    unitEditor.innerHTML = container.units
      .map(
        (unit) => `
      <div class="unit-card">
        <h3>${unit.code}</h3>
        <label>Status</label>
        <select data-unit-status="${unit.id}">
          ${unitStatuses
            .map((status) => `<option value="${status.value}" ${status.value === unit.status ? "selected" : ""}>${status.label}</option>`)
            .join("")}
        </select>
        <label>Površina (m2)</label>
        <input data-unit-area="${unit.id}" type="number" step="0.01" value="${unit.area_m2}">
        <label>Napomena</label>
        <textarea data-unit-notes="${unit.id}" rows="2">${unit.notes || ""}</textarea>
        <button type="button" data-unit-save="${unit.id}">Spremi jedinicu</button>
      </div>
    `,
      )
      .join("");

    unitEditor.querySelectorAll("[data-unit-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const unitId = button.getAttribute("data-unit-save");
        const payload = {
          status: unitEditor.querySelector(`[data-unit-status="${unitId}"]`).value,
          area_m2: unitEditor.querySelector(`[data-unit-area="${unitId}"]`).value,
          notes: unitEditor.querySelector(`[data-unit-notes="${unitId}"]`).value,
        };
        try {
          setStatus("Spremam jedinicu...");
          const result = await request(`/api/container-units/${unitId}/`, { method: "POST", body: JSON.stringify(payload) });
          const current = state.containers.find((item) => item.id === container.id);
          const unit = current.units.find((item) => item.id === Number(unitId));
          unit.status = result.unit.status;
          unit.area_m2 = result.unit.area_m2;
          unit.notes = result.unit.notes;
          current.status = result.container_status;
          await reloadSiteData();
          setStatus("Jedinica spremljena");
        } catch (error) {
          setStatus(`Greška: ${error.message}`);
        }
      });
    });
  }

  function enableEditing(overlay) {
    if (overlay.editing && overlay.editing.enable) {
      overlay.editing.enable();
    }
    if (overlay.dragging && overlay.dragging.enable) {
      overlay.dragging.enable();
    }
  }

  function disableEditing(overlay) {
    if (!overlay) {
      return;
    }
    if (overlay.editing && overlay.editing.disable) {
      overlay.editing.disable();
    }
    if (overlay.dragging && overlay.dragging.disable) {
      overlay.dragging.disable();
    }
  }

  function attachOverlayEvents(overlay, kind, feature) {
    overlay.on("click", () => {
      setSelectedOverlay(overlay, kind, feature);
    });
    overlay.on("edit", () => {
      if (state.selectedOverlay === overlay) {
        state.selectedObject = feature;
      }
    });
    overlay.on("dragend", () => {
      if (state.selectedOverlay === overlay) {
        state.selectedObject = feature;
      }
    });
  }

  function pointToLatLng(geometry) {
    return [geometry.coordinates[1], geometry.coordinates[0]];
  }

  function lineToLatLngs(geometry) {
    return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }

  function polygonToLatLngs(geometry) {
    return geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lat, lng]);
  }

  function drawFeature(feature, kind) {
    let overlay = null;

    if (kind === "parcel") {
      overlay = L.polygon(polygonToLatLngs(feature.geometry), {
        color: "#0f766e",
        weight: 2,
        fillColor: "#67e8f9",
        fillOpacity: 0.2,
      });
    } else if (kind === "container") {
      const color = statusColor(feature.status);
      overlay = L.polygon(polygonToLatLngs(feature.geometry), {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.35,
      });
    } else if (kind === "road") {
      overlay = L.polyline(lineToLatLngs(feature.geometry), {
        color: "#374151",
        weight: 4,
      });
    } else if (kind === "gate") {
      overlay = L.marker(pointToLatLng(feature.geometry), { draggable: true });
    }

    if (!overlay) {
      return;
    }

    overlay.featureKind = kind;
    overlay.featureData = feature;
    state.featureLayer.addLayer(overlay);
    state.overlays.push(overlay);
    attachOverlayEvents(overlay, kind, feature);
  }

  function updateParcelOptions() {
    const options = ['<option value="">Odaberi parcelu</option>'].concat(
      state.parcels.map((parcel) => `<option value="${parcel.id}">${parcel.code}</option>`),
    );
    parentSelect.innerHTML = options.join("");
  }

  async function reloadSiteData() {
    if (!state.siteId) {
      return;
    }
    setStatus("Učitavam GIS slojeve...");
    const data = await request(`/api/sites/${state.siteId}/map-data/`);
    state.parcels = data.parcels;
    state.containers = data.containers;
    state.roads = data.access_roads;
    state.gates = data.gates;
    siteMeta.textContent = [data.site.name, data.site.address].filter(Boolean).join(" · ");
    clearOverlays();
    updateParcelOptions();
    state.parcels.forEach((item) => drawFeature(item, "parcel"));
    state.containers.forEach((item) => drawFeature(item, "container"));
    state.roads.forEach((item) => drawFeature(item, "road"));
    state.gates.forEach((item) => drawFeature(item, "gate"));

    const center = data.site.center ? [data.site.center.lat, data.site.center.lng] : [45.815, 15.9819];
    state.map.setView(center, data.site.center ? 18 : 7);
    setStatus("Slojevi učitani");
  }

  function startDrawing(kind) {
    if (!state.siteId) {
      setStatus("Prvo odaberi lokaciju.");
      return;
    }

    disableEditing(state.selectedOverlay);
    state.selectedOverlay = null;
    state.selectedObject = null;
    state.selectedKind = kind;
    renderUnits(null);
    openFeatureForm(kind);

    let drawer = null;
    if (kind === "parcel" || kind === "container") {
      drawer = new L.Draw.Polygon(state.map, {
        shapeOptions: {
          color: kind === "parcel" ? "#0f766e" : "#2563eb",
          weight: 2,
        },
      });
    } else if (kind === "road") {
      drawer = new L.Draw.Polyline(state.map, {
        shapeOptions: { color: "#374151", weight: 4 },
      });
    } else if (kind === "gate") {
      drawer = new L.Draw.Marker(state.map);
    }

    if (drawer) {
      drawer.enable();
      setStatus(`Crtanje: ${kind}`);
    }
  }

  async function submitFeature(event) {
    event.preventDefault();
    if (!state.siteId) {
      setStatus("Odaberi lokaciju prije spremanja.");
      return;
    }
    if (!state.selectedKind || !state.selectedOverlay) {
      setStatus("Nacrtaj ili odaberi objekt na karti.");
      return;
    }

    const kind = document.getElementById("feature-kind").value;
    const featureId = document.getElementById("feature-id").value;
    const code = document.getElementById("feature-code").value;
    const notes = document.getElementById("feature-notes").value;
    const payload = {
      code,
      notes,
      geometry: overlayToGeometry(kind, state.selectedOverlay),
      site_id: Number(state.siteId),
    };

    if (kind === "container") {
      payload.parcel_id = Number(parentSelect.value);
      payload.size_label = document.getElementById("feature-size").value;
      if (!payload.parcel_id) {
        setStatus("Za kontejner odaberi parcelu.");
        return;
      }
    }
    if (kind === "road") {
      payload.width_m = document.getElementById("feature-width").value || "5.00";
    }
    if (kind === "gate") {
      payload.gate_type = document.getElementById("feature-gate-type").value;
    }

    let url = "";
    if (kind === "parcel") {
      url = featureId ? `/api/parcels/${featureId}/` : "/api/parcels/";
    } else if (kind === "container") {
      url = featureId ? `/api/containers/${featureId}/` : "/api/containers/";
    } else if (kind === "road") {
      url = featureId ? `/api/access-roads/${featureId}/` : "/api/access-roads/";
    } else if (kind === "gate") {
      url = featureId ? `/api/gates/${featureId}/` : "/api/gates/";
    }

    try {
      setStatus("Spremam objekt...");
      await request(url, { method: "POST", body: JSON.stringify(payload) });
      await reloadSiteData();
      setStatus("Objekt spremljen");
    } catch (error) {
      setStatus(`Greška: ${error.message}`);
    }
  }

  async function init() {
    state.map = L.map("map", {
      center: [45.815, 15.9819],
      zoom: 7,
      zoomControl: true,
    });

    const imagery = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 20,
      },
    ).addTo(state.map);

    const labels = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Labels &copy; Esri",
        maxZoom: 20,
        pane: "overlayPane",
      },
    ).addTo(state.map);

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
    ).addTo(state.map);

    state.featureLayer = L.featureGroup().addTo(state.map);

    state.map.on(L.Draw.Event.CREATED, (event) => {
      const overlay = event.layer;
      overlay.featureKind = state.selectedKind;
      state.featureLayer.addLayer(overlay);
      state.overlays.push(overlay);
      attachOverlayEvents(overlay, state.selectedKind, {});
      setSelectedOverlay(overlay, state.selectedKind, {});
      setStatus("Geometrija spremna. Unesi detalje i klikni Spremi objekt.");
    });

    const data = await request("/api/sites/");
    data.results.forEach((site) => {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = site.name;
      siteSelect.appendChild(option);
    });
  }

  siteSelect.addEventListener("change", async (event) => {
    state.siteId = event.target.value;
    renderUnits(null);
    if (state.siteId) {
      await reloadSiteData();
    } else {
      clearOverlays();
      updateParcelOptions();
      siteMeta.textContent = "Odaberi lokaciju za učitavanje slojeva.";
      state.map.setView([45.815, 15.9819], 7);
    }
  });

  drawButtons.forEach((button) => {
    button.addEventListener("click", () => startDrawing(button.getAttribute("data-draw")));
  });

  form.addEventListener("submit", submitFeature);

  window.addEventListener("load", init);
})();
