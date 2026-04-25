document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('error');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorEl.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const response = await window.csrfFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.user && data.user.is_admin === 1) {
        window.location.href = '/admin';
      } else {
        window.location.href = '/home.html';
      }
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
});
