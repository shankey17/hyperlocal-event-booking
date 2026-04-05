function qs(id) {
  return document.getElementById(id);
}

function setMessage(el, text, type = 'info') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.classList.remove('d-none');
}

function hideMessage(el) {
  if (!el) return;
  el.classList.add('d-none');
}

async function submitSignupIfPresent() {
  const form = qs('signupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      fullName: qs('fullName').value.trim(),
      email: qs('email').value.trim(),
      phone: qs('phone').value.trim(),
      preferredCity: qs('preferredCity').value.trim(),
      eventType: qs('eventType').value.trim()
    };

    const msg = qs('signupMsg');
    hideMessage(msg);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Signup failed');

      localStorage.setItem('hyperlocal_preferred_city', payload.preferredCity);
      localStorage.setItem('hyperlocal_event_type', payload.eventType);

      setMessage(msg, 'Enquiry saved successfully. Redirecting to search page...', 'success');

      setTimeout(() => {
        window.location.href = '/search';
      }, 900);
    } catch (error) {
      setMessage(msg, error.message, 'danger');
    }
  });
}

function availabilityBadgeText(status) {
  if (status === 'Available') return 'bg-success';
  if (status === 'Fully Booked') return 'bg-danger';
  return 'bg-secondary';
}

function renderVenueCard(venue) {
  const roomList = venue.rooms && venue.rooms.length
    ? venue.rooms.map(room => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${room.room_name}</strong>
            <div class="small text-muted">Room No: ${room.room_no} | Capacity: ${room.capacity}</div>
          </div>
          <span class="badge ${room.is_available ? 'text-bg-success' : 'text-bg-danger'}">${room.is_available ? 'Available' : 'Booked'}</span>
        </li>
      `).join('')
    : '<li class="list-group-item text-muted">No rooms available</li>';

  const amenities = venue.amenities && venue.amenities.length
    ? venue.amenities.map(a => `<span class="badge text-bg-light border me-1 mb-1">${a}</span>`).join('')
    : '<span class="text-muted">No amenities listed</span>';

  return `
    <div class="col-md-6 col-lg-4">
      <div class="card shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h5 class="card-title mb-1">${venue.name}</h5>
              <div class="text-muted small">${venue.city}, ${venue.state}</div>
            </div>
            <span class="badge ${availabilityBadgeText(venue.availability_status)}">${venue.availability_status}</span>
          </div>

          <hr>

          <p class="mb-1"><strong>Max Capacity:</strong> ${venue.max_capacity}</p>
          <p class="mb-1"><strong>Base Price:</strong> ₹${venue.base_rate_per_hour}/hour</p>
          <p class="mb-1"><strong>Owner:</strong> ${venue.owner.name}</p>
          <p class="mb-1"><strong>Owner Email:</strong> ${venue.owner.email}</p>
          <p class="mb-3"><strong>Owner Phone:</strong> ${venue.owner.phone}</p>

          <div class="mb-3">
            <strong class="d-block mb-2">Amenities</strong>
            <div>${amenities}</div>
          </div>

          <div>
            <strong class="d-block mb-2">Rooms</strong>
            <ul class="list-group list-group-flush border rounded">
              ${roomList}
            </ul>
          </div>

          <div class="mt-3 small text-muted">
            Available rooms: ${venue.available_room_count} / ${venue.room_count}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function searchVenues() {
  const results = qs('venueResults');
  const statusMsg = qs('statusMsg');

  if (!results) return;

  const city = qs('city') ? qs('city').value.trim() : '';
  const guests = qs('guests') ? qs('guests').value.trim() : '';
  const start = qs('start') ? qs('start').value.trim() : '';
  const end = qs('end') ? qs('end').value.trim() : '';

  if (!start || !end) {
    setMessage(statusMsg, 'Start and end date-time are required.', 'warning');
    results.innerHTML = '';
    return;
  }

  hideMessage(statusMsg);
  results.innerHTML = '<div class="col-12"><div class="alert alert-secondary">Searching venues...</div></div>';

  try {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (guests) params.set('guests', guests);
    params.set('start', start);
    params.set('end', end);

    const res = await fetch(`/api/venues?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Failed to fetch venues');

    if (!data.venues.length) {
      results.innerHTML = '<div class="col-12"><div class="alert alert-warning">No venues found for the selected filters.</div></div>';
      return;
    }

    results.innerHTML = data.venues.map(renderVenueCard).join('');
  } catch (error) {
    results.innerHTML = '';
    setMessage(statusMsg, error.message, 'danger');
  }
}

function setupSearchPage() {
  const searchForm = qs('searchForm');
  if (!searchForm) return;

  const savedCity = localStorage.getItem('hyperlocal_preferred_city') || '';
  const savedEventType = localStorage.getItem('hyperlocal_event_type') || '';

  if (qs('city')) qs('city').value = savedCity;
  if (qs('guests')) qs('guests').value = '';
  if (qs('eventType') && savedEventType) qs('eventType').value = savedEventType;

  const loadAllBtn = qs('loadAllBtn');
  if (loadAllBtn) {
    loadAllBtn.addEventListener('click', () => {
      if (qs('city')) qs('city').value = savedCity;
      if (qs('guests')) qs('guests').value = '';
      if (qs('start')) qs('start').value = '';
      if (qs('end')) qs('end').value = '';
      const results = qs('venueResults');
      if (results) results.innerHTML = '';
      const statusMsg = qs('statusMsg');
      hideMessage(statusMsg);
    });
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await searchVenues();
  });
}

submitSignupIfPresent();
setupSearchPage();
