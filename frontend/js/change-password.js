document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('changePasswordForm');
  const errorEl = document.getElementById('error');
  const messageEl = document.getElementById('message');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorEl.textContent = '';
    messageEl.textContent = '';

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
      errorEl.textContent = 'New passwords do not match';
      return;
    }

    try {
      const response = await window.csrfFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Change password failed');
      }

      messageEl.textContent = data.message || 'Password changed';
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1200);
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
});
