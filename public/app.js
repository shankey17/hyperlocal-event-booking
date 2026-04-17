// ── Helpers ───────────────────────────────────────────────────────────────────

function qs(id) {
  return document.getElementById(id);
}

function showMessage(el, text, type = 'info') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.classList.remove('d-none');
}

function hideMessage(el) {
  if (el) el.classList.add('d-none');
}

// ── Homepage: Enquiry / Signup form ──────────────────────────────────────────

function setupSignupForm() {
  const form = qs('signupForm');
  if (!form) return; // not on the homepage

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = qs('signupMsg');
    hideMessage(msg);

    const payload = {
      fullName:      qs('fullName').value.trim(),
      email:         qs('email').value.trim(),
      phone:         qs('phone').value.trim(),
      preferredCity: qs('preferredCity').value.trim(),
      eventType:     qs('eventType').value.trim()
    };

    try {
      const res  = await fetch('/api/signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Signup failed');

      // Save preferences so the search page can pre-fill city / event type
      localStorage.setItem('hyperlocal_preferred_city', payload.preferredCity);
      localStorage.setItem('hyperlocal_event_type',     payload.eventType);

      showMessage(msg, 'Enquiry saved! Redirecting to venue search…', 'success');
      setTimeout(() => { window.location.href = '/search'; }, 900);

    } catch (err) {
      showMessage(msg, err.message, 'danger');
    }
  });
}

// ── Search page: Venue cards ──────────────────────────────────────────────────

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

async function searchVenues() {
  const results  = qs('venueResults');
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

    if (!res.ok) throw new Error(data.message || 'Failed to fetch venues');

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

// ── Search page: setup ────────────────────────────────────────────────────────

function setupSearchPage() {
  const searchForm = qs('searchForm');
  if (!searchForm) return; // not on the search page

  // Pre-fill city from localStorage if set by signup form
  const savedCity      = localStorage.getItem('hyperlocal_preferred_city') || '';
  const savedEventType = localStorage.getItem('hyperlocal_event_type')     || '';

  if (qs('city') && savedCity)           qs('city').value      = savedCity;
  if (qs('eventType') && savedEventType) qs('eventType').value = savedEventType;

  // Reset button clears results and fields
  const resetBtn = qs('loadAllBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (qs('city'))   qs('city').value   = savedCity;
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

// ── Boot ──────────────────────────────────────────────────────────────────────
setupSignupForm();
setupSearchPage();
