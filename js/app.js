import { CONFIG, FAQ_ITEMS } from './config.js';
import { formatVND, addItemToCart, updateCartQty, renderCartUI, openCartDrawer, closeCartDrawer, selectPayment, submitOrder } from './store.js';

const CACHE_KEY = 'DORRY_STORE_CACHE_V1';
let STORE_DATA = { products: [], news: [], policies: [], hero: null };
let FILTER_STATE = { search: '', category: 'ALL', minPrice: 0, maxPrice: null, sort: 'default', page: 1, perPage: 12 };
let CURRENT_PD = null;
let SELECTED_COLOR = null;
let SELECTED_SIZE = null;
let heroTimer = null;
let pdCountdownTimer = null;
let HAS_HANDLED_INITIAL_URL = false;

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
  const cachedRaw = localStorage.getItem(CACHE_KEY);
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.products && parsed.products.length) {
        STORE_DATA = parsed;
        renderAllSections();
      }
    } catch (e) {}
  }

  const scriptId = 'dorryJsonpScript';
  const oldScript = document.getElementById(scriptId);
  if (oldScript) oldScript.remove();

  window.handleDorryData = function (json) {
    if (json.status === 'success') {
      const newStr = JSON.stringify(json);
      if (newStr !== cachedRaw) {
        STORE_DATA = json;
        localStorage.setItem(CACHE_KEY, newStr);
        renderAllSections();
      }
    } else if (!cachedRaw) {
      showApiError(json.message);
    }
  };

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = CONFIG.API_URL + '?callback=handleDorryData';
  script.onerror = function () {
    fetch(CONFIG.API_URL, { method: 'GET', redirect: 'follow' })
      .then(res => res.json())
      .then(json => {
        if (json.status === 'success') {
          STORE_DATA = json;
          localStorage.setItem(CACHE_KEY, JSON.stringify(json));
          renderAllSections();
        } else if (!cachedRaw) {
          showApiError(json.message);
        }
      })
      .catch(err => { if (!cachedRaw) showApiError(err.toString()); });
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

function checkProductFromUrl() {
  if (HAS_HANDLED_INITIAL_URL) return;
  const params = new URLSearchParams(window.location.search);
  const queryProduct = (params.get('product') || params.get('sp') || '').trim().toLowerCase();
  if (!queryProduct) return;

  const found = (STORE_DATA.products || []).find(p => {
    const pSlug = String(p.slug || p.shortUrl || '').trim().toLowerCase();
    const pId = String(p.id || '').trim().toLowerCase();
    return pSlug === queryProduct || pId === queryProduct;
  });

  if (found) {
    HAS_HANDLED_INITIAL_URL = true;
    openProductModal(found.id, false);
  }
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
      <img class="news-thumb" loading="lazy" decoding="async" src="${n.image || 'https://w.ladicdn.com/5cdb79b830dba94fe2f5f09b/ktn-aigl-1263_7-20260507184704-64ews.jpg'}" alt="${n.title}" />
      <div class="news-body">
        <h3 class="news-title">${n.title}</h3>
        <p class="news-excerpt">${n.excerpt}</p>
      </div>
    </article>`).join('');

  checkProductFromUrl();
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
        <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async" />
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

function openProductModal(id, updateUrl = true) {
  const p = (STORE_DATA.products || []).find(item => String(item.id) === String(id));
  if (!p) return;
  CURRENT_PD = p;
  SELECTED_COLOR = p.colors?.length ? p.colors[0] : null;
  SELECTED_SIZE = p.sizes?.length ? p.sizes[0] : null;

  const productSlug = p.slug || p.shortUrl || p.id;
  if (updateUrl && productSlug) {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('product', productSlug);
    window.history.replaceState({}, '', newUrl.toString());
  }
  document.title = `${p.name} | Dorry Home`;

  if (window.fbq) window.fbq('track', 'ViewContent', { content_name: p.name, value: p.priceSale, currency: 'VND' });
  renderProductModalContent();
  const modal = document.getElementById('productModal');
  modal.classList.add('open');
  modal.querySelector('.modal-box').scrollTop = 0;
}

function copyProductShareLink(slug) {
  const shareUrl = `${window.location.origin}/?product=${encodeURIComponent(slug)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    const btn = document.getElementById('copyPdLinkBtn');
    if (btn) {
      btn.innerHTML = '✅ Đã copy link sản phẩm!';
      setTimeout(() => { btn.innerHTML = '🔗 Copy link sản phẩm này'; }, 2000);
    }
  });
}

