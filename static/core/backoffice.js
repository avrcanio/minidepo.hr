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
    selectedGeometry: null,
    selectedObject: null,
    selectedOverlay: null,
    map: null,
    drawingManager: null,
    overlays: [],
  };

  function setStatus(text) {
    statusPill.textContent = text;
  }

  function getCookie(name) {
    const cookie = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
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

  function clearOverlays() {
    state.overlays.forEach((overlay) => overlay.setMap(null));
    state.overlays = [];
  }

  function geometryToPath(geometry) {
    if (geometry.type === "Polygon") {
      return geometry.coordinates[0].map(([lng, lat]) => ({ lng, lat }));
    }
    if (geometry.type === "LineString") {
      return geometry.coordinates.map(([lng, lat]) => ({ lng, lat }));
    }
    if (geometry.type === "Point") {
      return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
    }
    return null;
  }

  function overlayToGeometry(kind, overlay) {
    if (kind === "parcel" || kind === "container") {
      const path = overlay.getPath().getArray().map((point) => [point.lng(), point.lat()]);
      path.push([path[0][0], path[0][1]]);
      return { type: "Polygon", coordinates: [path] };
    }
    if (kind === "road") {
      const path = overlay.getPath().getArray().map((point) => [point.lng(), point.lat()]);
      return { type: "LineString", coordinates: path };
    }
    if (kind === "gate") {
      const position = overlay.getPosition();
      return { type: "Point", coordinates: [position.lng(), position.lat()] };
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

    unitEditor.innerHTML = container.units.map((unit) => `
      <div class="unit-card">
        <h3>${unit.code}</h3>
        <label>Status</label>
        <select data-unit-status="${unit.id}">
          ${unitStatuses.map((status) => `<option value="${status.value}" ${status.value === unit.status ? "selected" : ""}>${status.label}</option>`).join("")}
        </select>
        <label>Površina (m2)</label>
        <input data-unit-area="${unit.id}" type="number" step="0.01" value="${unit.area_m2}">
        <label>Napomena</label>
        <textarea data-unit-notes="${unit.id}" rows="2">${unit.notes || ""}</textarea>
        <button type="button" data-unit-save="${unit.id}">Spremi jedinicu</button>
      </div>
    `).join("");

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
          reloadSiteData();
          setStatus("Jedinica spremljena");
        } catch (error) {
          setStatus(`Greška: ${error.message}`);
        }
      });
    });
  }

  function attachOverlayEvents(overlay, kind, feature) {
    const syncGeometry = () => {
      if (state.selectedOverlay === overlay) {
        state.selectedGeometry = overlayToGeometry(kind, overlay);
      }
    };

    overlay.addListener("click", () => {
      state.selectedKind = kind;
      state.selectedObject = feature;
      state.selectedOverlay = overlay;
      syncGeometry();
      openFeatureForm(kind, feature);
      renderUnits(kind === "container" ? feature : null);
    });
    if (overlay.setEditable) {
      overlay.setEditable(true);
    }
    if (overlay.setDraggable && kind === "gate") {
      overlay.setDraggable(true);
    }
    if (overlay.getPath) {
      const path = overlay.getPath();
      path.addListener("set_at", syncGeometry);
      path.addListener("insert_at", syncGeometry);
      path.addListener("remove_at", syncGeometry);
    }
    if (overlay.addListener && kind === "gate") {
      overlay.addListener("dragend", syncGeometry);
    }
  }

  function drawFeature(feature, kind) {
    let overlay = null;
    if (kind === "parcel") {
      overlay = new google.maps.Polygon({
        paths: geometryToPath(feature.geometry),
        strokeColor: "#0f766e",
        fillColor: "#67e8f9",
        fillOpacity: 0.25,
        map: state.map,
      });
    } else if (kind === "container") {
      overlay = new google.maps.Polygon({
        paths: geometryToPath(feature.geometry),
        strokeColor: statusColor(feature.status),
        fillColor: statusColor(feature.status),
        fillOpacity: 0.35,
        map: state.map,
      });
    } else if (kind === "road") {
      overlay = new google.maps.Polyline({
        path: geometryToPath(feature.geometry),
        strokeColor: "#374151",
        strokeWeight: 4,
        map: state.map,
      });
    } else if (kind === "gate") {
      overlay = new google.maps.Marker({
        position: geometryToPath(feature.geometry),
        map: state.map,
        draggable: true,
      });
    }
    if (!overlay) {
      return;
    }
    state.overlays.push(overlay);
    attachOverlayEvents(overlay, kind, feature);
  }

  function updateParcelOptions() {
    const options = ['<option value="">Odaberi parcelu</option>']
      .concat(state.parcels.map((parcel) => `<option value="${parcel.id}">${parcel.code}</option>`));
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
    const center = data.site.center || { lat: 45.815, lng: 15.9819 };
    state.map.setCenter(center);
    state.map.setZoom(data.site.center ? 18 : 7);
    setStatus("Slojevi učitani");
  }

  function startDrawing(kind) {
    if (!state.siteId) {
      setStatus("Prvo odaberi lokaciju.");
      return;
    }
    state.selectedKind = kind;
    state.selectedObject = null;
    state.selectedOverlay = null;
    state.selectedGeometry = null;
    renderUnits(null);
    openFeatureForm(kind);
    let mode = null;
    if (kind === "parcel" || kind === "container") {
      mode = google.maps.drawing.OverlayType.POLYGON;
    } else if (kind === "road") {
      mode = google.maps.drawing.OverlayType.POLYLINE;
    } else if (kind === "gate") {
      mode = google.maps.drawing.OverlayType.MARKER;
    }
    state.drawingManager.setDrawingMode(mode);
    setStatus(`Crtanje: ${kind}`);
  }

  async function submitFeature(event) {
    event.preventDefault();
    if (!state.siteId) {
      setStatus("Odaberi lokaciju prije spremanja.");
      return;
    }
    if (!state.selectedKind || (!state.selectedGeometry && !state.selectedOverlay)) {
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
      geometry: state.selectedOverlay ? overlayToGeometry(kind, state.selectedOverlay) : state.selectedGeometry,
      site_id: state.siteId,
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
    state.map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: 45.815, lng: 15.9819 },
      zoom: 7,
      mapTypeId: "satellite",
      streetViewControl: false,
      fullscreenControl: true,
    });

    state.drawingManager = new google.maps.drawing.DrawingManager({
      drawingControl: false,
      polygonOptions: { editable: true, draggable: false },
      polylineOptions: { editable: true, draggable: false },
      markerOptions: { draggable: true },
    });
    state.drawingManager.setMap(state.map);

    google.maps.event.addListener(state.drawingManager, "overlaycomplete", (event) => {
      state.drawingManager.setDrawingMode(null);
      state.selectedGeometry = overlayToGeometry(state.selectedKind, event.overlay);
      state.overlays.push(event.overlay);
      attachOverlayEvents(event.overlay, state.selectedKind, {});
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
    }
  });

  drawButtons.forEach((button) => {
    button.addEventListener("click", () => startDrawing(button.getAttribute("data-draw")));
  });

  form.addEventListener("submit", submitFeature);

  window.initMinidepoMap = init;
})();
