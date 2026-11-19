import { CONFIG, FAQ_ITEMS } from './config.js';
import { formatVND, addItemToCart, updateCartQty, renderCartUI, openCartDrawer, closeCartDrawer, selectPayment, submitOrder } from './store.js';

let STORE_DATA = { products: [], news: [], policies: [], hero: null };
let FILTER_STATE = { search: '', category: 'ALL', minPrice: 0, maxPrice: null, sort: 'default', page: 1, perPage: 24 };
let CURRENT_PD = null;
let SELECTED_COLOR = null;
let SELECTED_SIZE = null;
let heroTimer = null;

function initStaticUI() {
  document.getElementById('faqList').innerHTML = FAQ_ITEMS.map((item, i) => `
    <div class="faq-item ${i === 0 ? 'open' : ''}">
      <button class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        <span>${item.q}</span><i class="fas fa-chevron-down"></i>
      </button>
      <div class="faq-a">${item.a}</div>
    </div>`).join('');

  startHeroSlider();
  renderCartUI();
}

function startHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dotsBox = document.getElementById('heroDots');
  if (!slides.length) return;
  dotsBox.innerHTML = Array.from(slides).map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" onclick="goHeroSlide(${i})"></button>`).join('');
  let idx = 0;
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    idx = (idx + 1) % slides.length;
    goHeroSlide(idx);
  }, 4500);
}

