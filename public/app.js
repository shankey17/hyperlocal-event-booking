// app.js — Search page logic only.
// Auth (login / signup / logout) is handled by inline scripts on each page.

// ── Helpers ───────────────────────────────────────────────────────────────────

function qs(id) { return document.getElementById(id); }

function showMessage(el, text, type = 'info') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.classList.remove('d-none');
}

function hideMessage(el) {
  if (el) el.classList.add('d-none');
}

// ── Venue card rendering ──────────────────────────────────────────────────────

function availabilityBadgeClass(status) {
  if (status === 'Available')    return 'bg-success';
  if (status === 'Fully Booked') return 'bg-danger';
  return 'bg-secondary';
}

function renderVenueCard(venue) {
  const roomItems = venue.rooms && venue.rooms.length
    ? venue.rooms.map(r => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${r.room_name}</strong>
            <div class="small text-muted">Room No: ${r.room_no} | Capacity: ${r.capacity}</div>
          </div>
          <span class="badge ${r.is_available ? 'text-bg-success' : 'text-bg-danger'}">
            ${r.is_available ? 'Available' : 'Booked'}
          </span>
        </li>`).join('')
    : '<li class="list-group-item text-muted">No rooms listed</li>';

  const amenityBadges = venue.amenities && venue.amenities.length
    ? venue.amenities.map(a => `<span class="badge text-bg-light border me-1 mb-1">${a}</span>`).join('')
    : '<span class="text-muted">None listed</span>';

  return `
    <div class="col-md-6 col-lg-4">
      <div class="card shadow-sm h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h5 class="card-title mb-1">${venue.name}</h5>
              <div class="text-muted small">${venue.city}, ${venue.state}</div>
            </div>
            <span class="badge ${availabilityBadgeClass(venue.availability_status)}">
              ${venue.availability_status}
            </span>
          </div>
          <hr>
          <p class="mb-1"><strong>Max Capacity:</strong> ${venue.max_capacity}</p>
          <p class="mb-1"><strong>Base Rate:</strong> ₹${venue.base_rate_per_hour}/hr</p>
          <p class="mb-1"><strong>Owner:</strong> ${venue.owner.name}</p>
          <p class="mb-1"><strong>Email:</strong> ${venue.owner.email}</p>
          <p class="mb-3"><strong>Phone:</strong> ${venue.owner.phone}</p>
          <div class="mb-3">
            <strong class="d-block mb-1">Amenities</strong>
            ${amenityBadges}
          </div>
          <div>
            <strong class="d-block mb-2">Rooms</strong>
            <ul class="list-group list-group-flush border rounded">${roomItems}</ul>
          </div>
          <div class="mt-3 small text-muted">
            Available rooms: ${venue.available_room_count} / ${venue.room_count}
          </div>
        </div>
      </div>
    </div>`;
}

// ── Search form ───────────────────────────────────────────────────────────────

async function searchVenues() {
  const results   = qs('venueResults');
  const statusMsg = qs('statusMsg');
  if (!results) return;

  const city   = qs('city')   ? qs('city').value.trim()   : '';
  const guests = qs('guests') ? qs('guests').value.trim() : '';
  const start  = qs('start')  ? qs('start').value.trim()  : '';
  const end    = qs('end')    ? qs('end').value.trim()    : '';

  if (!start || !end) {
    showMessage(statusMsg, 'Please select a start and end date/time.', 'warning');
    results.innerHTML = '';
    return;
  }

  hideMessage(statusMsg);
  results.innerHTML = '<div class="col-12"><div class="alert alert-secondary">Searching…</div></div>';

  try {
    const params = new URLSearchParams({ start, end });
    if (city)   params.set('city',   city);
    if (guests) params.set('guests', guests);

    const res  = await fetch(`/api/venues?${params}`);
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!res.ok) throw new Error(data.message || 'Failed to fetch venues.');

    if (!data.venues.length) {
      results.innerHTML = '<div class="col-12"><div class="alert alert-warning">No venues found for the selected filters.</div></div>';
      return;
    }

    results.innerHTML = data.venues.map(renderVenueCard).join('');

  } catch (err) {
    results.innerHTML = '';
    showMessage(statusMsg, err.message, 'danger');
  }
}

// ── Setup search page ─────────────────────────────────────────────────────────

const searchForm = qs('searchForm');
if (searchForm) {
  const resetBtn = qs('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (qs('guests')) qs('guests').value = '';
      if (qs('start'))  qs('start').value  = '';
      if (qs('end'))    qs('end').value    = '';
      const results = qs('venueResults');
      if (results) results.innerHTML = '';
      hideMessage(qs('statusMsg'));
    });
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await searchVenues();
  });
}