// Đọc chuỗi đánh giá từ Cột T (dạng: Tên|Số sao|Nội dung)
function parseProductReviews(rawReviews) {
  if (!rawReviews) return [];
  if (Array.isArray(rawReviews)) return rawReviews;
  return String(rawReviews).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split('|');
    return {
      author: (parts[0] || 'Khách hàng Dorry').trim(),
      rating: Math.min(5, Math.max(1, parseInt(parts[1] || '5', 10) || 5)),
      comment: (parts.slice(2).join('|') || '').trim()
    };
  }).filter(r => r.comment);
}

// Tìm các sản phẩm liên quan từ Cột V (dạng: 6, 7, 8, 9...)
function getRelatedProducts(p) {
  const raw = p.relatedProducts || p.related || '';
  const all = STORE_DATA.products || [];
  if (!raw) return all.filter(item => String(item.id) !== String(p.id)).slice(0, 4);

  const ids = Array.isArray(raw)
    ? raw.map(x => String(x).trim())
    : String(raw).split(/[,;|]+/).map(x => x.trim()).filter(Boolean);

  const matched = ids.map(id => all.find(item => String(item.id) === id || String(item.slug) === id)).filter(Boolean);
  return matched.length ? matched.slice(0, 4) : all.filter(item => String(item.id) !== String(p.id)).slice(0, 4);
}

// Khởi chạy đồng hồ đếm ngược khuyến mãi từ Cột U
function startPdCountdown(rawEnd) {
  if (pdCountdownTimer) clearInterval(pdCountdownTimer);
  const box = document.getElementById('pdCountdownBox');
  if (!box || !rawEnd) return;

  let targetTime = Date.parse(rawEnd);
  if (isNaN(targetTime)) {
    const hours = parseFloat(rawEnd);
    targetTime = Date.now() + ((hours > 0 ? hours : 4) * 3600 * 1000);
  }

  const tick = () => {
    const diff = targetTime - Date.now();
    if (diff <= 0) {
      box.style.display = 'none';
      clearInterval(pdCountdownTimer);
      return;
    }
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const timeEl = document.getElementById('pdCountdownText');
    if (timeEl) timeEl.textContent = `${h} giờ : ${m} phút : ${s} giây`;
  };
  tick();
  pdCountdownTimer = setInterval(tick, 1000);
}

