import { CONFIG } from './config.js';

export let CART = JSON.parse(localStorage.getItem(CONFIG.CART_STORAGE_KEY) || '[]');
let PAYMENT_METHOD = 'cod';

export function formatVND(n) {
  return Number(n || 0).toLocaleString('vi-VN') + ' đ';
}

export function saveCart() {
  localStorage.setItem(CONFIG.CART_STORAGE_KEY, JSON.stringify(CART));
  renderCartUI();
}

export function addItemToCart(item, buyNow = false) {
  const existing = CART.find(i => i.key === item.key);
  if (existing) existing.qty += item.qty;
  else CART.push(item);

  saveCart();
  if (window.fbq) {
    window.fbq('track', 'AddToCart', { content_name: item.name, value: item.price * item.qty, currency: 'VND' });
  }

  if (buyNow) {
    document.getElementById('section-33-checkout-form').scrollIntoView({ behavior: 'smooth' });
  } else {
    openCartDrawer();
  }
}

export function updateCartQty(idx, delta) {
  CART[idx].qty += delta;
  if (CART[idx].qty <= 0) CART.splice(idx, 1);
  saveCart();
}

export function renderCartUI() {
  const totalQty = CART.reduce((s, i) => s + i.qty, 0);
  const subtotal = CART.reduce((s, i) => s + i.price * i.qty, 0);

  document.getElementById('headerCartBadge').textContent = totalQty;
  document.getElementById('drawerSubtotal').textContent = formatVND(subtotal);
  document.getElementById('coSubtotal').textContent = formatVND(subtotal);
  document.getElementById('coTotal').textContent = formatVND(subtotal);

  const emptyMsg = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Giỏ hàng đang trống. Hãy chọn sản phẩm bên trên nhé!</p>';

  document.getElementById('drawerCartItems').innerHTML = CART.length
    ? CART.map((item, idx) => `
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-soft);">
        <img src="${item.image}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;" />
        <div style="flex:1;font-size:13.5px;">
          <strong>${item.name}</strong>
          <div style="color:var(--text-muted);font-size:12px;">${[item.color, item.size].filter(Boolean).join(' • ')}</div>
          <div style="color:var(--accent-terracotta);font-weight:700;">${formatVND(item.price)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button onclick="updateCartQty(${idx},-1)" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border-soft);cursor:pointer;">-</button>
          <span>${item.qty}</span>
          <button onclick="updateCartQty(${idx},1)" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border-soft);cursor:pointer;">+</button>
        </div>
      </div>`).join('')
    : emptyMsg;

  document.getElementById('checkoutItemsList').innerHTML = CART.length
    ? CART.map(item => `
      <div class="checkout-item">
        <div>
          <strong>${item.name}</strong>
          <div style="font-size:12px;color:var(--text-muted);">${[item.color, item.size].filter(Boolean).join(' • ')} × ${item.qty}</div>
        </div>
        <strong>${formatVND(item.price * item.qty)}</strong>
      </div>`).join('')
    : emptyMsg;
}

export function openCartDrawer() {
  document.getElementById('cartDrawer').classList.add('open');
}

export function closeCartDrawer() {
  document.getElementById('cartDrawer').classList.remove('open');
}

export function selectPayment(method, el) {
  PAYMENT_METHOD = method;
  document.querySelectorAll('.pay-option').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
}

export async function submitOrder(e) {
  e.preventDefault();
  if (!CART.length) {
    alert('Vui lòng thêm ít nhất 1 sản phẩm vào giỏ hàng trước khi đặt hàng!');
    return;
  }

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi đơn hàng...';

  const total = CART.reduce((s, i) => s + i.price * i.qty, 0);
  const urlParams = new URLSearchParams(window.location.search);
  const channel = urlParams.get('utm_source') || (window.location.pathname.includes('tiktok') ? 'tiktok' : window.location.pathname.includes('google') ? 'google' : 'website');

  const payload = {
    fullname: document.getElementById('coFullname').value.trim(),
    phone: document.getElementById('coPhone').value.trim(),
    address: document.getElementById('coAddress').value.trim(),
    note: document.getElementById('coNote').value.trim(),
    paymentMethod: PAYMENT_METHOD,
    items: CART,
    total: total,
    channel: channel,
    pageUrl: window.location.href,
    userAgent: navigator.userAgent
  };

  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === 'success') {
      if (window.fbq) window.fbq('track', 'Purchase', { value: total, currency: 'VND', order_id: result.orderId });
      if (window.gtag) window.gtag('event', 'conversion', { send_to: CONFIG.GOOGLE_ADS_CONVERSION_ID, value: total, currency: 'VND', transaction_id: result.orderId });
      if (window.ttq) window.ttq.track('PlaceAnOrder', { value: total, currency: 'VND' });

      const box = document.getElementById('orderResultBox');
      box.style.display = 'block';
      box.innerHTML = `
        <div style="background:#ecfdf5;border:1px solid #10b981;color:#065f46;padding:18px;border-radius:14px;">
          <strong style="font-size:16px;">🎉 Đặt hàng thành công! Mã đơn: ${result.orderId}</strong>
          <p style="margin-top:6px;font-size:13.5px;">Cảm ơn anh/chị <b>${payload.fullname}</b>. Dorry Home sẽ liên hệ SĐT <b>${payload.phone}</b> để xác nhận đơn trong thời gian sớm nhất.</p>
        </div>`;

      CART = [];
      saveCart();
      document.getElementById('checkoutForm').reset();
    } else {
      alert('Có lỗi khi tạo đơn: ' + (result.message || 'Vui lòng thử lại'));
    }
  } catch (err) {
    alert(`Lỗi kết nối máy chủ đặt hàng. Vui lòng thử lại hoặc gọi hotline ${CONFIG.HOTLINE}.`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🛒 Xác nhận đặt hàng';
  }
}