function goHeroSlide(idx) {
  document.querySelectorAll('.hero-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
  document.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

function loadStoreData() {
  const scriptId = 'dorryJsonpScript';
  const oldScript = document.getElementById(scriptId);
  if (oldScript) oldScript.remove();

  window.handleDorryData = function (json) {
    if (json.status === 'success') {
      STORE_DATA = json;
      renderAllSections();
    } else {
      showApiError(json.message);
    }
  };

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = CONFIG.API_URL + '?callback=handleDorryData';
  script.onerror = function () {
    fetch(CONFIG.API_URL, { method: 'GET', redirect: 'follow' })
      .then(res => res.json())
      .then(json => (json.status === 'success' ? ((STORE_DATA = json), renderAllSections()) : showApiError(json.message)))
      .catch(err => showApiError(err.toString()));
  };
  document.body.appendChild(script);
}

function showApiError(msg) {
  document.getElementById('bestSellerGrid').innerHTML = `
    <div style="grid-column:1/-1;text-align:center;background:#fff;padding:24px;border-radius:16px;border:1px solid rgba(200,109,81,0.3);">
      <p style="color:#c86d51;font-weight:700;margin-bottom:6px;">⚠️ Không thể tải dữ liệu sản phẩm</p>
      <p style="font-size:13px;color:#7A665E;">${msg}</p>
    </div>`;
}

function renderAllSections() {
  const products = STORE_DATA.products || [];

  if (STORE_DATA.hero?.images?.length) {
    const slider = document.getElementById('heroSlider');
    slider.innerHTML = STORE_DATA.hero.images.map((src, i) => `<img class="hero-slide ${i === 0 ? 'active' : ''}" src="${src}" alt="Banner Dorry ${i + 1}" />`).join('') + '<div class="hero-dots" id="heroDots"></div>';
    startHeroSlider();
  }

  const bestSellers = products.filter(p => p.section.includes('banchay') || p.badges.some(b => b.toLowerCase().includes('bán chạy')));
  document.getElementById('bestSellerGrid').innerHTML = (bestSellers.length ? bestSellers : products).slice(0, 8).map(renderProductCard).join('');

  const newArrivals = products.filter(p => p.section.includes('moive') || p.badges.some(b => b.toLowerCase().includes('mới')));
  document.getElementById('newArrivalGrid').innerHTML = (newArrivals.length ? newArrivals : products.slice(8)).slice(0, 8).map(renderProductCard).join('');

  const catSet = new Set();
  products.forEach(p => (p.categories || []).forEach(c => catSet.add(c)));
  document.getElementById('categoryChips').innerHTML =
    `<button class="chip-btn active" onclick="setCategoryFilter('ALL', this)">Tất cả (${products.length})</button>` +
    Array.from(catSet).slice(0, 8).map(c => `<button class="chip-btn" onclick="setCategoryFilter('${c.replace(/'/g, "\\'")}', this)">${c}</button>`).join('');

  applyCatalogFilters();

  document.getElementById('newsGrid').innerHTML = (STORE_DATA.news || []).slice(0, 6).map(n => `
    <article class="news-card" onclick="openArticleModal('${n.id}')">
      <img class="news-thumb" src="${n.image || 'https://w.ladicdn.com/5cdb79b830dba94fe2f5f09b/ktn-aigl-1263_7-20260507184704-64ews.jpg'}" alt="${n.title}" />
      <div class="news-body">
        <h3 class="news-title">${n.title}</h3>
        <p class="news-excerpt">${n.excerpt}</p>
      </div>
    </article>`).join('');
}

function renderProductCard(p) {
  const badgeHtml = !p.inStock
    ? `<span class="badge-tag soldout">Hết hàng</span>`
    : (p.badges || []).slice(0, 2).map(b => `<span class="badge-tag ${b.toLowerCase().includes('bán chạy') ? 'hot' : ''}">${b}</span>`).join('');
  const colorCount = (p.colors || []).length;
  return `
    <div class="aigl-molecule-02-media-card">
      <div class="card-media" onclick="openProductModal('${p.id}')">
        <div class="card-badges">${badgeHtml}</div>
        <img src="${p.image}" alt="${p.name}" loading="lazy" />
        ${p.videoUrl ? `<span class="video-pill"><i class="fas fa-play"></i> Video</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title" onclick="openProductModal('${p.id}')">${p.name}</div>
        <div class="card-variants-hint">${colorCount ? colorCount + ' phân loại màu sắc' : 'Chính hãng Dorry Home'}</div>
        <div class="card-price-row">
          <span class="price-sale">${formatVND(p.priceSale)}</span>
          ${p.priceOriginal > p.priceSale ? `<span class="price-orig">${formatVND(p.priceOriginal)}</span>` : ''}
        </div>
        <button class="card-btn" onclick="openProductModal('${p.id}')"><i class="fas fa-eye"></i> Xem Chi Tiết</button>
      </div>
    </div>`;
}

function setCategoryFilter(cat, btn) {
  FILTER_STATE.category = cat;
  FILTER_STATE.page = 1;
  document.querySelectorAll('#categoryChips .chip-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyCatalogFilters();
}

function setPriceFilter(min, max, btn) {
  FILTER_STATE.minPrice = min;
  FILTER_STATE.maxPrice = max;
  FILTER_STATE.page = 1;
  document.querySelectorAll('#priceChips .chip-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyCatalogFilters();
}

function applyCatalogFilters() {
  FILTER_STATE.search = document.getElementById('catalogSearch').value.trim().toLowerCase();
  FILTER_STATE.sort = document.getElementById('catalogSort').value;

  let list = (STORE_DATA.products || []).filter(p => {
    if (FILTER_STATE.search && !p.name.toLowerCase().includes(FILTER_STATE.search)) return false;
    if (FILTER_STATE.category !== 'ALL' && !(p.categories || []).includes(FILTER_STATE.category)) return false;
    if (p.priceSale < FILTER_STATE.minPrice) return false;
    if (FILTER_STATE.maxPrice !== null && p.priceSale > FILTER_STATE.maxPrice) return false;
    return true;
  });

  if (FILTER_STATE.sort === 'price_asc') list.sort((a, b) => a.priceSale - b.priceSale);
  if (FILTER_STATE.sort === 'price_desc') list.sort((a, b) => b.priceSale - a.priceSale);

  const start = (FILTER_STATE.page - 1) * FILTER_STATE.perPage;
  const paged = list.slice(start, start + FILTER_STATE.perPage);
  document.getElementById('catalogGrid').innerHTML = paged.length
    ? paged.map(renderProductCard).join('')
    : '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);">Không tìm thấy sản phẩm phù hợp bộ lọc.</p>';

  const totalPages = Math.ceil(list.length / FILTER_STATE.perPage);
  document.getElementById('catalogPagination').innerHTML = totalPages > 1
    ? Array.from({ length: totalPages }, (_, i) => `<button class="btn ${FILTER_STATE.page === i + 1 ? 'btn-primary' : 'btn-secondary'}" style="padding:8px 15px;margin:0 4px;" onclick="changeCatalogPage(${i + 1})">${i + 1}</button>`).join('')
    : '';
}

function changeCatalogPage(p) {
  FILTER_STATE.page = p;
  applyCatalogFilters();
}

function openProductModal(id) {
  const p = (STORE_DATA.products || []).find(item => item.id === id);
  if (!p) return;
  CURRENT_PD = p;
  SELECTED_COLOR = p.colors?.length ? p.colors[0] : null;
  SELECTED_SIZE = p.sizes?.length ? p.sizes[0] : null;

  if (window.fbq) window.fbq('track', 'ViewContent', { content_name: p.name, value: p.priceSale, currency: 'VND' });
  renderProductModalContent();
  document.getElementById('productModal').classList.add('open');
}

function renderProductModalContent() {
  const p = CURRENT_PD;
  const activeImg = SELECTED_COLOR?.image || p.image;
  const activePrice = SELECTED_SIZE?.price > 0 ? SELECTED_SIZE.price : p.priceSale;

  document.getElementById('productModalBody').innerHTML = `
    <div>
      <img src="${activeImg}" alt="${p.name}" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;border:1px solid var(--border-soft);" />
      ${p.videoUrl ? `<a href="${p.videoUrl}" target="_blank" class="btn btn-secondary" style="width:100%;margin-top:12px;"><i class="fab fa-youtube" style="color:red;"></i> Xem Video Review Thực Tế</a>` : ''}
    </div>
    <div>
      <h2 style="font-family:var(--font-display);font-size:26px;margin-bottom:8px;">${p.name}</h2>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;">
        <span style="font-size:24px;font-weight:700;color:var(--accent-terracotta);">${formatVND(activePrice)}</span>
        ${p.priceOriginal > activePrice ? `<span class="price-orig">${formatVND(p.priceOriginal)}</span>` : ''}
      </div>
      ${p.colors.length ? `
        <div style="margin-bottom:14px;">
          <strong style="font-size:13px;">Màu sắc: <span style="color:var(--accent-terracotta);">${SELECTED_COLOR.name}</span></strong>
          <div class="variant-pills">${p.colors.map((c, idx) => `<button class="v-pill ${SELECTED_COLOR.name === c.name ? 'active' : ''}" onclick="selectPdColor(${idx})">${c.name}</button>`).join('')}</div>
        </div>` : ''}
      ${p.sizes.length ? `
        <div style="margin-bottom:14px;">
          <strong style="font-size:13px;">Kích thước: <span style="color:var(--accent-terracotta);">${SELECTED_SIZE.name}</span></strong>
          <div class="variant-pills">${p.sizes.map((s, idx) => `<button class="v-pill ${SELECTED_SIZE.name === s.name ? 'active' : ''}" onclick="selectPdSize(${idx})">${s.name}</button>`).join('')}</div>
        </div>` : ''}
      <div style="margin-bottom:18px;display:flex;align-items:center;gap:12px;">
        <strong style="font-size:13px;">Số lượng:</strong>
        <input type="number" id="pdQty" value="1" min="1" max="99" style="width:76px;padding:8px;border-radius:8px;border:1px solid var(--border-soft);text-align:center;" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
        <button class="btn btn-secondary" ${!p.inStock ? 'disabled' : ''} onclick="handleAddCart(false)">🛒 Thêm vào giỏ</button>
        <button class="btn btn-primary" ${!p.inStock ? 'disabled' : ''} onclick="handleAddCart(true)">⚡ Mua ngay</button>
      </div>
      <div style="background:var(--bg-primary);padding:14px;border-radius:12px;font-size:13.5px;white-space:pre-line;max-height:200px;overflow-y:auto;">${p.details || p.shortDesc}</div>
    </div>`;
}

function handleAddCart(buyNow) {
  const p = CURRENT_PD;
  const qty = Math.max(1, parseInt(document.getElementById('pdQty').value || '1', 10));
  const color = SELECTED_COLOR ? SELECTED_COLOR.name : '';
  const size = SELECTED_SIZE ? SELECTED_SIZE.name : '';
  const price = SELECTED_SIZE?.price > 0 ? SELECTED_SIZE.price : p.priceSale;
  const image = SELECTED_COLOR?.image || p.image;

  closeProductModal();
  addItemToCart({ key: `${p.id}__${color}__${size}`, id: p.id, name: p.name, color, size, price, image, qty }, buyNow);
}

function openArticleModal(id) {
  const art = (STORE_DATA.news || []).find(n => n.id === id);
  if (!art) return;
  document.getElementById('contentModalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:24px;margin-bottom:12px;">${art.title}</h2>
    ${art.image ? `<img src="${art.image}" style="width:100%;max-height:340px;object-fit:cover;border-radius:14px;margin-bottom:16px;" />` : ''}
    <div style="white-space:pre-line;font-size:14.5px;line-height:1.75;">${art.content || art.excerpt}</div>`;
  document.getElementById('contentModal').classList.add('open');
}

function openPolicyModal(slug) {
  const pol = (STORE_DATA.policies || []).find(p => p.slug === slug);
  const titleMap = {
    'chinh-sach-bao-mat': 'Chính sách Bảo mật & Xử lý Dữ liệu Cá nhân',
    'dieu-khoan-dich-vu': 'Điều khoản Dịch vụ',
    'chinh-sach-ban-hang': 'Chính sách Bán hàng, Đổi trả & Bảo hành',
    'huong-dan-thanh-toan': 'Hướng dẫn Thanh toán & Phương thức Đặt hàng'
  };
  document.getElementById('contentModalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:22px;margin-bottom:12px;">${pol ? pol.title : (titleMap[slug] || 'Chính sách Dorry Home')}</h2>
    <div style="white-space:pre-line;font-size:14px;line-height:1.75;">${pol ? (pol.content || pol.excerpt) : 'Áp dụng cho toàn bộ đơn hàng tại website chính thức gagoidorry.com của Hộ kinh doanh Shop Dorry Store Số 1.'}</div>`;
  document.getElementById('contentModal').classList.add('open');
}

function closeProductModal() { document.getElementById('productModal').classList.remove('open'); }
function closeContentModal() { document.getElementById('contentModal').classList.remove('open'); }

Object.assign(window, {
  goHeroSlide, setCategoryFilter, setPriceFilter, applyCatalogFilters, changeCatalogPage,
  openProductModal, closeProductModal,
  selectPdColor: idx => { SELECTED_COLOR = CURRENT_PD.colors[idx]; renderProductModalContent(); },
  selectPdSize: idx => { SELECTED_SIZE = CURRENT_PD.sizes[idx]; renderProductModalContent(); },
  handleAddCart, updateCartQty, openCartDrawer, closeCartDrawer,
  selectPayment, submitOrder, openArticleModal, openPolicyModal, closeContentModal
});

initStaticUI();
loadStoreData();