function renderProductModalContent() {
  const p = CURRENT_PD;
  const activeImg = SELECTED_COLOR?.image || p.image;
  const activePrice = SELECTED_SIZE?.price > 0 ? SELECTED_SIZE.price : p.priceSale;
  const productSlug = p.slug || p.shortUrl || p.id;
  const reviews = parseProductReviews(p.reviews);
  const relatedList = getRelatedProducts(p);
  const hasCountdown = Boolean(p.countdown || p.promoEnd);

  document.getElementById('productModalBody').innerHTML = `
    <div>
      <img src="${activeImg}" alt="${p.name}" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;border:1px solid var(--border-soft);" />
      ${p.videoUrl ? `<a href="${p.videoUrl}" target="_blank" class="btn btn-secondary" style="width:100%;margin-top:12px;"><i class="fab fa-youtube" style="color:red;"></i> Xem Video Review Thực Tế</a>` : ''}
      <button id="copyPdLinkBtn" onclick="copyProductShareLink('${productSlug}')" class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:13px;">🔗 Copy link sản phẩm này</button>
    </div>
    <div>
      <h2 style="font-family:var(--font-display);font-size:26px;margin-bottom:8px;">${p.name}</h2>
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;">
        <span style="font-size:24px;font-weight:700;color:var(--accent-terracotta);">${formatVND(activePrice)}</span>
        ${p.priceOriginal > activePrice ? `<span class="price-orig">${formatVND(p.priceOriginal)}</span>` : ''}
      </div>
      ${hasCountdown ? `
        <div id="pdCountdownBox" style="background:linear-gradient(135deg,#fff5f2,#ffece6);border:1px solid rgba(200,109,81,0.35);padding:10px 14px;border-radius:12px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;font-size:13px;">
          <span style="color:var(--accent-terracotta);font-weight:700;">🔥 Ưu đãi kết thúc sau:</span>
          <strong id="pdCountdownText" style="color:#b91c1c;font-variant-numeric:tabular-nums;">-- : -- : --</strong>
        </div>` : ''}
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
    </div>

    ${reviews.length ? `
      <div style="grid-column:1/-1;border-top:1px solid var(--border-soft);padding-top:20px;">
        <h3 style="font-size:16px;margin-bottom:12px;">⭐ Đánh giá từ khách hàng đã mua (${reviews.length})</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
          ${reviews.map(r => `
            <div style="background:var(--bg-primary);padding:12px 14px;border-radius:12px;border:1px solid var(--border-soft);font-size:13px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <strong>${r.author}</strong>
                <span style="color:#f59e0b;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              <p style="color:var(--text-muted);line-height:1.5;">${r.comment}</p>
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${relatedList.length ? `
      <div style="grid-column:1/-1;border-top:1px solid var(--border-soft);padding-top:20px;">
        <h3 style="font-size:16px;margin-bottom:14px;">✨ Sản phẩm gợi ý mua kèm</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:14px;">
          ${relatedList.map(rel => `
            <div onclick="openProductModal('${rel.id}')" style="background:var(--bg-primary);border-radius:12px;overflow:hidden;border:1px solid var(--border-soft);cursor:pointer;">
              <img src="${rel.image}" alt="${rel.name}" style="width:100%;aspect-ratio:1/1;object-fit:cover;" />
              <div style="padding:10px;">
                <div style="font-size:13px;font-weight:600;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${rel.name}</div>
                <div style="font-size:13.5px;font-weight:700;color:var(--accent-terracotta);">${formatVND(rel.priceSale)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
  `;

  if (hasCountdown) startPdCountdown(p.countdown || p.promoEnd);
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

function closeProductModal() {
  if (pdCountdownTimer) clearInterval(pdCountdownTimer);
  document.getElementById('productModal').classList.remove('open');
  const newUrl = new URL(window.location.href);
  if (newUrl.searchParams.has('product')) {
    newUrl.searchParams.delete('product');
    window.history.replaceState({}, '', newUrl.toString());
  }
  document.title = 'Dorry Home - Chăn Ga Gối Nệm Cao Cấp | 13 Năm Uy Tín';
}

function closeContentModal() { document.getElementById('contentModal').classList.remove('open'); }

Object.assign(window, {
  goHeroSlide, setCategoryFilter, setPriceFilter, applyCatalogFilters, changeCatalogPage,
  openProductModal, closeProductModal, copyProductShareLink,
  selectPdColor: idx => { SELECTED_COLOR = CURRENT_PD.colors[idx]; renderProductModalContent(); },
  selectPdSize: idx => { SELECTED_SIZE = CURRENT_PD.sizes[idx]; renderProductModalContent(); },
  handleAddCart, updateCartQty, openCartDrawer, closeCartDrawer,
  selectPayment, submitOrder, openArticleModal, openPolicyModal, closeContentModal
});

initStaticUI();
loadStoreData();