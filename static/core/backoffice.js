(function () {
  const unitStatuses = JSON.parse(document.getElementById("unit-statuses-data").textContent);
  const statusPill = document.getElementById("status-pill");
  const siteSelect = document.getElementById("site-select");
  const siteMeta = document.getElementById("site-meta");
  const form = document.getElementById("feature-form");
  const unitEditor = document.getElementById("unit-editor");
  const parentSelect = document.getElementById("feature-parent");
  const drawButtons = document.querySelectorAll("[data-draw]");
  const summaryParcels = document.getElementById("summary-parcels");
  const summaryContainers = document.getElementById("summary-containers");
  const summaryRoads = document.getElementById("summary-roads");
  const summaryGates = document.getElementById("summary-gates");
  const editLockToggle = document.getElementById("edit-lock-toggle");

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
    labels: [],
    editLocked: true,
  };

  function setStatus(text) {
    statusPill.textContent = text;
  }

  function syncEditingState() {
    drawButtons.forEach((button) => {
      button.disabled = state.editLocked;
    });
    Array.from(form.elements).forEach((field) => {
      if (field.id === "feature-id" || field.id === "feature-kind") {
        return;
      }
      field.disabled = state.editLocked;
    });
    unitEditor.querySelectorAll("input, select, textarea, button").forEach((field) => {
      field.disabled = state.editLocked;
    });
    if (state.drawingManager) {
      state.drawingManager.setDrawingMode(null);
    }
    state.overlays.forEach((overlay) => {
      if (overlay.setEditable) {
        overlay.setEditable(!state.editLocked && overlay.__minidepoKind !== "container");
      }
      if (overlay.setDraggable) {
        overlay.setDraggable(!state.editLocked && ["container", "gate"].includes(overlay.__minidepoKind));
      }
    });
    editLockToggle.textContent = state.editLocked ? "Uređivanje zaključano" : "Uređivanje otključano";
    editLockToggle.classList.toggle("is-locked", state.editLocked);
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

  function roadStrokeColor(feature) {
    return feature.code === "ROAD-002" ? "#2f343a" : "#4a5057";
  }

  function roadFillColor(feature) {
    return feature.code === "ROAD-002" ? "#565d66" : "#6a727c";
  }

  function roadZIndex(feature) {
    return feature.code === "ROAD-002" ? 60 : 40;
  }

  function clearOverlays() {
    state.overlays.forEach((overlay) => overlay.setMap(null));
    state.overlays = [];
    state.labels.forEach((label) => label.setMap(null));
    state.labels = [];
  }

  function updateSummary() {
    summaryParcels.textContent = state.parcels.length;
    summaryContainers.textContent = state.containers.length;
    summaryRoads.textContent = state.roads.length;
    summaryGates.textContent = state.gates.length;
  }

  function containerLabelVisible() {
    return state.map && state.map.getZoom() >= 19;
  }

  function updateLabelVisibility() {
    const showContainers = containerLabelVisible();
    state.labels.forEach((label) => {
      if (label.minZoom === 0) {
        label.setVisible(true);
        return;
      }
      label.setVisible(showContainers);
    });
  }

  function featureCenter(geometry) {
    if (geometry.type === "Point") {
      return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
    }
    const coordinates = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates[0];
    const totals = coordinates.reduce((acc, [lng, lat]) => {
      acc.lng += lng;
      acc.lat += lat;
      return acc;
    }, { lng: 0, lat: 0 });
    return {
      lng: totals.lng / coordinates.length,
      lat: totals.lat / coordinates.length,
    };
  }

  function addLabel(position, text, color, minZoom = 0) {
    const label = new google.maps.Marker({
      position,
      map: state.map,
      clickable: false,
      icon: {
        path: "M 0 0",
        scale: 0,
      },
      label: {
        text,
        color,
        fontSize: minZoom ? "11px" : "12px",
        fontWeight: "700",
      },
      zIndex: 2000,
    });
    label.minZoom = minZoom;
    state.labels.push(label);
  }

  function fitMapToFeatures() {
    const bounds = new google.maps.LatLngBounds();
    let hasGeometry = false;
    const extendWith = (geometry) => {
      if (geometry.type === "Point") {
        bounds.extend({ lng: geometry.coordinates[0], lat: geometry.coordinates[1] });
        hasGeometry = true;
        return;
      }
      const coordinates = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates[0];
      coordinates.forEach(([lng, lat]) => {
        bounds.extend({ lng, lat });
        hasGeometry = true;
      });
    };

    state.parcels.forEach((item) => extendWith(item.geometry));
    state.containers.forEach((item) => extendWith(item.geometry));
    state.roads.forEach((item) => extendWith(item.geometry));
    state.gates.forEach((item) => extendWith(item.geometry));

    if (hasGeometry) {
      state.map.fitBounds(bounds, 48);
    }
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
      overlay.setEditable(!state.editLocked && kind !== "container");
    }
    if (overlay.setDraggable && (kind === "gate" || kind === "container")) {
      overlay.setDraggable(!state.editLocked);
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
        strokeWeight: 2,
        fillColor: "#67e8f9",
        fillOpacity: 0.08,
        zIndex: 10,
        map: state.map,
      });
      addLabel(featureCenter(feature.geometry), feature.code, "#0f766e");
    } else if (kind === "container") {
      overlay = new google.maps.Polygon({
        paths: geometryToPath(feature.geometry),
        strokeColor: "#cfd4da",
        fillColor: "#d9dde2",
        strokeWeight: 1.5,
        fillOpacity: 1,
        zIndex: 20,
        draggable: true,
        map: state.map,
      });
      addLabel(featureCenter(feature.geometry), feature.code, "#1f2933", 19);
    } else if (kind === "road") {
      overlay = new google.maps.Polygon({
        paths: geometryToPath(feature.display_geometry || feature.geometry),
        strokeColor: roadStrokeColor(feature),
        strokeOpacity: 1,
        strokeWeight: 1.5,
        fillColor: roadFillColor(feature),
        fillOpacity: 1,
        zIndex: roadZIndex(feature),
        map: state.map,
      });
      addLabel(featureCenter(feature.geometry), `${feature.code} · ${feature.width_m} m`, feature.code === "ROAD-002" ? "#2f343a" : "#4a5057");
    } else if (kind === "gate") {
      overlay = new google.maps.Marker({
        position: geometryToPath(feature.geometry),
        map: state.map,
        draggable: true,
        label: {
          text: "ULAZ",
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#b85c38",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      addLabel(featureCenter(feature.geometry), feature.code, "#b85c38");
    }
    if (!overlay) {
      return;
    }
    overlay.__minidepoKind = kind;
    overlay.__minidepoFeature = feature;
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
    updateSummary();
    state.parcels.forEach((item) => drawFeature(item, "parcel"));
    state.containers.forEach((item) => drawFeature(item, "container"));
    state.roads.forEach((item) => drawFeature(item, "road"));
    state.gates.forEach((item) => drawFeature(item, "gate"));
    fitMapToFeatures();
    if (!state.parcels.length && !state.containers.length && !state.roads.length && !state.gates.length) {
      const center = data.site.center || { lat: 45.815, lng: 15.9819 };
      state.map.setCenter(center);
      state.map.setZoom(data.site.center ? 18 : 7);
    }
    updateLabelVisibility();
    syncEditingState();
    setStatus("Slojevi učitani");
  }

  function startDrawing(kind) {
    if (state.editLocked) {
      setStatus("Otključaj uređivanje za crtanje i izmjene.");
      return;
    }
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
    if (state.editLocked) {
      setStatus("Uređivanje je zaključano.");
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
      if (state.editLocked) {
        event.overlay.setMap(null);
        setStatus("Uređivanje je zaključano.");
        return;
      }
      state.drawingManager.setDrawingMode(null);
      state.selectedGeometry = overlayToGeometry(state.selectedKind, event.overlay);
      state.overlays.push(event.overlay);
      attachOverlayEvents(event.overlay, state.selectedKind, {});
      setStatus("Geometrija spremna. Unesi detalje i klikni Spremi objekt.");
    });

    state.map.addListener("zoom_changed", updateLabelVisibility);

    const data = await request("/api/sites/");
    data.results.forEach((site) => {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = site.name;
      siteSelect.appendChild(option);
    });
    if (data.results.length === 1) {
      siteSelect.value = data.results[0].id;
      state.siteId = data.results[0].id;
      await reloadSiteData();
    }
    syncEditingState();
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
  editLockToggle.addEventListener("click", () => {
    state.editLocked = !state.editLocked;
    syncEditingState();
    setStatus(state.editLocked ? "Uređivanje zaključano" : "Uređivanje otključano");
  });

  window.initMinidepoMap = init;
})();
