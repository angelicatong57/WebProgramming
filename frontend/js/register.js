document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('registerForm');
  const errorEl = document.getElementById('error');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorEl.textContent = '';

    const user_name = document.getElementById('userName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!user_name) {
      errorEl.textContent = 'Please enter a user name';
      return;
    }

    if (password !== confirmPassword) {
      errorEl.textContent = 'Passwords do not match';
      return;
    }

    try {
      const response = await window.csrfFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name, email, password, confirmPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Register failed');
      }

      window.location.href = '/login.html';
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
});
